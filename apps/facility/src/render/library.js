/**
 * THE LIBRARY — the Arcane Archives, as a room you can search.
 *
 *   #library                 browse: subjects on the left, modules on the right, search across everything
 *   #library/<module id>     one module: its text, its provenance, what has been cut from it, and HERALD
 *
 * Everything comes from /api/modules (archive_modules, put there by
 * tools/archives-sync.mjs from the vault). "Generate content" posts to
 * /api/herald and then sends you to the drafts in BEACON. The Library
 * answers "what do we know?"; BEACON answers "what are we saying?".
 */
import { api } from '../core/api.js';
import { esc, chip, when, num, loading, empty, failed, handleKeyForm, debounce, keepFocus, STATUS_TONE, GATE_TONE, LANE_TONE } from './ui.js';

const FORMATS = ['short', 'medium', 'thread', 'email', 'teaser'];
const PAGE = 60;

// One state object for the view; the URL hash carries what is being looked at.
const st = { q: '', subject: '', lane: '', gate: '!never', offset: 0, list: null, count: 0, subjects: null, sources: null, error: null, busy: false, module: null, moduleId: '', moduleError: null, gen: null };
let el = null, go = null, brainRef = null;

export function bindLibrary(view, ctx) {
  el = view; go = ctx.go; brainRef = ctx.brain;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('input', (e) => { if (e.target.id === 'lib-q') { st.q = e.target.value; st.offset = 0; search(); } });
  el.addEventListener('change', (e) => { if (e.target.id === 'lib-lane') { st.lane = e.target.value; st.offset = 0; load(); } if (e.target.id === 'lib-gate') { st.gate = e.target.value; st.offset = 0; load(); } });
}

export function renderLibrary(view, ctx, hash = '#library') {
  el = view;
  const id = /^#library\/(.+)$/.exec(hash)?.[1];
  if (id) { const mid = decodeURIComponent(id); if (mid !== st.moduleId || !st.module) { st.moduleId = mid; st.module = null; st.moduleError = null; st.gen = null; loadModule(mid); } else paint(); return; }
  st.moduleId = ''; st.module = null;
  if (!st.subjects && !st.error) loadSubjects();
  if (!st.list && !st.error) load(); else paint();
}

/* ---------- data ---------- */
const search = debounce(load, 220);
async function load() {
  st.busy = true; st.error = null; paint();
  try {
    const r = await api.modules.search({ q: st.q, subject: st.subject, lane: st.lane, gate: st.gate, limit: PAGE, offset: st.offset });
    st.list = r.rows; st.count = r.count;
  } catch (e) { st.error = e; st.list = null; }
  st.busy = false; paint();
}
async function loadSubjects() {
  try { const r = await api.modules.subjects(); st.subjects = r.subjects; st.sources = r.sources; } catch (e) { if (!st.error) st.error = e; }
  paint();
}
async function loadModule(id) {
  paint();
  try { const r = await api.modules.get(id); st.module = r.module; st.module.drafts = r.drafts; }
  catch (e) { st.moduleError = e; }
  paint();
}

