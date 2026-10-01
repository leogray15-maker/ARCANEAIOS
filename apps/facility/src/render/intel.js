/**
 * THE INTELLIGENCE — the watch.
 *
 *   #intel            the watchlist, the last run's items, the run history
 *
 * The watchlist is Leo's (`list_items`, list `watch`): competitors,
 * suppliers, markets, regulation. CIPHER researches those entries and
 * nothing it picks for itself (`/api/intel`), and every run is recorded
 * in `agent_runs`, so the room reads the last one back from the server
 * and THE RECORDS shows it beside HERALD's.
 *
 * Every item is something to read. A proposal is a proposal: it becomes
 * an order only when Leo presses "take it".
 */
import { ROOM_BY_ID } from '@arcane/config';
import { api } from '../core/api.js';
import { esc, chip, when, stampFull, num, loading, empty, failed, handleKeyForm, keepFocus } from './ui.js';

const KIND_TONE = { opportunity: 'vital', threat: 'deny', signal: 'cyan', action: 'flare' };
const CONF_TONE = { confirmed: 'vital', reported: 'ash', rumour: 'flare' };
const TAGS = ['opportunity', 'threat', 'signal'];
const PRIO = ['P0', 'P1', 'P2', 'P3'];
const PRIO_TONE = ['deny', 'flare', 'arcane', 'ash'];

const st = { runs: null, run: null, error: null, runError: null, busy: false, loadedAt: 0, taken: {} };
let el = null, go = null, store = null, brain = null;

export function bindIntel(view, ctx) {
  el = view; go = ctx.go; store = ctx.store; brain = ctx.brain;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
}

export function renderIntel(view, ctx, hash = '#intel', { keepScroll = false } = {}) {
  el = view;
  if ((!st.runs && !st.error) || Date.now() - st.loadedAt > 60_000) load();
  paint({ keepScroll });
}

async function load() {
  st.loadedAt = Date.now();
  try {
    const { runs } = await api.runs.list({ agent: 'CIPHER', limit: 20 });
    st.runs = runs; st.error = null;
    const last = runs.find((r) => r.status === 'ok' && r.output?.items !== undefined);
    if (last && !st.run) st.run = { id: last.id, ...last.output, asOf: last.finished_at || last.started_at, usage: last.usage };
  } catch (e) { st.error = e; }
  paint({ keepScroll: true });
}

