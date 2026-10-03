/**
 * The executors behind ACTIONS (packages/config/src/missions.js): what a
 * mission step actually does when it reads the brain, searches the web or
 * writes a proposal. Each takes the step's resolved arguments and a
 * context, and returns plain JSON small enough to keep on the mission row.
 *
 * Permission is not decided here. The runner (missions.js) checks the
 * acting agent's grades and the tool's policy before it calls any of
 * these; an executor only does its one job, honestly — a page that cannot
 * be read is reported as such, not skipped in silence.
 *
 * Everything is free: the web is searched through a SearXNG the operator
 * runs (SEARXNG_URL) or DuckDuckGo's plain HTML page, pages are read with
 * fetch, the brain is read from disk. No dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { modules } from '../../database/src/content.js';
import { propose } from '../../database/src/proposals.js';
import { EVIDENCE } from '../../database/src/evidence.js';
import { generate, FORMAT_IDS } from '../../content-engine/src/herald.js';

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s; };
const words = (q) => String(q || '').toLowerCase().split(/[^a-z0-9£$%.-]+/).filter((w) => w.length > 2 && !STOP.has(w));
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'why', 'who', 'are', 'was', 'this', 'that', 'from', 'into', 'about', 'our', 'your', 'does', 'did', 'have', 'has', 'can', 'will', 'should', 'would', 'which', 'when', 'where']);

/* ---------------------------------------------------------------- the brain */

function* notes(dir, root = dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* notes(p, root);
    else if (e.name.endsWith('.md')) yield { abs: p, rel: path.relative(root, p) };
  }
}

/** Notes in the brain that bear on `q`, best first: a hit in the title counts more than one in the body. */
async function memorySearch({ q = '', limit = 6 } = {}, { brain }) {
  if (!brain) return { notes: [], note: 'no brain on this machine (ARCANE_BRAIN)' };
  const terms = words(q);
  if (!terms.length) return { notes: [] };
  const hits = [];
  for (const n of notes(brain)) {
    let text = '';
    try { text = fs.readFileSync(n.abs, 'utf8'); } catch { continue; }
    const title = path.basename(n.rel, '.md');
    const lower = text.toLowerCase(); const t = title.toLowerCase();
    let score = 0;
    for (const w of terms) { if (t.includes(w)) score += 5; let i = -1, c = 0; while ((i = lower.indexOf(w, i + 1)) !== -1 && c < 10) c++; score += c; }
    if (!score) continue;
    const body = text.replace(/^---[\s\S]*?---\s*/, '');
    const lb = body.toLowerCase();
    const at = Math.max(0, lb.indexOf(terms.find((w) => lb.includes(w)) || ''));
    hits.push({ path: n.rel, title, score, excerpt: clip(body.slice(Math.max(0, at - 200), at + 300).replace(/\s+/g, ' ').trim(), 500) });
  }
  hits.sort((a, b) => b.score - a.score);
  return { notes: hits.slice(0, Math.min(20, Number(limit) || 6)).map(({ score, ...h }) => h) };
}

/* ---------------------------------------------------------------- the Archives */

async function archivesSearch({ q = '', limit = 5 } = {}, { db }) {
  // Full-text search wants every word present; a question has too many. The few that carry it are enough.
  const terms = words(q).slice(0, 4);
  let rows = [];
  for (let n = terms.length; n > 0 && !rows.length; n--) {
    try { ({ rows } = await modules.search(db, { q: terms.slice(0, n).join(' '), limit: Math.min(20, Number(limit) || 5), sensitive: false })); } catch (e) { return { modules: [], note: e.message }; }
  }
  return { modules: rows.map((m) => ({ id: m.id, title: m.title, subject: m.subject, lane: m.lane, excerpt: clip(m.excerpt, 400) })) };
}

/** One module worth writing from: long enough, not sensitive, not already drafted, in the lane asked for. */
async function archivesPick({ lane = '', subject = '', module = '' } = {}, { db, random = Math.random }) {
  if (module) {
    const m = await modules.get(db, module, { body: false });
    if (!m) throw new Error(`no module ${module} in the Archives index`);
    if (m.sensitive) throw new Error(`${m.title} is marked sensitive — HERALD does not write from it`);
    return { id: m.id, title: m.title, subject: m.subject, lane: m.lane, words: m.words };
  }
  const { rows } = await modules.search(db, { lane, limit: 200, sensitive: false, gate: '!never' });
  const drafted = new Set((await db.get('content_drafts', { select: 'module_id', limit: 5000 }).catch(() => [])).map((d) => d.module_id));
  const pool = rows.filter((m) => m.words >= 350 && m.words <= 6000 && !['meta', 'external'].includes(m.lane) && !drafted.has(m.id) && (!subject || String(m.subject).toLowerCase().includes(String(subject).toLowerCase())));
  if (!pool.length) throw new Error(`nothing left to write from${lane ? ` in ${lane}` : ''}${subject ? ` matching "${subject}"` : ''} — index the Archives (npm run herald:index, archives:sync) or widen the ask`);
  const scored = pool.map((m) => ({ m, w: Math.log(m.words) * (0.6 + random()) })).sort((a, b) => b.w - a.w);
  const m = scored[0].m;
  return { id: m.id, title: m.title, subject: m.subject, lane: m.lane, words: m.words };
}

