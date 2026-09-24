// @ts-check
/**
 * SCRIPTORIUM DRAFTER — SCRIPTORIUM, owned by SCRIBE.
 *
 * Turns the Library's summaries into social drafts in Leo's voice, using
 * HERALD's own voice, format and compliance references and HERALD's own
 * gate: a draft that trips a hard compliance pattern is repaired once and
 * otherwise thrown away. What passes lands in content_drafts as `draft` —
 * waiting in BEACON for Leo to approve, edit or reject. Nothing publishes.
 * Sensitive lanes (health, trading) are left alone, as HERALD leaves them.
 */
import { z } from 'zod';
import { outputs } from '../../../database/src/ai.js';
import { drafts as draftsTable, nextId } from '../../../database/src/content.js';
import { systemPrompt as heraldVoice, gate } from '../../../content-engine/src/herald.js';
import { FORMAT_IDS, PLATFORMS, CTAS, LANES } from '../../../../.claude/skills/herald/scripts/lib.mjs';

const FORMATS_WRITTEN = ['short', 'thread'];
const Draft = z.object({
  format: z.enum(/** @type {[string, ...string[]]} */ (FORMAT_IDS)),
  platform: z.enum(/** @type {[string, ...string[]]} */ (PLATFORMS)),
  title: z.string().min(1).max(120),
  hook: z.string().min(1).max(300),
  cta: z.enum(/** @type {[string, ...string[]]} */ (CTAS)),
  tags: z.array(z.string().max(40)).max(8),
  body: z.string().min(1).max(6000),
});
const DraftSet = z.object({ angle: z.string().min(3).max(300), drafts: z.array(Draft).min(1).max(4) });
/**
 * What HERALD's gate returns per draft (packages/content-engine/src/herald.js `gate`).
 * @typedef {{ ok: boolean, errors: string[], warnings: string[], body: string, words: number, data: { angle: string, format: string, platform: string, title: string, hook: string, cta: string, tags: string[], source_subject: string, source_module: string, source_ref: string, source_url?: string }, draft: z.infer<typeof Draft> }} GateResult
 */
/** @type {(module: Record<string, string>, set: z.infer<typeof DraftSet>) => GateResult[]} */
const runGate = gate;
const SENSITIVE = new Set(/** @type {Array<{ id: string, sensitive: boolean }>} */ (LANES).filter((l) => l.sensitive).map((l) => l.id));

/** @type {import('../registry.js').AgentDef} */
export const scriptoriumDrafter = {
  id: 'scriptorium-drafter', name: 'SCRIPTORIUM DRAFTER', room: 'scriptorium', owner: 'scribe',
  description: 'Turns the Library\'s summaries into post drafts in Leo\'s voice — contrarian, no filter, direct — through HERALD\'s gate, saved for BEACON to approve.',
  tier: 'writer', schedule: '0 6 * * *', budgetGbpPerRun: 0.10, maxSteps: 8, maxDurationMs: 240_000,
  tools: ['outputs.save'], outputType: 'draft', runPrefix: 'SCR-R',
  instructions: `Write ${FORMATS_WRITTEN.join(' and ')} drafts for X from one summary. Return JSON: { angle, drafts: [{ format, platform, title, hook, cta, tags, body }] }. One draft per format.`,
  run: async (ctx) => {
    const pool = (await outputs.list(ctx.db, { agent: 'library-summariser', type: 'summary', limit: 100 }))
      .filter((o) => o.status !== 'rejected' && !o.data?.drafted_at && !o.data?.sensitive && !o.data?.withheld && !SENSITIVE.has(String(o.data?.lane || '')));
    const perSummary = 2; // one write, one possible repair
    const todo = pool.slice(0, Math.max(1, Math.floor(ctx.def.maxSteps / perSummary)));
    /** @type {string[]} */ const landed = [];
    let refused = 0;
    for (const s of todo) {
      if (ctx.remainingMs() < 45_000) break;
      await ctx.heartbeat(`drafting from ${s.title}`);
      const known = /** @type {Array<Record<string, unknown>>} */ (await ctx.db.get('archive_modules', { select: 'id,title,subject,lane,source_url,notion_id', notion_id: `eq.${s.source_ref}`, limit: 1 }).catch(() => []));
      const mod = known[0];
      const module = { id: String(mod?.id || s.source_ref || s.id), title: String(mod?.title || s.title), subject: String(mod?.subject || 'The Arcane Archives'), lane: String(mod?.lane || s.data?.lane || 'mindset'), source_url: String(mod?.source_url || s.data?.url || '') };
      const brief = `Module: ${module.title}\nSubject: ${module.subject}\nLane: ${module.lane}\n\nSummary:\n${s.content}\n\nKey points:\n${(/** @type {string[]} */ (s.data?.key_points || [])).map((k) => `- ${k}`).join('\n')}\n\nWrite: ${FORMATS_WRITTEN.join(', ')}. Platform X.`;
      /** @type {import('../../../ai/src/providers.js').Message[]} */
      const messages = [{ role: 'system', content: `${heraldVoice()}\n\n${ctx.system}` }, { role: 'user', content: brief }];
      let written = await ctx.model({ messages, schema: DraftSet, schemaName: 'drafts', maxTokens: 2_500, temperature: 0.7 });
      let set = DraftSet.parse(written.data);
      let results = runGate(module, set);
      let bad = results.filter((r) => !r.ok);
      if (bad.length && ctx.remainingMs() > 40_000) {
        const why = bad.map((r) => `${r.draft.format}: ${r.errors.join('; ')}`).join('\n');
        written = await ctx.model({ messages: [...messages, { role: 'user', content: `The gate refused these; rewrite them inside the rules:\n${why}` }], schema: DraftSet, schemaName: 'drafts', maxTokens: 2_500, temperature: 0.5 });
        set = DraftSet.parse(written.data);
        results = runGate(module, set); bad = results.filter((r) => !r.ok);
      }
      refused += bad.length;
      /** @type {string[]} */ const ids = [];
      for (const r of results.filter((x) => x.ok)) {
        const d = r.data;
        const id = await nextId(ctx.db, 'content_drafts', 'HER');
        const [row] = await draftsTable.create(ctx.db, [{
          id, run_id: ctx.runId, module_id: mod?.id ? String(mod.id) : null, parent_id: null, agent: 'SCRIBE', format: d.format, platform: d.platform, status: 'draft',
          title: d.title, hook: d.hook, body: r.body, angle: d.angle, cta: d.cta, tags: d.tags, word_count: r.words, compliance: 'pass', compliance_notes: r.warnings.join('; '),
          source_subject: d.source_subject, source_module: d.source_module, source_ref: d.source_ref, source_url: d.source_url || '', source_note: `summary ${s.id}`, model: written.servedModel || written.modelId,
        }], { actor: 'SCRIBE', note: `drafted from summary ${s.id}` });
        ids.push(row?.id || id);
      }
      await ctx.db.patch('outputs', { id: `eq.${s.id}` }, { data: { ...s.data, drafted_at: new Date().toISOString(), drafts: ids, refused: bad.length } }, { returning: false });
      landed.push(...ids);
    }
    ctx.saved.push(...landed);
    return { summary: todo.length ? `${landed.length} draft${landed.length === 1 ? '' : 's'} waiting in BEACON from ${todo.length} summar${todo.length === 1 ? 'y' : 'ies'}${refused ? `; ${refused} refused by the gate` : ''}` : 'nothing to draft: no new summaries (run the Library Summariser first)', data: { drafts: landed, refused, summaries: todo.map((s) => s.id) } };
  },
};