/* ---------- paint ---------- */
function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const restore = keepFocus(el, 'input[name=q], input[name=text]');
  const scroll = keepScroll ? el.scrollTop : 0;
  const sv = store.serverStatus();
  const watch = store.openItems('watch');
  const run = st.run;
  const age = run?.asOf ? Date.now() - new Date(run.asOf).getTime() : null;
  const stale = age !== null && age > 86400000;
  el.innerHTML = `<div class="wrap app intel">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>THE INTELLIGENCE</h1>
      <span class="sub">the watch · <b>${watch.length}</b> on the list${run ? ` · last run <b>${esc(when(run.asOf))}</b>${stale ? ' <span class="flare">(stale)</span>' : ''}` : ' · never run'}</span>
      <span class="spacer"></span>
      <span class="${sv.tone}" title="${esc(sv.text)}">● ${esc(sv.tone === 'vital' ? 'state on the server' : sv.text)}</span>
    </div>
    ${sv.tone === 'breach' ? `<p class="flash breach">${esc(sv.text)}</p>` : ''}
    ${store.server.needsKey || (!store.server.ready && store.server.reason === 'no operator key') ? failed({ needsKey: true, status: 401 }) : ''}
    <div class="bridge-grid">
      <div class="bridge-main">
        <section>
          <h2>Run the watch</h2>
          <form class="inline" data-act="intel-run">
            <input name="q" placeholder="Ask the watch something specific, or leave it empty for the standing watch" style="flex:1;min-width:280px" autocomplete="off" ${store.server.ready ? '' : 'disabled'}>
            <button type="submit" class="primary" ${st.busy || !watch.length ? 'disabled' : ''}>${st.busy ? 'CIPHER is reading…' : 'Run'}</button>
          </form>
          ${!watch.length ? '<p class="empty">The watchlist is empty. CIPHER only researches what you put on it — add a competitor, a supplier, a market or a regulation on the right.</p>' : ''}
          ${st.runError ? `<div class="state error-state"><p><b>The watch did not run.</b> ${esc(st.runError)}</p></div>` : ''}
          ${run?.items?.length ? evidenceBoard(watch, run) : ''}
          ${run ? runView(run) : st.busy ? loading('the watch (a minute or two — it is reading the web)') : ''}
        </section>

        <section>
          <h2>Runs <span class="faint">${st.runs?.length || 0}</span></h2>
          ${st.error ? failed(st.error, { retry: 'reload' }) : !st.runs ? loading('runs') : st.runs.length ? `<table class="grid"><thead><tr><th>Run</th><th>Status</th><th>What</th><th class="r">Items</th><th class="r">Searches</th><th>When</th></tr></thead><tbody>
            ${st.runs.map((r) => `<tr class="row" data-act="show-run" data-id="${esc(r.id)}"><td><code>${esc(r.id)}</code></td><td>${chip(r.status, r.status === 'ok' ? 'vital' : r.status === 'running' ? 'cyan' : 'deny')}</td><td>${esc(r.objective)}${r.error ? `<br><span class="breach">${esc(r.error).slice(0, 120)}</span>` : ''}</td><td class="r">${r.output?.items ? r.output.items.length : '—'}</td><td class="r ash">${r.usage?.searches ?? '—'}</td><td class="ash nowrap" title="${esc(stampFull(r.started_at))}">${when(r.started_at)}</td></tr>`).join('')}
          </tbody></table>` : '<p class="empty">CIPHER has not run yet.</p>'}
        </section>
      </div>

      <aside class="bridge-side">
        <h2>The watchlist <span class="faint">${watch.length}</span></h2>
        ${watch.length ? watch.map((w) => `<div class="order-row"><span class="text">${esc(w.text)}</span>${w.tag ? chip(w.tag, KIND_TONE[w.tag] || 'ash') : ''}<span class="row-acts">${TAGS.filter((t) => t !== w.tag).map((t) => `<button class="tiny ghost" data-act="tag" data-id="${esc(w.id)}" data-tag="${t}">${t}</button>`).join('')}<button class="tiny ghost" data-act="remove" data-id="${esc(w.id)}">×</button></span></div>`).join('') : '<p class="empty">Nothing on the list.</p>'}
        <form class="inline" data-act="watch-add"><input name="text" placeholder="Competitor, supplier, market, regulation" style="flex:1;min-width:180px" autocomplete="off"><button type="submit" ${store.server.ready ? '' : 'disabled'}>Add</button></form>
        <p class="src">CIPHER reads only these. It reports what bears on a venture by name, with the source and how firm it is, and proposes at most the smallest next action — which waits for you.</p>

        ${run?.sources?.length ? `<h2>What it opened <span class="faint">${run.sources.length}</span></h2>${run.sources.slice(0, 12).map((s) => (s.error ? `<p class="breach small">search error: ${esc(s.error)}</p>` : `<p class="small"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>${s.age ? ` <span class="faint">${esc(s.age)}</span>` : ''}</p>`)).join('')}` : ''}

        <h2>Signals <span class="faint">VIGIL</span></h2>
        <p class="src">The watch is outward: what the world did. VIGIL is inward: what the floor did. Both land on the <a href="#bridge">Bridge</a>.</p>
      </aside>
    </div>
  </div>`;
  el.scrollTop = scroll; restore();
}

/**
 * The evidence board: what was watched, what was seen, where it bears.
 * Left, the watchlist entries the run read; middle, each item it reported,
 * coloured by kind; right, the room its proposal routes to. A confirmed
 * finding is a solid line, a reported one fine, a rumour dashed — so the
 * strength of the evidence is visible before a word is read.
 */
const KIND_HEX = { opportunity: '#4fc58a', threat: '#e2554f', signal: '#5ec4e2', action: '#e0a64e' };
function evidenceBoard(watch, run) {
  const items = run.items || [];
  const match = (it) => { const w = String(it.watching || '').toLowerCase(); return w ? watch.find((x) => w.includes(x.text.toLowerCase()) || x.text.toLowerCase().includes(w)) : null; };
  const sources = [];
  const srcOf = items.map((it) => { const m = match(it); const key = m ? m.id : it.watching ? `w:${it.watching}` : 'brief'; let s = sources.find((x) => x.key === key); if (!s) { s = { key, label: m ? m.text : it.watching || 'the brief', tag: m?.tag }; sources.push(s); } return s; });
  const rooms = [];
  const roomOf = items.map((it) => { const id = it.proposal?.room; if (!id) return null; let r = rooms.find((x) => x.id === id); if (!r) { r = { id, label: ROOM_BY_ID[id]?.name || id }; rooms.push(r); } return r; });
  const ROW = 46, H = Math.max(items.length, sources.length, rooms.length) * ROW + 30;
  const y = (i, n) => 15 + (H - 30) / Math.max(1, n) * (i + 0.5);
  const cut = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
  const dash = (c) => (c === 'confirmed' ? '' : c === 'rumour' ? '4 4' : '1 3');
  return `<figure class="board">
    <figcaption><span>WATCHED</span><span>OBSERVED · ${items.length}</span><span>BEARS ON</span></figcaption>
    <svg viewBox="0 0 1000 ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="What was watched, what was seen, where it bears">
      ${items.map((it, i) => { const si = sources.indexOf(srcOf[i]), ri = rooms.indexOf(roomOf[i]); const col = KIND_HEX[it.kind] || '#8490a0';
        return `<g class="link" data-i="${i}"><path d="${curve(250, y(si, sources.length), 400, y(i, items.length))}" stroke="${col}" stroke-dasharray="${dash(it.confidence)}"/>${roomOf[i] ? `<path d="${curve(640, y(i, items.length), 790, y(ri, rooms.length))}" stroke="${col}" stroke-dasharray="${dash(it.confidence)}"/>` : ''}</g>`; }).join('')}
      ${sources.map((s, i) => `<g class="node src"><circle cx="250" cy="${y(i, sources.length)}" r="3.5"/><text x="238" y="${y(i, sources.length) + 4}" text-anchor="end">${esc(cut(s.label, 30))}</text>${s.tag ? `<text class="tag" x="238" y="${y(i, sources.length) + 17}" text-anchor="end">${esc(s.tag)}</text>` : ''}</g>`).join('')}
      ${items.map((it, i) => `<g class="node item" style="--k:${KIND_HEX[it.kind] || '#8490a0'}"><rect x="400" y="${y(i, items.length) - 15}" width="240" height="30" rx="3"/><circle cx="412" cy="${y(i, items.length)}" r="3"/><text x="422" y="${y(i, items.length) + 4}">${esc(cut(it.headline, 30))}</text><title>${esc(it.headline)} — ${esc(it.kind)}, ${esc(it.confidence || 'unrated')}</title></g>`).join('')}
      ${rooms.map((r, i) => `<g class="node room"><circle cx="790" cy="${y(i, rooms.length)}" r="3.5"/><text x="802" y="${y(i, rooms.length) + 4}">${esc(r.label)}</text></g>`).join('')}
    </svg>
  </figure>`;
}

