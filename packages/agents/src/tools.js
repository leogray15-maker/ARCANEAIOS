// @ts-check
/**
 * The tools an agent may call. Each is a name, a sentence for the model,
 * a zod schema for what goes in and one for what comes out, and a
 * handler. Input from a model is parsed before the handler sees it and the
 * handler's answer is parsed before the model sees it, so neither side can
 * pass the other something malformed.
 *
 * An agent reaches only the tools its definition lists
 * (`registry.js` `tools`); the runner builds the model's tool list from
 * that and refuses a call to anything else.
 */
import { z } from 'zod';
import * as notion from './notion.js';
import { outputs, OUTPUT_TYPES } from '../../database/src/ai.js';

/**
 * What a tool handler gets: the run it belongs to, and the handles it may use.
 * @typedef {{ runId: string, agentId: string, room: string, db: import('../../database/src/ai.js').Db, env: Record<string, string | undefined>, fetch: typeof globalThis.fetch, modelUsed: () => string, saved: string[] }} ToolContext
 */

/**
 * @template {z.ZodType} I
 * @template {z.ZodType} O
 * @typedef {{ name: string, wire: string, description: string, input: I, output: O, handler: (ctx: ToolContext, input: z.infer<I>) => Promise<z.infer<O>> }} Tool
 */

const PageRef = z.object({ id: z.string(), title: z.string(), url: z.string(), lastEdited: z.string() });

/** @param {ToolContext} ctx */
const notionOpts = (ctx) => ({ token: ctx.env.NOTION_TOKEN || '', fetch: ctx.fetch });

/** @type {Tool<z.ZodObject<{ query: z.ZodDefault<z.ZodString>, limit: z.ZodDefault<z.ZodNumber> }>, z.ZodObject<{ pages: z.ZodArray<typeof PageRef> }>>} */
const notionSearch = {
  name: 'notion.search', wire: 'notion_search',
  description: 'Search the Arcane Archives in Notion (read-only). Returns page ids, titles and when each was last edited, newest first.',
  input: z.object({ query: z.string().max(200).default(''), limit: z.number().int().min(1).max(50).default(10) }),
  output: z.object({ pages: z.array(PageRef) }),
  handler: async (ctx, i) => ({ pages: await notion.search(notionOpts(ctx), { query: i.query, limit: i.limit }) }),
};

/** @type {Tool<z.ZodObject<{ pageId: z.ZodString }>, z.ZodObject<{ id: z.ZodString, title: z.ZodString, url: z.ZodString, lastEdited: z.ZodString, text: z.ZodString, words: z.ZodNumber }>>} */
const notionReadPage = {
  name: 'notion.readPage', wire: 'notion_read_page',
  description: 'Read one Notion page as plain text (read-only). Long pages are cut at about 24,000 characters.',
  input: z.object({ pageId: z.string().min(32).max(36) }),
  output: z.object({ id: z.string(), title: z.string(), url: z.string(), lastEdited: z.string(), text: z.string(), words: z.number() }),
  handler: async (ctx, i) => notion.readPage(notionOpts(ctx), i.pageId),
};

/** @type {Tool<z.ZodObject<{ type: z.ZodEnum<{ summary: 'summary', draft: 'draft', verdict: 'verdict', trend: 'trend', note: 'note' }>, title: z.ZodString, content: z.ZodString, sourceRef: z.ZodDefault<z.ZodString>, sourceHash: z.ZodDefault<z.ZodString>, data: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>> }>, z.ZodObject<{ id: z.ZodString, status: z.ZodString }>>} */
const outputsSave = {
  name: 'outputs.save', wire: 'outputs_save',
  description: 'Save a result for the operator to review in this agent\'s room. It is saved as pending; nothing is published.',
  input: z.object({ type: z.enum(OUTPUT_TYPES), title: z.string().min(1).max(200), content: z.string().min(1).max(20_000), sourceRef: z.string().max(200).default(''), sourceHash: z.string().max(200).default(''), data: z.record(z.string(), z.unknown()).default({}) }),
  output: z.object({ id: z.string(), status: z.string() }),
  handler: async (ctx, i) => {
    const row = await outputs.save(ctx.db, { run_id: ctx.runId, agent: ctx.agentId, type: i.type, room: ctx.room, title: i.title, content: i.content, data: i.data, source_ref: i.sourceRef, source_hash: i.sourceHash, model: ctx.modelUsed() });
    ctx.saved.push(row.id);
    return { id: row.id, status: row.status };
  },
};

/** Every tool, by its dotted name. */
export const TOOLS = /** @type {Record<string, Tool<z.ZodType, z.ZodType>>} */ (/** @type {unknown} */ ({ [notionSearch.name]: notionSearch, [notionReadPage.name]: notionReadPage, [outputsSave.name]: outputsSave }));
export const TOOL_NAMES = Object.keys(TOOLS);

/** The OpenAI-style tool list for a model, from the tools an agent may use. @param {string[]} names @returns {import('../../ai/src/providers.js').ToolSpec[]} */
export function toolSpecs(names) {
  return names.map((n) => {
    const t = TOOLS[n];
    const params = /** @type {Record<string, unknown>} */ (z.toJSONSchema(t.input, { target: 'draft-7', io: 'input' }));
    return { type: /** @type {const} */ ('function'), function: { name: t.wire, description: t.description, parameters: params } };
  });
}

/**
 * Run one tool call from a model: find it among the agent's tools, parse
 * the arguments, run it, parse the result. Never throws — a failure is
 * returned as `{ ok: false, error }` for the model to read and the run to
 * record.
 * @param {ToolContext} ctx @param {string[]} allowed @param {string} wireName @param {string} rawArgs
 * @returns {Promise<{ ok: true, tool: string, result: unknown } | { ok: false, tool: string, error: string }>}
 */
export async function callTool(ctx, allowed, wireName, rawArgs) {
  const name = allowed.find((n) => TOOLS[n]?.wire === wireName);
  if (!name) return { ok: false, tool: wireName, error: `tool "${wireName}" is not available to this agent` };
  const t = TOOLS[name];
  /** @type {unknown} */
  let args;
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return { ok: false, tool: name, error: 'arguments were not valid JSON' }; }
  const input = t.input.safeParse(args);
  if (!input.success) return { ok: false, tool: name, error: `invalid arguments: ${input.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}` };
  try {
    const out = t.output.safeParse(await t.handler(ctx, input.data));
    if (!out.success) return { ok: false, tool: name, error: `the tool returned an unexpected shape: ${out.error.issues[0]?.message || ''}` };
    return { ok: true, tool: name, result: out.data };
  } catch (e) {
    return { ok: false, tool: name, error: e instanceof Error ? e.message : String(e) };
  }
}