/* ---------- paint ---------- */
function paint() {
  if (!el) return;
  if (st.moduleId) return paintModule();
  const restore = keepFocus(el, '#lib-q');
  const scroll = el.scrollTop;
  const src = st.sources?.find((s) => s.status !== 'idle') || st.sources?.[0];
  const total = st.subjects ? st.subjects.reduce((n, s) => n + Number(s.modules || 0), 0) : 0;
  el.innerHTML = `<div class="wrap app">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>THE LIBRARY</h1>
      <span class="sub">The Arcane Archives${total ? ` · ${num(total)} modules · ${st.subjects.length} subjects` : ''}${src?.last_synced_at ? ` · indexed ${when(src.last_synced_at)}` : ''}</span>
      <span class="spacer"></span>
      <span class="ash">${st.busy ? 'searching…' : st.list ? `${num(st.count)} match${st.count === 1 ? '' : 'es'}` : ''}</span>
    </div>
    <div class="toolbar">
      <input type="search" id="lib-q" placeholder="Search titles, subjects and the text of every module   ( / )" value="${esc(st.q)}" autocomplete="off">
      <select id="lib-gate" title="HERALD's source gate — 05-Knowledge/Archives-Sources.md">
        <option value="!never" ${st.gate === '!never' ? 'selected' : ''}>allowed + open</option>
        <option value="allowed" ${st.gate === 'allowed' ? 'selected' : ''}>allowed only</option>
        <option value="" ${st.gate === '' ? 'selected' : ''}>everything, incl. never</option>
      </select>
      <select id="lib-lane">
        <option value="">every lane</option>
        ${['mindset', 'philosophy', 'sales', 'dark', 'lifestyle', 'health', 'trading', 'meta', 'external'].map((l) => `<option value="${l}" ${st.lane === l ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      ${st.subject ? `<span class="chip cyan">${esc(st.subject)} <button class="x" data-act="subject" data-subject="" title="clear">×</button></span>` : ''}
    </div>
    <div class="lib-grid">
      <aside class="lib-subjects">${subjectsList()}</aside>
      <section class="lib-results">${results()}</section>
    </div>
  </div>`;
  el.scrollTop = scroll; restore();
}

function subjectsList() {
  if (st.error && !st.subjects) return '';
  if (!st.subjects) return loading('subjects');
  const rows = st.subjects.filter((s) => (st.gate === '' || s.gate !== 'never') && Number(s.modules) > 0);
  return `<h2>Subjects <span class="faint">${rows.length}</span></h2>
    <div class="subject-list">
      <button class="subject ${st.subject ? '' : 'on'}" data-act="subject" data-subject=""><span>All subjects</span><span class="n">${num(rows.reduce((n, s) => n + Number(s.modules), 0))}</span></button>
      ${rows.map((s) => `<button class="subject ${st.subject === s.subject ? 'on' : ''} ${s.gate}" data-act="subject" data-subject="${esc(s.subject)}" title="${esc(s.lane)} · ${s.gate}"><span>${esc(s.subject)}</span><span class="n">${num(s.modules)}</span></button>`).join('')}
    </div>
    <p class="src">Green: under Allowed in Archives-Sources.md — HERALD picks from these on its own. Grey: open, on request. Red: never.</p>`;
}

function results() {
  if (st.error) return failed(st.error, { retry: 'reload' });
  if (!st.list) return loading('modules');
  if (!st.list.length) return empty(st.q ? `Nothing matches "${st.q}".` : 'No modules here yet.', !st.count && !st.q && !st.subject ? '<p class="ash">The Archives have not been put in the database: run <code>npm run herald:index</code> then <code>npm run archives:sync</code>.</p>' : '');
  const rows = st.list.map((m) => `<tr class="row" data-act="open" data-id="${esc(m.id)}">
      <td class="title"><a href="#library/${encodeURIComponent(m.id)}">${esc(m.title)}</a>${m.sensitive ? ' <span class="chip deny" title="sensitive: the lint gate will bite">sensitive</span>' : ''}</td>
      <td class="ash">${esc(m.subject)}</td>
      <td>${chip(m.lane, LANE_TONE[m.lane] || 'ash')}</td>
      <td class="r ash">${num(m.words)}</td>
      <td>${chip(m.gate, GATE_TONE[m.gate])}</td>
    </tr>`).join('');
  const pages = Math.ceil(st.count / PAGE), page = Math.floor(st.offset / PAGE) + 1;
  return `<table class="grid modules"><thead><tr><th>Module</th><th>Subject</th><th>Lane</th><th class="r">Words</th><th>Gate</th></tr></thead><tbody>${rows}</tbody></table>
    ${pages > 1 ? `<div class="pager"><button class="tiny" data-act="page" data-delta="-1" ${page <= 1 ? 'disabled' : ''}>← newer</button><span class="ash">page ${page} of ${pages}</span><button class="tiny" data-act="page" data-delta="1" ${page >= pages ? 'disabled' : ''}>older →</button></div>` : ''}`;
}

function paintModule() {
  const m = st.module;
  const scroll = el.scrollTop;
  el.innerHTML = `<div class="wrap app">
    <div class="view-head">
      <button class="back ghost" data-act="library">← Library</button>
      <h1>${m ? esc(m.title) : esc(st.moduleId)}</h1>
      ${m ? `<span class="sub">${esc(m.subject)}</span>${chip(m.lane, LANE_TONE[m.lane] || 'ash')}${chip(m.gate, GATE_TONE[m.gate])}${m.sensitive ? chip('sensitive', 'deny') : ''}` : ''}
      <span class="spacer"></span>
      ${m ? `<span class="ash">${num(m.words)} words${m.source_url ? ` · <a href="${esc(m.source_url)}" target="_blank" rel="noopener">Notion ↗</a>` : ''}</span>` : ''}
    </div>
    ${st.moduleError ? failed(st.moduleError, { retry: 'reload-module' }) : !m ? loading('module') : `
    <div class="module-grid">
      <article class="module-text">${m.body ? m.body.split(/\n{2,}/).map((p) => `<p>${esc(p.trim())}</p>`).join('') : '<p class="empty">This module has no text in the database — re-run npm run archives:sync.</p>'}</article>
      <aside class="module-side">
        ${heraldPanel(m)}
        <h2>Cut from this module <span class="faint">${m.drafts?.length || 0}</span></h2>
        ${m.drafts?.length ? m.drafts.map((d) => `<a class="mini-draft" href="#beacon/draft/${esc(d.id)}">${chip(d.format, 'arcane')}${chip(d.status, STATUS_TONE[d.status])}<span class="hook">${esc(d.hook)}</span><span class="faint">${when(d.created_at)}</span></a>`).join('') : '<p class="empty">Nothing yet.</p>'}
        <h2>Provenance</h2>
        <dl class="kv">
          <dt>id</dt><dd><code>${esc(m.id)}</code></dd>
          <dt>source</dt><dd>${esc(m.source_id)}${m.source_path ? ` · <span class="ash">${esc(m.source_path)}</span>` : ''}</dd>
          ${m.notion_id ? `<dt>notion</dt><dd><code>${esc(m.notion_id)}</code></dd>` : ''}
          ${m.parent ? `<dt>course</dt><dd>${esc(m.parent)}</dd>` : ''}
          <dt>indexed</dt><dd>${when(m.indexed_at)}</dd>
          ${m.flags?.length ? `<dt>flags</dt><dd class="flare">${m.flags.map(esc).join(', ')}</dd>` : ''}
        </dl>
      </aside>
    </div>`}
  </div>`;
  el.scrollTop = scroll;
}

function heraldPanel(m) {
  const g = st.gen;
  const blocked = m.gate === 'never' || m.lane === 'external' || m.kind !== 'module';
  const why = m.kind !== 'module' ? 'This is an index page, not a module.' : m.lane === 'external' ? 'Reposted third-party writing is never a source.' : m.gate === 'never' ? 'This subject is under Never in Archives-Sources.md.' : '';
  return `<h2>HERALD</h2>
    ${blocked ? `<p class="ash">${esc(why)}</p>` : `
    <form class="gen" data-act="generate" data-id="${esc(m.id)}">
      <div class="checks">${FORMATS.map((f) => `<label class="chk"><input type="checkbox" name="formats" value="${f}" ${!g?.formats || g.formats.includes(f) ? 'checked' : ''}> ${f}</label>`).join('')}</div>
      <input name="note" placeholder="A note for the run (optional) — an angle, a platform, a line to lead with" autocomplete="off">
      ${m.gate !== 'allowed' ? `<label class="chk flare"><input type="checkbox" name="allow_open"> this subject is not under Allowed — cut from it anyway</label>` : ''}
      ${m.sensitive ? '<p class="flare">Sensitive lane: HERALD will write around the compliance gate, and the gate still refuses anything that names a compound, a dose or a claim.</p>' : ''}
      <button type="submit" class="primary" ${st.busy ? 'disabled' : ''}>${st.busy ? 'HERALD is writing… (a minute or two)' : 'Generate content'}</button>
    </form>`}
    ${g?.error ? `<div class="state error-state"><p><b>${esc(g.status === 'refused' ? 'Refused.' : 'Failed.')}</b> ${esc(g.error)}</p>${g.refused?.length ? `<ul class="list ash">${g.refused.map((r) => `<li><b>${esc(r.format)}</b>: ${r.errors.map(esc).join('; ')}</li>`).join('')}</ul>` : ''}</div>` : ''}
    ${g?.drafts?.length ? `<div class="state ok-state"><p><b>${g.drafts.length} draft${g.drafts.length === 1 ? '' : 's'} landed</b> in run <code>${esc(g.run)}</code>${g.repaired ? ' <span class="ash">(one repair)</span>' : ''}${g.usage?.in ? ` <span class="faint">· ${num(g.usage.in)} in / ${num(g.usage.out)} out</span>` : ''}.</p>
      ${g.refused?.length ? `<p class="flare">Refused by the gate: ${g.refused.map((r) => `${r.format} (${r.errors[0]})`).map(esc).join('; ')}</p>` : ''}
      ${g.warnings?.length ? `<p class="ash">Notes to read twice: ${g.warnings.map((w) => `${w.format}: ${w.warnings.join('; ')}`).map(esc).join(' · ')}</p>` : ''}
      <p><a class="button-link" href="#beacon/draft/${esc(g.drafts[0].id)}">Open in BEACON →</a></p></div>` : ''}`;
}

/* ---------- events ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'back') go('#');
  else if (act === 'library') go('#library');
  else if (act === 'reload') { st.error = null; st.subjects = null; loadSubjects(); load(); }
  else if (act === 'reload-module') { st.moduleError = null; loadModule(st.moduleId); }
  else if (act === 'subject') { e.stopPropagation(); st.subject = b.dataset.subject || ''; st.offset = 0; load(); }
  else if (act === 'page') { st.offset = Math.max(0, st.offset + Number(b.dataset.delta) * PAGE); load(); }
  else if (act === 'open' && !e.target.closest('a')) go(`#library/${encodeURIComponent(b.dataset.id)}`);
}
async function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f, () => { st.error = null; st.moduleError = null; st.subjects = null; if (st.moduleId) loadModule(st.moduleId); else { loadSubjects(); load(); } })) return;
  if (f.dataset.act === 'generate') {
    const formats = [...f.querySelectorAll('input[name=formats]:checked')].map((i) => i.value);
    if (!formats.length) return;
    st.busy = true; st.gen = { formats }; paint();
    try {
      const r = await api.herald.generate({ module_id: f.dataset.id, formats, note: f.note.value, allow_open: !!f.allow_open?.checked });
      st.gen = { ...r, formats };
      st.module.drafts = [...(r.drafts || []), ...(st.module.drafts || [])];
    } catch (err) {
      st.gen = { formats, status: err.body?.status || 'failed', error: err.message, refused: err.body?.refused || [], drafts: err.body?.drafts || [] };
      if (err.body?.drafts?.length) st.module.drafts = [...err.body.drafts, ...(st.module.drafts || [])];
    }
    st.busy = false; paint();
  }
}

/** `/` focuses the search when the Library is open. */
export function libraryKey(e) {
  if (e.key === '/' && !st.moduleId) { const q = el?.querySelector('#lib-q'); if (q) { e.preventDefault(); q.focus(); q.select(); } }
}
