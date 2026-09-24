// @ts-check
/**
 * LIBRARY SUMMARISER — THE LIBRARY, owned by ORACLE.
 *
 * Reads the Arcane Archives in Notion (read-only), newest edits first, and
 * saves a short summary of each page for the operator and for SCRIPTORIUM
 * to draft from. A page whose last edit is the one already summarised is
 * skipped without being read, so a daily run costs a search and nothing
 * else when nothing has changed. Grunt tier: free models only.
 */
import { z } from 'zod';
import { outputs } from '../../../database/src/ai.js';
import { scan } from '../../../../.claude/skills/herald/scripts/lib.mjs';

const Summary = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(20).max(1400),
  key_points: z.array(z.string().max(300)).min(1).max(6),
  tags: z.array(z.string().max(40)).max(6),
  lane: z.enum(['mindset', 'philosophy', 'sales', 'dark', 'lifestyle', 'health', 'trading', 'meta']),
  sensitive: z.boolean(),
});

const Page = z.object({ id: z.string(), title: z.string(), url: z.string(), lastEdited: z.string() });
const Pages = z.object({ pages: z.array(Page) });
const PageText = Page.extend({ text: z.string(), words: z.number() });

/** @type {import('../registry.js').AgentDef} */
export const librarySummariser = {
  id: 'library-summariser', name: 'LIBRARY SUMMARISER', room: 'archives', owner: 'oracle',
  description: 'Reads the Arcane Archives in Notion and keeps a short summary of every page, skipping pages that have not changed since the last run.',
  tier: 'grunt', schedule: '0 5 * * *', budgetGbpPerRun: 0, maxSteps: 12, maxDurationMs: 240_000,
  tools: ['notion.search', 'notion.readPage', 'outputs.save'], outputType: 'summary', runPrefix: 'LIB-R',
  instructions: [
    'You summarise one page of the Arcane Archives at a time, for Leo and for the drafter who turns summaries into posts.',
    'Summary: 60 to 140 words, plain sentences, what the page argues and why it matters. Key points: the few lines worth keeping, in the page\'s own terms.',
    'Lane: the closest of mindset, philosophy, sales, dark, lifestyle, health, trading, meta.',
    'Set sensitive to true if the page is about compounds, doses, health treatment, or trading returns. Never restate a dose, a compound name, a treatment, or a promised return in the summary: describe the topic, not the claim.',
  ].join('\n'),
  run: async (ctx) => {
    const { pages } = Pages.parse(await ctx.tool('notion.search', { query: '', limit: 50 }));
    let done = 0, unchanged = 0, thin = 0, withheld = 0;
    for (const page of pages) {
      if (done >= ctx.def.maxSteps || ctx.remainingMs() < 30_000) break;
      const last = await outputs.latestFor(ctx.db, ctx.def.id, page.id);
      if (last && last.source_hash === page.lastEdited) { unchanged++; continue; }
      await ctx.heartbeat(`reading ${page.title}`);
      const text = PageText.parse(await ctx.tool('notion.readPage', { pageId: page.id }));
      if (text.words < 60) { thin++; continue; }
      const r = await ctx.model({
        messages: [{ role: 'system', content: ctx.system }, { role: 'user', content: `Page: ${text.title}\n\n${text.text}` }],
        schema: Summary, schemaName: 'summary', maxTokens: 900, temperature: 0.2,
      });
      const s = Summary.parse(r.data);
      // The HERALD gate's hard patterns, over what this agent wrote: a summary
      // that restates a dose or a claim is kept out of the record, not stored.
      /** @type {Array<{ id: string, why: string }>} */
      const hits = scan(`${s.summary}\n${s.key_points.join('\n')}`).hard;
      if (hits.length) withheld++;
      await ctx.tool('outputs.save', {
        type: 'summary', title: s.title, sourceRef: page.id, sourceHash: page.lastEdited,
        content: hits.length ? `Withheld: the summary tripped the compliance gate (${hits.map((h) => h.why).join(', ')}). Read the page itself.` : s.summary,
        data: { key_points: hits.length ? [] : s.key_points, tags: s.tags, lane: s.lane, sensitive: s.sensitive || hits.length > 0, url: page.url, words: text.words, withheld: hits.length > 0 },
      });
      done++;
    }
    return { summary: `${done} summarised, ${unchanged} unchanged, ${thin} too short${withheld ? `, ${withheld} withheld by the gate` : ''} (of ${pages.length} pages seen)`, data: { summarised: done, unchanged, thin, withheld, seen: pages.length } };
  },
};
