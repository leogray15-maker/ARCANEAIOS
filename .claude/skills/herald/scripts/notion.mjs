/**
 * The Archives, read from Notion.
 *
 * The vault and the HTML export are both folders on Leo's Mac, so HERALD
 * could only ever run there. This is the third source: the Archives as
 * they live in Notion, reachable from anywhere with a token. Same notes
 * out, same index, same map — only the origin changes.
 *
 * Read-only by construction. `api()` refuses any method or path that is
 * not a read, so standing rule 3 is enforced here and not merely stated:
 * no code path in this file can create, update, archive or delete
 * anything in Notion, whatever it is asked to do.
 *
 * Needs NOTION_TOKEN (an internal integration token, shared with the
 * Archives page). ARCANE_ARCHIVES_NOTION_ID pins the root page; without
 * it the root is found by title.
 *
 * ## Why the cache
 *
 * The Archives are ~1,300 pages. Reading every page's blocks is ~2,000
 * requests against a 3-per-second limit — eleven minutes. So a run first
 * sweeps `/search`, which returns `last_edited_time` for a hundred pages
 * at a time (~14 requests), and only re-reads the blocks of pages whose
 * cache is stale. The cache holds each page's child ids too, so an
 * unchanged tree is walked without touching the blocks endpoint at all.
 * First run: minutes. Every run after: seconds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, countWords } from './lib.mjs';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
export const CACHE_DIR = path.join(DATA_DIR, 'notion-cache');

/** Notion reads. Everything else is unreachable from this module. */
const READS = [
  { method: 'GET', re: /^\/pages\/[0-9a-f-]+$/ },
  { method: 'GET', re: /^\/blocks\/[0-9a-f-]+\/children/ },
  { method: 'POST', re: /^\/search$/ },
];

