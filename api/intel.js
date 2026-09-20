/**
 * CIPHER — the watch.
 *
 * POST { code, context, question? } → { run, items, summary, sources, asOf }
 *
 * The one endpoint that looks outside the building. Everything else in
 * THE ARCANE reasons over what Leo already knows; this reads the open web
 * through Anthropic's server-side search tool and returns the daily
 * intelligence in CIPHER's four kinds: opportunity, threat, signal,
 * action.
 *
 * The watchlist is the operator's, not the model's — CIPHER researches
 * what Leo put on it in THE INTELLIGENCE and nothing else, and the server
 * reads that list itself rather than trusting the caller's copy. It holds
 * `analyse` on data and `recommend` at most: it reports and proposes, and
 * every item lands as something to read, never something done.
 *
 * Every run is recorded in `agent_runs` like HERALD's, so THE RECORDS and
 * THE CONTROL ROOM show the watch beside every other agent, and the room
 * reads its latest run back from there instead of keeping one in a blob.
 */
import { json, guard, db, client, systemContext, modelFailure, MODEL, ROOM_LIST } from './_lib.js';
import { state } from '../packages/database/src/state.js';
import { runs, nextId } from '../packages/database/src/content.js';
import { propose } from './_agent.js';

const KINDS = ['opportunity', 'threat', 'signal', 'action'];

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    items: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: KINDS },
          headline: { type: 'string', description: 'One line. What changed, in Leo\'s register — plain, specific, no hedging.' },
          detail: { type: 'string', description: 'Two or three sentences: what it is, why it matters to one of the ventures by name, what it does not mean.' },
          watching: { type: 'string', description: 'The watchlist entry this came from, verbatim, or empty if it came from the brief.' },
          source: { type: 'string', description: 'The publication or site the claim came from, and the date if the page carried one. Empty if the search did not produce one.' },
          confidence: { type: 'string', enum: ['confirmed', 'reported', 'rumour'] },
          proposal: { type: ['object', 'null'], additionalProperties: false, description: 'The smallest next action, if one is warranted. Null when the right response is to keep watching.',
            properties: { room: { type: 'string', enum: ROOM_LIST.map((r) => r.id) }, text: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] } },
            required: ['room', 'text', 'priority'] },
        },
        required: ['kind', 'headline', 'detail', 'watching', 'source', 'confidence', 'proposal'],
      },
    },
    summary: { type: 'string', description: 'CIPHER reporting to Leo in four lines or fewer. The one thing that actually changed today, or plainly that nothing did.' },
    quiet: { type: 'boolean', description: 'True when the watch turned up nothing worth his attention. A quiet day reported as quiet is a good watch.' },
  },
  required: ['items', 'summary', 'quiet'],
};

/** Every source the search tool actually opened, in the order it read them. */
function sourcesOf(content) {
  const out = [];
  for (const block of content) {
    if (block.type !== 'web_search_tool_result') continue;
    // An error comes back as a single object here, not a list of results.
    if (!Array.isArray(block.content)) { out.push({ error: block.content?.error_code || 'search failed' }); continue; }
    for (const r of block.content) out.push({ title: r.title || '', url: r.url || '', age: r.page_age || '' });
  }
  return out;
}