/** HERALD writes from a module, through the lint gate; every draft lands as `draft` and waits for Leo. */
async function draftsGenerate({ module, parent = '', note = '', formats } = {}, { db, client, model, mock = false }) {
  const m = await modules.get(db, module);
  if (!m) throw new Error(`no module ${module}`);
  let par = null;
  if (parent) par = await db.get('content_drafts', { select: 'id,hook,format,module_id', id: `eq.${parent}` }, { single: true });
  const out = await generate({ db, client, model, module: m, formats: Array.isArray(formats) && formats.length ? formats : FORMAT_IDS, device: 'worker', note: clip(note, 200), mock, parent: par });
  if (out.status === 'failed') throw new Error(out.error);
  return {
    run: out.run, status: out.status, error: out.error || '', refused: out.refused, repaired: !!out.repaired,
    drafts: out.drafts.map((d) => ({ id: d.id, format: d.format, platform: d.platform, hook: d.hook, body: clip(d.body, 1200) })),
  };
}

/* ---------------------------------------------------------------- the web */

/**
 * The worker runs on the operator's own machine, so a URL a model chose
 * must never reach that machine's network: no localhost, no private
 * ranges, no bare hostnames — only the public web over http(s).
 */
export function publicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  if (h.includes(':')) return null;   // IPv6 literals: refused outright rather than half-checked
  return u.toString();
}

const decode = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** DuckDuckGo's plain HTML results, read without a browser. */
export function parseDuckDuckGo(html) {
  const links = [...String(html).matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const out = [];
  for (const [i, m] of links.entries()) {
    // The snippet is whatever result__snippet follows this link and comes before the next one.
    const tail = html.slice(m.index, links[i + 1]?.index ?? html.length);
    const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/.exec(tail);
    let url = m[1].replace(/&amp;/g, '&');
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (url.startsWith('//')) url = `https:${url}`;
    if (/duckduckgo\.com\/y\.js/.test(url)) continue;   // adverts
    out.push({ url, title: decode(m[2]), snippet: decode(snip?.[1] || '') });
  }
  return out;
}

async function searchOne(q, { env, fetchImpl, per }) {
  if (env.SEARXNG_URL) {
    const r = await fetchImpl(`${env.SEARXNG_URL.replace(/\/+$/, '')}/search?q=${encodeURIComponent(q)}&format=json`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`SearXNG ${r.status}`);
    const j = await r.json();
    return (j.results || []).slice(0, per).map((x) => ({ url: x.url, title: x.title || '', snippet: clip(x.content || '', 300) }));
  }
  const r = await fetchImpl('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (THE ARCANE research worker)' }, body: `q=${encodeURIComponent(q)}` });
  if (!r.ok) throw new Error(`DuckDuckGo ${r.status}`);
  return parseDuckDuckGo(await r.text()).slice(0, per);
}