const dashless = (id) => String(id || '').replace(/-/g, '').toLowerCase();
const isPageId = (id) => /^[0-9a-f]{32}$/.test(dashless(id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One request. Retries 429 and 5xx with the server's Retry-After where it
 * gives one, and refuses anything that is not on the read list.
 */
async function api(pathname, { method = 'GET', body = null, token, tries = 5 } = {}) {
  if (!READS.some((r) => r.method === method && r.re.test(pathname))) {
    throw new Error(`refused: ${method} ${pathname} is not a Notion read (the Archives are read-only)`);
  }
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(`${API}${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': VERSION, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && attempt < tries) {
      const after = Number(r.headers.get('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : Math.min(8000, 2 ** attempt * 250));
      continue;
    }
    let detail = r.statusText;
    try { detail = (await r.json()).message || detail; } catch { /* keep the status line */ }
    throw new Error(`Notion ${r.status}: ${detail} (${method} ${pathname})`);
  }
}

/** Run `fn` over `items`, `width` at a time, results in input order. */
async function pool(items, width, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i);
  }));
  return out;
}

/* ---------- blocks → text ---------- */

const richText = (rt) => (rt || []).map((t) => t.plain_text || '').join('');

/** The prefix a block contributes, so a list reads as a list in plain text. */
const LEAD = {
  heading_1: '', heading_2: '', heading_3: '',
  bulleted_list_item: '- ', numbered_list_item: '- ', to_do: '- ', toggle: '',
  quote: '', callout: '', paragraph: '', code: '',
};

/**
 * Flatten a page's blocks into the same plain text the vault and export
 * readers produce: prose, one block per line, no markup. Child pages are
 * not inlined — they are pages in their own right — but their ids are
 * collected so the caller can walk to them.
 */
function flatten(blocks, out, links) {
  for (const b of blocks) {
    const t = b.type;
    if (t === 'child_page' || t === 'child_database') { if (isPageId(b.id)) links.push(dashless(b.id)); continue; }
    if (t === 'link_to_page') {
      const id = b.link_to_page?.page_id || b.link_to_page?.database_id;
      if (isPageId(id)) links.push(dashless(id));
      continue;
    }
    const data = b[t] || {};
    if (Array.isArray(data.rich_text)) {
      for (const span of data.rich_text) {
        const id = span.mention?.page?.id || span.mention?.database?.id;
        if (isPageId(id)) links.push(dashless(id));
      }
      const text = richText(data.rich_text).trim();
      if (text) out.push((LEAD[t] ?? '') + text);
    }
    if (t === 'code' && !Array.isArray(data.rich_text)) out.push(richText(data.caption).trim());
    if (b.children?.length) flatten(b.children, out, links);
  }
}

/** Every block of a page, following pagination and nesting (but not into sub-pages). */
async function blocksOf(id, token, depth = 0) {
  const all = [];
  let cursor;
  do {
    const q = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
    const page = await api(`/blocks/${id}/children?${q}`, { token });
    for (const b of page.results) {
      // Sub-pages are walked separately; their children are not this page's text.
      if (b.has_children && b.type !== 'child_page' && b.type !== 'child_database' && depth < 3) {
        b.children = await blocksOf(b.id, token, depth + 1);
      }
      all.push(b);
    }
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return all;
}

/* ---------- the cache ---------- */

const cachePath = (id) => path.join(CACHE_DIR, `${dashless(id)}.json`);

function readCache(id, lastEdited) {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath(id), 'utf8'));
    if (lastEdited && c.lastEdited === lastEdited) return c;
  } catch { /* a miss is a miss */ }
  return null;
}

function writeCache(entry) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cachePath(entry.id), JSON.stringify(entry));
}

/* ---------- the walk ---------- */

/**
 * Every page the integration can see, with its `last_edited_time`. One
 * sweep of `/search` costs a request per hundred pages and tells us which
 * cached pages are still good.
 */
async function lastEditedMap(token) {
  const map = new Map();
  let cursor;
  do {
    const body = { filter: { property: 'object', value: 'page' }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const page = await api('/search', { method: 'POST', body, token });
    for (const p of page.results) map.set(dashless(p.id), p.last_edited_time || '');
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return map;
}

/** The Archives root: pinned by env, or the page that is called it. */
async function findRoot(token) {
  const pinned = process.env.ARCANE_ARCHIVES_NOTION_ID;
  if (pinned) {
    if (!isPageId(pinned)) throw new Error(`ARCANE_ARCHIVES_NOTION_ID is not a page id: ${pinned}`);
    return dashless(pinned);
  }
  const r = await api('/search', { method: 'POST', body: { query: 'The Arcane Archives', filter: { property: 'object', value: 'page' }, page_size: 20 }, token });
  const titleOf = (p) => richText(Object.values(p.properties || {}).find((v) => v?.type === 'title')?.title);
  const hit = r.results.find((p) => /^the arcane archives$/i.test(titleOf(p).trim())) || r.results[0];
  if (!hit) throw new Error('No page called "The Arcane Archives" is shared with this integration. Share it, or set ARCANE_ARCHIVES_NOTION_ID.');
  return dashless(hit.id);
}

/**
 * The Archives as notes, in the shape the indexer already understands:
 * `{ file, base, title, text, links, notionId, wc }`. `base` mimics the
 * name Notion's own export gives a page, so the wikilinks HERALD writes
 * still resolve against Leo's Obsidian vault.
 */
export async function fetchArchives({ token = process.env.NOTION_TOKEN, onProgress = () => {}, width = 3, max = Infinity } = {}) {
  if (!token) throw new Error('NOTION_TOKEN is not set. Create an internal integration, share the Archives page with it, and put the token in .env.');

  const root = await findRoot(token);
  onProgress(`root ${root}`);
  const edited = await lastEditedMap(token);
  onProgress(`${edited.size} pages visible · sweeping the tree`);

  const notes = new Map();
  const titles = new Map([[root, 'The Arcane Archives']]);
  let frontier = [root];
  let fetched = 0, cached = 0;

  while (frontier.length && notes.size < max) {
    const batch = frontier.filter((id) => !notes.has(id)).slice(0, Math.max(0, max - notes.size));
    frontier = [];
    const results = await pool(batch, width, async (id) => {
      const hit = readCache(id, edited.get(id));
      if (hit) { cached++; return hit; }
      const out = [], links = [];
      let blocks;
      try {
        blocks = await blocksOf(id, token);
      } catch (e) {
        // A page the integration cannot open is not a reason to lose the run.
        onProgress(`skipped ${id}: ${e.message}`);
        return null;
      }
      for (const b of blocks) if (b.type === 'child_page') titles.set(dashless(b.id), b.child_page?.title || '');
      flatten(blocks, out, links);
      const entry = {
        id, title: titles.get(id) || '', lastEdited: edited.get(id) || '',
        text: out.join('\n').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(),
        links: [...new Set(links)],
        childPages: blocks.filter((b) => b.type === 'child_page').map((b) => dashless(b.id)),
        childTitles: Object.fromEntries(blocks.filter((b) => b.type === 'child_page').map((b) => [dashless(b.id), b.child_page?.title || ''])),
      };
      writeCache(entry);
      fetched++;
      return entry;
    });

    for (const entry of results) {
      if (!entry) continue;
      for (const [id, t] of Object.entries(entry.childTitles || {})) if (t && !titles.get(id)) titles.set(id, t);
      notes.set(entry.id, entry);
      for (const child of entry.childPages || []) if (!notes.has(child)) frontier.push(child);
    }
    onProgress(`${notes.size} pages · ${fetched} read · ${cached} cached`);
  }

  return {
    source: `notion:${root}`,
    notes: [...notes.values()].map((n) => {
      const title = n.title || titles.get(n.id) || '(untitled)';
      const base = `${title.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim()} ${n.id}`;
      return { file: `${base}.md`, base, title, text: n.text, links: n.links, notionId: n.id, wc: countWords(n.text) };
    }),
  };
}

export const __test = { flatten, richText, dashless, isPageId, api, pool };
