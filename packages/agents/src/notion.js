// @ts-check
/**
 * Notion, read-only, for the agents' tools.
 *
 * The same contract as HERALD's reader (.claude/skills/herald/scripts/notion.mjs):
 * the same API version, and an allow-list of reads that every request is
 * checked against before it leaves, so standing rule 3 (Notion is
 * read-only) is enforced here in code. There is no function in this file
 * that could create, update, move or archive anything, and `request()`
 * refuses any method or path that is not on the list.
 *
 * Every answer is checked with zod before it is used: a page that comes
 * back in an unexpected shape is an error, not a crash three calls later.
 */
import { z } from 'zod';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';

const READS = [
  { method: 'GET', re: /^\/pages\/[0-9a-f-]{32,36}$/ },
  { method: 'GET', re: /^\/blocks\/[0-9a-f-]{32,36}\/children(\?.*)?$/ },
  { method: 'POST', re: /^\/search$/ },
];

/** @param {string} id */
export const dashless = (id) => String(id || '').replace(/-/g, '').toLowerCase();
export const isPageId = (/** @type {string} */ id) => /^[0-9a-f]{32}$/.test(dashless(id));

const RichText = z.array(z.object({ plain_text: z.string().optional() }).loose());
const TitleProp = z.object({ type: z.literal('title'), title: RichText }).loose();
const Page = z.object({
  object: z.literal('page'),
  id: z.string(),
  url: z.string().optional(),
  last_edited_time: z.string(),
  archived: z.boolean().optional(),
  in_trash: z.boolean().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
}).loose();
const SearchResult = z.object({ results: z.array(z.unknown()), has_more: z.boolean().optional(), next_cursor: z.string().nullable().optional() }).loose();
const Block = z.object({ id: z.string(), type: z.string(), has_children: z.boolean().optional() }).catchall(z.unknown());
const BlockList = z.object({ results: z.array(Block), has_more: z.boolean().optional(), next_cursor: z.string().nullable().optional() }).loose();

/**
 * @typedef {{ id: string, title: string, url: string, lastEdited: string }} PageRef
 * @typedef {{ id: string, title: string, url: string, lastEdited: string, text: string, words: number }} PageText
 * @typedef {{ token: string, fetch?: typeof globalThis.fetch, sleep?: (ms: number) => Promise<void> }} NotionOptions
 */

export class NotionError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) { super(message); this.name = 'NotionError'; this.status = status; }
}

/**
 * One request, checked against the read list first. Retries 429 and 5xx,
 * honouring Retry-After, three times at most.
 * @param {string} pathname @param {{ method?: 'GET' | 'POST', body?: unknown }} req @param {NotionOptions} o
 * @returns {Promise<unknown>}
 */
export async function request(pathname, { method = 'GET', body }, o) {
  if (!READS.some((r) => r.method === method && r.re.test(pathname))) throw new NotionError(`refused: ${method} ${pathname} is not a Notion read (Notion is read-only)`, 403);
  if (!o.token) throw new NotionError('NOTION_TOKEN is not set', 503);
  const f = o.fetch || globalThis.fetch;
  const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 1; ; attempt++) {
    const r = await f(`${API}${pathname}`, { method, headers: { Authorization: `Bearer ${o.token}`, 'Notion-Version': VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (r.ok) return /** @type {unknown} */ (await r.json());
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      const after = Number(r.headers.get('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 500 * 2 ** attempt);
      continue;
    }
    /** @type {string} */
    let detail = r.statusText;
    try { const j = /** @type {{ message?: unknown }} */ (await r.json()); if (typeof j.message === 'string') detail = j.message; } catch { /* keep the status line */ }
    throw new NotionError(`Notion ${r.status}: ${detail}`, r.status);
  }
}

/** The page's title, from whichever property is the title. @param {z.infer<typeof Page>} p */
function titleOf(p) {
  for (const v of Object.values(p.properties || {})) {
    const t = TitleProp.safeParse(v);
    if (t.success) return t.data.title.map((x) => x.plain_text || '').join('').trim();
  }
  return '';
}

/** @param {z.infer<typeof Page>} p @returns {PageRef} */
const refOf = (p) => ({ id: dashless(p.id), title: titleOf(p) || '(untitled)', url: p.url || `https://www.notion.so/${dashless(p.id)}`, lastEdited: p.last_edited_time });

/**
 * Pages the integration can see, most recently edited first. Only pages
 * shared with the integration are visible at all — share the Arcane
 * Archives page with it and nothing else.
 * @param {NotionOptions} o @param {{ query?: string, limit?: number }} [q]
 * @returns {Promise<PageRef[]>}
 */
export async function search(o, { query = '', limit = 20 } = {}) {
  /** @type {PageRef[]} */
  const out = [];
  /** @type {string | undefined} */
  let cursor;
  do {
    const raw = await request('/search', { method: 'POST', body: { query, filter: { property: 'object', value: 'page' }, sort: { direction: 'descending', timestamp: 'last_edited_time' }, page_size: Math.min(100, limit), ...(cursor ? { start_cursor: cursor } : {}) } }, o);
    const res = SearchResult.parse(raw);
    for (const item of res.results) {
      const p = Page.safeParse(item);
      if (p.success && !p.data.archived && !p.data.in_trash) out.push(refOf(p.data));
    }
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor && out.length < limit);
  return out.slice(0, limit);
}

/** @param {z.infer<typeof Block>} b */
function blockText(b) {
  const data = /** @type {{ rich_text?: unknown } | undefined} */ (b[b.type]);
  const rt = RichText.safeParse(data?.rich_text);
  if (!rt.success) return '';
  const text = rt.data.map((t) => t.plain_text || '').join('').trim();
  const lead = ['bulleted_list_item', 'numbered_list_item', 'to_do'].includes(b.type) ? '- ' : b.type.startsWith('heading_') ? '## ' : '';
  return text ? lead + text : '';
}

/**
 * A page's text: its blocks flattened to plain lines, nested blocks
 * followed two levels down, sub-pages not inlined. Capped at `maxChars` so
 * one long page cannot fill a model's context.
 * @param {NotionOptions} o @param {string} pageId @param {{ maxChars?: number }} [opts]
 * @returns {Promise<PageText>}
 */
export async function readPage(o, pageId, { maxChars = 24_000 } = {}) {
  if (!isPageId(pageId)) throw new NotionError(`"${pageId}" is not a Notion page id`, 400);
  const page = Page.parse(await request(`/pages/${dashless(pageId)}`, { method: 'GET' }, o));
  /** @type {string[]} */
  const lines = [];
  let size = 0;
  /** @param {string} id @param {number} depth */
  const walk = async (id, depth) => {
    /** @type {string | undefined} */
    let cursor;
    do {
      const q = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
      const res = BlockList.parse(await request(`/blocks/${dashless(id)}/children?${q}`, { method: 'GET' }, o));
      for (const b of res.results) {
        if (size > maxChars) return;
        if (b.type === 'child_page' || b.type === 'child_database') continue;
        const t = blockText(b);
        if (t) { lines.push(t); size += t.length + 1; }
        if (b.has_children && depth < 2) await walk(b.id, depth + 1);
      }
      cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
    } while (cursor && size <= maxChars);
  };
  await walk(page.id, 0);
  const text = lines.join('\n').slice(0, maxChars);
  return { ...refOf(page), text, words: (text.match(/\S+/g) || []).length };
}