async function webSearch({ queries = [], q = '', per = 4 } = {}, { env = process.env, fetchImpl = globalThis.fetch }) {
  const list = (Array.isArray(queries) ? queries : [queries]).concat(q ? [q] : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
  if (!list.length) throw new Error('nothing to search for');
  const results = []; const failed = [];
  for (const query of list) {
    try { for (const r of await searchOne(query, { env, fetchImpl, per: Math.min(8, Number(per) || 4) })) results.push({ query, ...r }); }
    catch (e) { failed.push({ query, error: e.message }); }
  }
  if (!results.length && failed.length) throw new Error(`every search failed: ${failed[0].error}`);
  const urls = [...new Set(results.map((r) => publicUrl(r.url)).filter(Boolean))];
  return { results, urls, failed, engine: env.SEARXNG_URL ? 'searxng' : 'duckduckgo' };
}

/** A page as plain text: no scripts, no styles, no markup. */
export function pageText(html) {
  const title = decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
  const body = String(html)
    .replace(/<(head|script|style|noscript|svg|nav|footer|header|form|title)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return { title, text: decode(body.replace(/\n\s*/g, ' ¶ ')).split(/\s*¶\s*/).filter(Boolean).join('\n').trim() };
}

async function webFetch({ urls = [], max = 5, chars = 5000 } = {}, { fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  const list = [...new Set((Array.isArray(urls) ? urls : [urls]).map(publicUrl).filter(Boolean))].slice(0, Math.min(8, Number(max) || 5));
  const pages = []; const failed = [];
  for (const url of list) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(url, { redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (THE ARCANE research worker)', accept: 'text/html,text/plain' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const type = r.headers?.get?.('content-type') || 'text/html';
      if (!/text\/|html|xml/.test(type)) throw new Error(`not a page (${type})`);
      const raw = await r.text();
      const { title, text } = /html/.test(type) ? pageText(raw) : { title: '', text: raw };
      pages.push({ url, title: clip(title, 200), text: clip(text, Math.min(12000, Number(chars) || 5000)) });
    } catch (e) { failed.push({ url, error: e.name === 'AbortError' ? 'timed out' : e.message }); }
    finally { clearTimeout(timer); }
  }
  return { pages, failed };
}

/* ---------------------------------------------------------------- the floor */

const DAY = 86400000;

/** A summary of the floor for a reasoning step: the week of missions and runs, or one agent's evidence. */
async function databaseRead({ source = 'week', days = 7 } = {}, { db, now = new Date() }) {
  if (EVIDENCE[source]) { const ev = await EVIDENCE[source](db, { now }); return { source, brief: ev.brief, problems: ev.problems }; }
  if (source !== 'week') throw new Error(`database.read knows week, ${Object.keys(EVIDENCE).join(', ')} — not "${source}"`);
  const since = new Date(now.getTime() - (Number(days) || 7) * DAY).toISOString();
  const safe = (p) => p.catch(() => []);
  const [missions, runs, orders] = await Promise.all([
    safe(db.get('missions', { select: 'id,template,title,state,error,steps_run,created_at,finished_at', created_at: `gte.${since}`, order: 'created_at.desc', limit: 200 })),
    safe(db.get('agent_runs', { select: 'id,agent,skill,status,error,started_at,finished_at,usage', started_at: `gte.${since}`, order: 'started_at.desc', limit: 1000 })),
    safe(db.get('orders', { select: 'id,room,text,state,source,agent,created_at,done_at', source: 'eq.agent', created_at: `gte.${since}`, limit: 500 })),
  ]);
  const by = (rows, key) => rows.reduce((m, r) => { m[r[key]] = (m[r[key]] || 0) + 1; return m; }, {});
  const runsBy = {};
  for (const r of runs) { const k = r.agent; const x = runsBy[k] || (runsBy[k] = { ok: 0, failed: 0, other: 0, errors: [] }); if (r.status === 'ok') x.ok++; else if (r.status === 'failed') { x.failed++; if (x.errors.length < 3 && r.error) x.errors.push(clip(r.error, 160)); } else x.other++; }
  const proposals = { made: orders.length, approved: orders.filter((o) => ['open', 'active', 'review', 'done'].includes(o.state)).length, killed: orders.filter((o) => o.state === 'killed').length, waiting: orders.filter((o) => o.state === 'proposed').length };
  const lines = [
    `Window: the last ${Number(days) || 7} days (since ${since.slice(0, 10)}).`,
    `Missions: ${missions.length} — ${Object.entries(by(missions, 'state')).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}.`,
    ...missions.filter((m) => m.state === 'failed').slice(0, 6).map((m) => `- failed ${m.template} ${m.id}: ${clip(m.error, 200)}`),
    `Runs by agent: ${Object.entries(runsBy).map(([a, x]) => `${a} ${x.ok} ok / ${x.failed} failed${x.other ? ` / ${x.other} other` : ''}`).join('; ') || 'none'}.`,
    ...Object.entries(runsBy).flatMap(([a, x]) => x.errors.map((e) => `- ${a} error: ${e}`)),
    `Proposals from agents: ${proposals.made} made, ${proposals.approved} approved, ${proposals.killed} killed, ${proposals.waiting} still waiting.`,
    ...orders.filter((o) => o.state === 'killed').slice(0, 5).map((o) => `- killed: ${clip(o.text, 160)} (${o.agent})`),
  ];
  return { source, brief: lines.join('\n'), facts: { missions: by(missions, 'state'), runs: runsBy, proposals } };
}

async function ordersPropose({ items = [] } = {}, { db, agent, runId }) {
  const list = Array.isArray(items) ? items.slice(0, 5) : [];
  const ids = await propose(db, list, { agent: agent.id, holder: agent.name, runId });
  return { proposed: ids.filter(Boolean), skipped: ids.filter((x) => !x).length };
}

/**
 * The executors, by action id. `traced` marks one that records its own run
 * (HERALD's engine does), so the runner does not record a second.
 */
export const EXECUTORS = {
  'memory.search': { run: memorySearch },
  'archives.search': { run: archivesSearch },
  'archives.pick': { run: archivesPick },
  'database.read': { run: databaseRead },
  'web.search': { run: webSearch },
  'web.fetch': { run: webFetch },
  'orders.propose': { run: ordersPropose },
  'drafts.generate': { run: draftsGenerate, traced: true },
  // `think` is the runner's own: it needs the mission's lessons and the agent's voice, not a tool.
  think: { run: null },
};
