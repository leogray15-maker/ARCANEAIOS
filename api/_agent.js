/**
 * The agent contract, in one place.
 *
 *   1. read authoritative state from the tables — never from the caller
 *   2. say what the data cannot say
 *   3. open a run, with what was read on it
 *   4. reason (the model), in a structured shape
 *   5. write proposals down as `proposed` orders — never act
 *   6. close the run with the result, or the failure
 *
 * `api/intel.js` did this first for CIPHER; TALLY, MERIDIAN and VECTOR do
 * it through here so there is one contract and not three. A run with
 * `dry: true`, or one made on a day the model cannot answer, still reads
 * and still records: the agent's reading of the state is real whether or
 * not its reasoning ran, and the room shows it either way.
 */
import { json, client, db as openDb, systemContext, modelFailure, MODEL, withRetry } from './_lib.js';
import { state } from '../packages/database/src/state.js';
import { runs, nextId } from '../packages/database/src/content.js';

const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * Write proposals down as `proposed` orders and hand back their ids. Nothing
 * is executed and nothing enters the queue: the operator approves or kills
 * each one. Words already on the board are skipped rather than repeated,
 * or a daily run would propose the same thing every morning.
 */
export async function propose(d, items, { agent, holder, runId, actor = agent }) {
  const existing = await state.list(d, 'orders').catch(() => []);
  const seen = new Set(existing.filter((o) => !['done', 'killed'].includes(o.state)).map((o) => `${o.room}::${String(o.text).trim().toLowerCase()}`));
  const out = [];
  for (const item of items || []) {
    const p = item?.proposal || item;
    if (!p?.room || !p?.text) { out.push(null); continue; }
    const key = `${p.room}::${String(p.text).trim().toLowerCase()}`;
    if (seen.has(key)) { out.push(null); continue; }
    try {
      const row = await state.insert(d, 'orders', {
        room: p.room, text: p.text, priority: typeof p.priority === 'number' ? p.priority : (PRIORITY[p.priority] ?? 2),
        state: 'proposed', actor: 'agent', agent, holder, source: 'agent', source_id: runId,
        note: p.why || [item.headline, item.detail, item.source ? `Source: ${item.source}` : ''].filter(Boolean).join('\n\n'),
      }, { actor });
      seen.add(key);
      out.push(row.id);
    } catch { out.push(null); }   // a refused proposal is not a failed run
  }
  return out;
}

/**
 * Run one agent end to end. `spec`:
 *   agent, holder, prefix  — 'tally', 'TALLY', 'TAL'
 *   skill, objective       — for the run record
 *   evidence(d, {now})     — { facts, problems, sources, brief }
 *   instructions           — the agent's own standing orders, after the empire's context
 *   schema                 — the structured output
 *   effort, maxTokens
 *   proposals(out)         — which part of the output is the proposals list
 */
export async function agentRun(req, res, auth, spec, { d = null, c = undefined, now = new Date() } = {}) {
  const dd = d || openDb();
  const model = c === undefined ? client() : c;
  const { question = '', context = {}, dry = false } = req.body || {};
  const wantDry = dry === true || req.query?.dry === '1';

  // 1–2. Read, and say what cannot be said.
  const ev = await spec.evidence(dd, { now });

  // 3. The run, with the reading on it.
  const runId = await nextId(dd, 'agent_runs', `${spec.prefix}-R`, now);
  await runs.start(dd, { id: runId, agent: spec.holder, skill: spec.skill, objective: question || spec.objective, model: wantDry ? '' : MODEL, input: { facts: ev.facts, problems: ev.problems, question }, sources: ev.sources, device: auth?.device || '' });

  const evidenceOnly = (status, error = '') => ({ run: runId, agent: spec.holder, status, error, evidence: ev.facts, problems: ev.problems, sources: ev.sources, asOf: now.toISOString() });

  if (wantDry) {
    await runs.finish(dd, runId, { status: 'evidence', output: { read_only: true } });
    return json(res, 200, evidenceOnly('evidence'));
  }
  if (!model) {
    const error = 'the reasoning layer is not wired: set ANTHROPIC_API_KEY in the Vercel project';
    await runs.finish(dd, runId, { status: 'failed', error });
    return json(res, 503, { error, ...evidenceOnly('failed', error) });
  }

  // 4. Reason.
  try {
    const system = [
      { type: 'text', text: systemContext(context), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `${spec.instructions}\n\nStanding rules for every reading: every number you cite must appear in the evidence below, verbatim or as an arithmetic of figures that do; never invent a figure, a date or a cause. Where the evidence says the data cannot say something, say so rather than filling it in. A proposal is the smallest next action routed to one room, and it is a proposal only — nothing here executes. No medical, dosing or treatment claim about any compound, ever.` },
    ];
    const user = `${question ? `The operator asks: ${question}\n\n` : ''}What the tables say now:\n\n${ev.brief}`;
    // A rate limit or a transient overload is retried, bounded, with
    // backoff; anything else (no credits, a bad key, a bad request) is not
    // — retrying those changes nothing (packages/database/src/resilience.js).
    const r = await withRetry((attempt) => {
      if (attempt) runs.heartbeat(dd, runId, `retrying after a transient failure (attempt ${attempt + 1})`).catch(() => {});
      return model.messages.create({ model: MODEL, max_tokens: spec.maxTokens || 6000, system, messages: [{ role: 'user', content: user }], thinking: { type: 'adaptive' }, output_config: { effort: spec.effort || 'medium', format: { type: 'json_schema', schema: spec.schema } } });
    }, { maxAttempts: 3, baseMs: 2000 });
    if (r.stop_reason === 'refusal') {
      await runs.finish(dd, runId, { status: 'refused', error: 'the model refused the reading' });
      return json(res, 200, { ...evidenceOnly('refused'), summary: `${spec.holder} will not read that one.` });
    }
    const out = JSON.parse(r.content.find((b) => b.type === 'text')?.text || '{}');
    const usage = { in: r.usage.input_tokens, out: r.usage.output_tokens, cached: r.usage.cache_read_input_tokens || 0 };

    // 5. Proposals are written down, never acted on.
    const list = spec.proposals ? spec.proposals(out) : (out.proposals || []);
    const ids = await propose(dd, list, { agent: spec.agent, holder: spec.holder, runId });
    const proposed = ids.filter(Boolean);

    // 6. The result, on the run.
    await runs.finish(dd, runId, { status: 'ok', usage, output: { ...out, proposed, problems: ev.problems } });
    return json(res, 200, { run: runId, agent: spec.holder, status: 'ok', ...out, proposed, evidence: ev.facts, problems: ev.problems, sources: ev.sources, asOf: now.toISOString(), usage });
  } catch (e) {
    const { status, error } = modelFailure(e);
    await runs.finish(dd, runId, { status: 'failed', error }).catch(() => {});
    return json(res, status, { error, ...evidenceOnly('failed', error) });
  }
}

/** The proposal shape every agent's schema shares. */
export const PROPOSAL_SCHEMA = {
  type: 'array', maxItems: 5, description: 'The smallest next actions, if any are warranted, each routed to one room. Most readings warrant one or none.',
  items: { type: 'object', additionalProperties: false, properties: {
    room: { type: 'string' }, text: { type: 'string', description: 'The order, in one line, as it will appear on the board.' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, why: { type: 'string', description: 'The reason, citing the figure in the evidence that warrants it.' },
  }, required: ['room', 'text', 'priority', 'why'] },
};