export default guard(['POST'], async (req, res, auth) => {
  const { context = {}, question = '' } = req.body || {};
  // The watchlist is read from the table, not from the caller: one source of truth.
  const items = await state.list(db(), 'list_items');
  const terms = items.filter((i) => i.list === 'watch' && !i.done).sort((a, b) => a.position - b.position).map((i) => String(i.text).trim()).filter(Boolean).slice(0, 12);
  if (!terms.length && !question.trim()) {
    return json(res, 400, { error: 'nothing to watch — add a competitor, supplier, market or regulation to the watchlist in THE INTELLIGENCE' });
  }
  const c = client();
  if (!c) return json(res, 503, { error: 'the reasoning layer is not wired: set ANTHROPIC_API_KEY in the Vercel project' });

  const now = new Date();
  const runId = await nextId(db(), 'agent_runs', 'CIP-R', now);
  await runs.start(db(), { id: runId, agent: 'CIPHER', skill: 'watch', objective: question.trim() ? `answer: ${question.trim().slice(0, 120)}` : `the standing watch — ${terms.length} entr${terms.length === 1 ? 'y' : 'ies'}`, model: MODEL, input: { question: question.trim(), terms }, sources: terms, device: auth.device });

  const brief = question.trim()
    ? `Leo has asked the watch a direct question: ${question.trim()}\n\nThe standing watchlist, for context:\n${terms.map((t) => `- ${t}`).join('\n') || '(empty)'}`
    : `Run the standing watch. These are the entries Leo put on it, and the only things you are watching:\n${terms.map((t) => `- ${t}`).join('\n')}`;

  try {
    const r = await c.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [
        { type: 'text', text: systemContext(context), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: [
          'You are CIPHER, Intelligence, station INTELLIGENCE. You watch competitors, markets, pricing, suppliers and regulation, and you report what changed.',
          'Search the web for each watchlist entry. Prefer the last thirty days; say so when the freshest thing you can find is older.',
          'Report only what bears on one of the ventures by name. A price move, a competitor launch, a supplier or regulatory change, a shift in what the audience is asking for — those are items. General industry commentary is not.',
          'Never invent a figure, a date or a source. If the search did not produce one, leave `source` empty and mark the item `rumour`. It is better to report four solid items than eight padded ones, and better still to report none and say the day was quiet.',
          'A proposal is the smallest next action routed to the right room, and it is a proposal only — nothing here executes. Most items warrant no proposal at all.',
          'No medical, dosing or treatment claim about any compound, ever, including when a source makes one — report the commercial fact and leave the claim out.',
        ].join('\n') },
      ],
      messages: [{ role: 'user', content: brief }],
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    });

    if (r.stop_reason === 'refusal') {
      await runs.finish(db(), runId, { status: 'refused', error: 'the model refused the watch' });
      return json(res, 200, { run: runId, items: [], summary: 'The watch will not run that one.', quiet: true, sources: [] });
    }
    // The search tool can pause a long turn; the client is told rather than
    // handed a half-run watch it would mistake for a quiet day.
    if (r.stop_reason === 'pause_turn') {
      await runs.finish(db(), runId, { status: 'failed', error: 'the watch ran long and paused' });
      return json(res, 503, { error: 'the watch ran long and paused — run it again' });
    }

    const out = JSON.parse(r.content.find((b) => b.type === 'text')?.text || '{}');
    const sources = sourcesOf(r.content);
    const usage = { in: r.usage.input_tokens, out: r.usage.output_tokens, cached: r.usage.cache_read_input_tokens || 0, searches: r.usage.server_tool_use?.web_search_requests || 0 };
    // A proposal is written down. Until now CIPHER's suggestions lived in
    // the run's output and were gone the moment the room was closed; now
    // each one becomes an order in `proposed` — not work, not counted, not
    // pulling any crew, but on the Bridge under what needs an answer, and
    // carrying the run it came from so the reason survives the week.
    const proposed = await propose(db(), out.items || [], { agent: 'intel', holder: 'CIPHER', runId });
    for (const [i, p] of proposed.entries()) if (p) (out.items[i] || {}).order_id = p;
    // The run carries the watch itself: the room reads it back from here.
    await runs.finish(db(), runId, { status: 'ok', usage, output: { items: out.items || [], summary: out.summary || '', quiet: !!out.quiet, sources, terms, proposed: proposed.filter(Boolean) } });
    return json(res, 200, { run: runId, ...out, sources, proposed: proposed.filter(Boolean), asOf: now.toISOString(), usage });
  } catch (e) {
    const { status, error } = modelFailure(e);
    await runs.finish(db(), runId, { status: 'failed', error }).catch(() => {});
    return json(res, status, { error });
  }
});