function runView(run) {
  const items = run.items || [];
  return `<div class="run-head">
      <p class="hook">${esc(run.summary || '')}</p>
      <p class="faint">${esc(run.id || '')} · ${esc(stampFull(run.asOf))}${run.usage?.searches ? ` · ${run.usage.searches} search${run.usage.searches === 1 ? '' : 'es'}` : ''}${run.usage?.in ? ` · ${num(run.usage.in)} in / ${num(run.usage.out)} out` : ''}</p>
    </div>
    ${run.quiet && !items.length ? '<p class="vital">A quiet watch. Nothing on the list moved in a way that touches a venture.</p>' : ''}
    ${items.map((it, i) => `<div class="card intel-item">
      <div class="card-head">${chip(it.kind, KIND_TONE[it.kind])}${chip(it.confidence, CONF_TONE[it.confidence])}<b>${esc(it.headline)}</b></div>
      <p>${esc(it.detail)}</p>
      <p class="ash">${it.watching ? `watching: ${esc(it.watching)}` : 'from the brief'}${it.source ? ` · source: ${esc(it.source)}` : ' · <span class="flare">no source — treat as rumour</span>'}</p>
      ${it.proposal ? `<p class="proposal">proposes ${chip(it.proposal.priority, PRIO_TONE[PRIO.indexOf(it.proposal.priority)])} ${esc(ROOM_BY_ID[it.proposal.room]?.name || it.proposal.room)}: ${esc(it.proposal.text)} ${st.taken[`${run.id}:${i}`] ? '<span class="vital">taken</span>' : `<button class="tiny" data-act="take" data-i="${i}" data-room="${esc(it.proposal.room)}" data-text="${esc(it.proposal.text)}" data-p="${PRIO.indexOf(it.proposal.priority)}">take it</button>`}</p>` : ''}
    </div>`).join('')}`;
}

/* ---------- events ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'back') go('#');
  else if (act === 'reload') load();
  else if (act === 'tag') store.tagItem('watch', id, b.dataset.tag);
  else if (act === 'remove') store.removeItem('watch', id);
  else if (act === 'take') {
    store.addOrder(b.dataset.room, b.dataset.text, Number(b.dataset.p), { source: 'counsel', note: `from the watch, ${st.run?.id || ''}`.trim() });
    st.taken[`${st.run?.id}:${b.dataset.i}`] = true;
    paint({ keepScroll: true });
  } else if (act === 'show-run') {
    const r = st.runs.find((x) => x.id === id);
    if (r?.output?.items) { st.run = { id: r.id, ...r.output, asOf: r.finished_at || r.started_at, usage: r.usage }; paint(); }
  }
}

async function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f, load)) return;
  if (f.dataset.act === 'watch-add') { const t = f.text.value.trim(); if (!t) return; store.addItem('watch', t); f.reset(); }
  else if (f.dataset.act === 'intel-run') {
    const q = f.q.value.trim();
    st.busy = true; st.runError = null; paint({ keepScroll: true });
    try {
      const r = await api.intel(q, brain ? { brief: brain.brief, doctrine: brain.doctrine, memory: brain.memory } : {});
      st.run = { id: r.run, items: r.items, summary: r.summary, quiet: r.quiet, sources: r.sources, asOf: r.asOf, usage: r.usage };
      f.q.value = '';
    } catch (err) { st.runError = err.message; }
    st.busy = false; await load();
  }
}
