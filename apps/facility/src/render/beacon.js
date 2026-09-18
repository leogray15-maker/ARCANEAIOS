/**
 * BEACON — what we are saying.
 *
 *   #beacon                    the queue: Drafts · Approved · Scheduled · Published · Rejected
 *   #beacon/<view>             one of those views
 *   #beacon/draft/<id>         the workspace for one draft: the text, its provenance, the moves, the history
 *
 * Everything comes from /api/drafts (content_drafts + content_revisions).
 * A move is one the config allows (DRAFT_TRANSITIONS); an edit is linted
 * on the server before it is kept; every change is a revision. HERALD
 * only ever lands `draft` — every button here is a human's.
 */
import { DRAFT_VIEWS, DRAFT_TRANSITIONS } from '@arcane/config';
import { api } from '../core/api.js';
import { esc, chip, when, stampFull, num, loading, empty, failed, handleKeyForm, keepFocus, copy, STATUS_TONE } from './ui.js';

const PLATFORMS = ['X', 'Threads', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Email', 'Kick'];
const MOVE_LABEL = { review: 'Mark for review', approved: 'Approve', draft: 'Back to draft', killed: 'Reject', scheduled: 'Mark scheduled', posted: 'Mark published' };
const MOVE_TONE = { approved: 'primary', killed: 'danger', posted: 'primary' };

const st = { view: 'drafts', q: '', list: null, count: 0, counts: null, error: null, busy: false, draft: null, draftId: '', draftError: null, dirty: false, saving: '', flash: '', act: null };
let el = null, go = null, onCounts = null;

export function bindBeacon(view, ctx) {
  el = view; go = ctx.go; onCounts = ctx.onCounts;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('input', (e) => {
    if (e.target.id === 'bc-q') { st.q = e.target.value; searchSoon(); }
    if (e.target.closest('form.editor')) { st.dirty = true; const b = el.querySelector('#save-btn'); if (b) { b.disabled = false; b.textContent = 'Save'; } if (e.target.name === 'body') { autosize(e.target); const w = el.querySelector('#word-count'); if (w) w.textContent = `${countWords(e.target.value)} words`; } }
  });
  window.addEventListener('beforeunload', (e) => { if (st.dirty && st.draftId) { e.preventDefault(); e.returnValue = ''; } });
}

export function renderBeacon(view, ctx, hash = '#beacon') {
  el = view;
  const d = /^#beacon\/draft\/([A-Za-z0-9-]+)/.exec(hash)?.[1];
  if (d) { if (d !== st.draftId || !st.draft) { st.draftId = d; st.draft = null; st.draftError = null; st.dirty = false; st.flash = st.pendingFlash || ''; st.pendingFlash = ''; loadDraft(d); } else paint(); return; }
  st.draftId = ''; st.draft = null;
  const v = /^#beacon\/([a-z]+)/.exec(hash)?.[1];
  const next = DRAFT_VIEWS.some((x) => x.id === v) ? v : 'drafts';
  if (next !== st.view || !st.list) { st.view = next; load(); } else paint();
}

/* ---------- data ---------- */
let t = null; const searchSoon = () => { clearTimeout(t); t = setTimeout(load, 220); };
async function load() {
  st.busy = true; st.error = null; paint();
  try {
    const view = DRAFT_VIEWS.find((v) => v.id === st.view);
    const r = await api.drafts.list({ statuses: view.states.join(','), q: st.q, limit: 300 });
    st.list = r.rows; st.count = r.count; st.counts = r.counts; onCounts?.(r.counts);
  } catch (e) { st.error = e; st.list = null; }
  st.busy = false; paint();
}
async function loadDraft(id) {
  paint();
  try { const r = await api.drafts.get(id); st.draft = r.draft; } catch (e) { st.draftError = e; }
  paint();
}

/* ---------- paint ---------- */
function paint() {
  if (!el) return;
  if (st.draftId) return paintDraft();
  const restore = keepFocus(el, '#bc-q');
  const scroll = el.scrollTop;
  const c = st.counts || {};
  const countOf = (v) => v.states.reduce((n, s) => n + (c[s] || 0), 0);
  el.innerHTML = `<div class="wrap app">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>BEACON</h1>
      <span class="sub">what we are saying · <b>${num(countOf(DRAFT_VIEWS[0]))}</b> waiting · <b>${num(c.approved || 0)}</b> approved · <b>${num(c.posted || 0)}</b> published</span>
      <span class="spacer"></span>
      <input type="search" id="bc-q" placeholder="Search hooks, titles, sources" value="${esc(st.q)}" autocomplete="off" style="width:260px">
      <a class="button-link" href="#library">+ from the Library</a>
    </div>
    <div class="tabs">${DRAFT_VIEWS.map((v) => `<button data-act="view" data-view="${v.id}" class="${st.view === v.id ? 'on' : ''}" title="${esc(v.note)}">${v.name.toUpperCase()} <span class="faint">${num(countOf(v))}</span></button>`).join('')}</div>
    ${list()}
  </div>`;
  el.scrollTop = scroll; restore();
}

function list() {
  if (st.error) return failed(st.error, { retry: 'reload' });
  if (!st.list) return loading('drafts');
  const view = DRAFT_VIEWS.find((v) => v.id === st.view);
  if (!st.list.length) return empty(st.q ? `Nothing in ${view.name.toLowerCase()} matches "${st.q}".` : view.id === 'drafts' ? 'Nothing waiting. HERALD lands drafts here from the Library.' : `Nothing ${view.name.toLowerCase()} yet.`, view.id === 'drafts' && !st.q ? '<p><a class="button-link" href="#library">Open the Library →</a></p>' : '');
  const rows = st.list.map((d) => `<tr class="row" data-act="open" data-id="${esc(d.id)}">
      <td class="hook-cell"><a href="#beacon/draft/${esc(d.id)}">${esc(d.hook || d.title)}</a>${d.compliance_notes ? ` <span class="chip flare" title="${esc(d.compliance_notes)}">note</span>` : ''}${d.model === 'mock' ? ' <span class="chip deny" title="made by the mock writer, not HERALD">mock</span>' : ''}</td>
      <td>${chip(d.format, 'arcane')}</td>
      <td class="ash">${esc(d.platform)}</td>
      <td class="ash src-cell" title="${esc(d.source_subject)}">${esc(d.source_module)}</td>
      <td>${chip(d.status, STATUS_TONE[d.status])}</td>
      <td class="ash r nowrap" title="${esc(stampFull(d.created_at))}">${when(d.status === 'posted' ? d.published_at || d.created_at : d.status === 'scheduled' ? d.scheduled_for || d.created_at : d.created_at)}</td>
    </tr>`).join('');
  return `<table class="grid drafts"><thead><tr><th>Hook</th><th>Format</th><th>Platform</th><th>Source module</th><th>Status</th><th class="r">${st.view === 'published' ? 'Published' : st.view === 'scheduled' ? 'For' : 'Created'}</th></tr></thead><tbody>${rows}</tbody></table>
    ${st.count > st.list.length ? `<p class="ash">Showing ${st.list.length} of ${num(st.count)}.</p>` : ''}`;
}

function paintDraft() {
  const d = st.draft;
  const scroll = el.scrollTop;
  const editing = el.querySelector('form.editor');
  const draftText = editing && st.dirty ? { title: editing.title.value, platform: editing.platform.value, body: editing.body.value } : null;
  el.innerHTML = `<div class="wrap app">
    <div class="view-head">
      <button class="back ghost" data-act="queue">← BEACON</button>
      <h1>${d ? esc(d.id) : esc(st.draftId)}</h1>
      ${d ? `${chip(d.format, 'arcane')}${chip(d.status, STATUS_TONE[d.status])}${d.model === 'mock' ? chip('mock', 'deny') : ''}<span class="sub">${esc(d.platform)} · rev ${d.revision} · ${num(d.word_count)} words</span>` : ''}
      <span class="spacer"></span>
      ${d ? `<span class="ash" title="${esc(stampFull(d.created_at))}">made ${when(d.created_at)}${d.updated_at !== d.created_at ? ` · changed ${when(d.updated_at)}` : ''}</span>` : ''}
    </div>
    ${st.draftError ? failed(st.draftError, { retry: 'reload-draft' }) : !d ? loading('draft') : `
    ${st.flash ? `<p class="flash ${/refuse|fail|could not/i.test(st.flash) ? 'breach' : 'vital'}">${esc(st.flash)}</p>` : ''}
    <div class="draft-grid">
      <section class="draft-main">
        <form class="editor" data-act="save" data-id="${esc(d.id)}">
          <div class="editor-head">
            <input name="title" value="${esc(draftText?.title ?? d.title)}" placeholder="Title (for you, not the post)" class="title-input">
            <select name="platform">${PLATFORMS.map((p) => `<option ${(draftText?.platform ?? d.platform) === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          </div>
          <textarea name="body" spellcheck="true">${esc(draftText?.body ?? d.body)}</textarea>
          <div class="editor-foot">
            <span class="ash" id="word-count">${countWords(draftText?.body ?? d.body)} words</span>
            <span class="spacer"></span>
            <button type="button" class="ghost" data-act="copy" data-id="${esc(d.id)}">Copy</button>
            <button type="submit" id="save-btn" class="primary" ${st.dirty ? '' : 'disabled'}>${st.saving || (st.dirty ? 'Save' : 'Saved')}</button>
          </div>
        </form>
        ${d.compliance_notes ? `<p class="flare"><b>Read twice:</b> ${esc(d.compliance_notes)}</p>` : ''}
        <h2>History <span class="faint">${d.revisions.length}</span></h2>
        <table class="grid history">${d.revisions.map((r) => `<tr><td class="nowrap"><b>${r.revision}</b></td><td>${chip(r.kind, r.kind === 'status' ? STATUS_TONE[r.status_after] : r.kind === 'generated' ? 'arcane' : 'cyan')}</td><td>${r.kind === 'status' ? `${esc(r.status_before)} → <b>${esc(r.status_after)}</b>` : r.kind === 'generated' ? `by HERALD` : `by ${esc(r.actor)}`}${r.note ? ` <span class="ash">— ${esc(r.note)}</span>` : ''}</td><td class="ash nowrap" title="${esc(stampFull(r.created_at))}">${when(r.created_at)}</td><td class="r">${r.body && r.revision !== d.revision && r.kind !== 'status' ? `<button class="tiny ghost" data-act="restore" data-rev="${r.revision}">restore</button>` : ''}</td></tr>`).join('')}</table>
      </section>
      <aside class="draft-side">
        <h2>Move</h2>
        <div class="moves">${(DRAFT_TRANSITIONS[d.status] || []).map((s) => `<button class="${MOVE_TONE[s] || ''}" data-act="move" data-status="${s}" ${st.act ? 'disabled' : ''}>${MOVE_LABEL[s] || s}</button>`).join('')}</div>
        ${st.act === 'scheduled' ? `<form class="inline" data-act="move-form" data-status="scheduled"><input type="datetime-local" name="when" required><button type="submit" class="primary">Schedule</button><button type="button" class="ghost" data-act="cancel">cancel</button></form>` : ''}
        ${st.act === 'posted' ? `<form class="inline" data-act="move-form" data-status="posted"><input name="url" placeholder="Where it went (URL, optional)" style="flex:1"><button type="submit" class="primary">Published</button><button type="button" class="ghost" data-act="cancel">cancel</button></form>` : ''}
        ${st.act === 'killed' ? `<form class="inline" data-act="move-form" data-status="killed"><input name="note" placeholder="Why (one line, optional)" style="flex:1"><button type="submit" class="danger">Reject</button><button type="button" class="ghost" data-act="cancel">cancel</button></form>` : ''}
        ${d.status === 'scheduled' && d.scheduled_for ? `<p class="ash">for ${esc(stampFull(d.scheduled_for))}</p>` : ''}
        ${d.status === 'posted' ? `<p class="ash">published ${esc(stampFull(d.published_at))}${d.published_url ? ` · <a href="${esc(d.published_url)}" target="_blank" rel="noopener">link ↗</a>` : ''}</p>` : ''}
        <h2>HERALD</h2>
        <div class="moves">
          <button data-act="regen" data-id="${esc(d.id)}" data-kind="regenerate" ${st.busy ? 'disabled' : ''}>${st.busy ? 'writing…' : `Regenerate ${d.format}`}</button>
          <button data-act="regen" data-id="${esc(d.id)}" data-kind="variant" ${st.busy ? 'disabled' : ''}>Alternate take</button>
        </div>
        <p class="src">A new draft from the same module; this one stays. Regenerate keeps the format; an alternate take is told to find a different line.</p>
        <h2>Provenance</h2>
        <dl class="kv">
          <dt>module</dt><dd>${d.module_id ? `<a href="#library/${encodeURIComponent(d.module_id)}">${esc(d.source_module)}</a>` : esc(d.source_module)}</dd>
          <dt>subject</dt><dd>${esc(d.source_subject)}</dd>
          ${d.source_url ? `<dt>notion</dt><dd><a href="${esc(d.source_url)}" target="_blank" rel="noopener">open ↗</a></dd>` : ''}
          ${d.source_note ? `<dt>note</dt><dd class="ash">${esc(d.source_note)}</dd>` : ''}
          <dt>angle</dt><dd>${esc(d.angle)}</dd>
          <dt>cta</dt><dd>${esc(d.cta)}${d.tags?.length ? ` · ${d.tags.map((t) => chip(t)).join('')}` : ''}</dd>
          <dt>run</dt><dd><code>${esc(d.run_id)}</code>${d.model ? ` <span class="faint">${esc(d.model)}</span>` : ''}</dd>
          ${d.parent_id ? `<dt>from</dt><dd><a href="#beacon/draft/${esc(d.parent_id)}">${esc(d.parent_id)}</a></dd>` : ''}
          ${d.approved_at ? `<dt>approved</dt><dd>${esc(stampFull(d.approved_at))}</dd>` : ''}
          ${d.rejected_at ? `<dt>rejected</dt><dd>${esc(stampFull(d.rejected_at))}</dd>` : ''}
        </dl>
      </aside>
    </div>`}
  </div>`;
  el.scrollTop = scroll;
  const ta = el.querySelector('textarea[name=body]'); if (ta) autosize(ta);
}

const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.max(240, ta.scrollHeight + 4)}px`; };
const countWords = (s) => (String(s).trim().match(/\S+/g) || []).length;

/* ---------- events ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return;
  const act = b.dataset.act;
  if (act === 'back') go('#');
  else if (act === 'queue') { if (!leaveOk()) return; go(`#beacon/${st.view}`); }
  else if (act === 'view') go(`#beacon/${b.dataset.view}`);
  else if (act === 'reload') load();
  else if (act === 'reload-draft') { st.draftError = null; loadDraft(st.draftId); }
  else if (act === 'open' && !e.target.closest('a')) go(`#beacon/draft/${b.dataset.id}`);
  else if (act === 'copy') { const body = el.querySelector('textarea[name=body]')?.value || st.draft?.body || ''; copy(body).then(() => flash('Copied.'), () => flash('Could not copy — select the text instead.')); }
  else if (act === 'cancel') { st.act = null; paint(); }
  else if (act === 'move') { const s = b.dataset.status; if (['scheduled', 'posted', 'killed'].includes(s)) { st.act = s; paint(); } else move(s); }
  else if (act === 'restore') { const r = st.draft.revisions.find((x) => String(x.revision) === b.dataset.rev); if (r) { const f = el.querySelector('form.editor'); f.body.value = r.body; if (r.title) f.title.value = r.title; st.dirty = true; paint(); flash(`Revision ${r.revision} loaded into the editor — save to keep it.`); } }
  else if (act === 'regen') regen(b.dataset.id, b.dataset.kind);
}
async function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f, () => { st.error = null; st.draftError = null; if (st.draftId) loadDraft(st.draftId); else load(); })) return;
  if (f.dataset.act === 'save') return save(f);
  if (f.dataset.act === 'move-form') {
    const s = f.dataset.status;
    const extra = s === 'scheduled' ? { scheduled_for: new Date(f.when.value).toISOString() } : s === 'posted' ? { published_url: f.url.value.trim() } : { note: f.note.value.trim() };
    st.act = null; return move(s, extra);
  }
}

function leaveOk() { return !st.dirty || confirm('Unsaved changes to this draft. Leave anyway?'); }

async function save(f) {
  const id = f.dataset.id; const d = st.draft;
  const patch = {};
  if (f.title.value.trim() !== d.title) patch.title = f.title.value.trim();
  if (f.platform.value !== d.platform) patch.platform = f.platform.value;
  if (f.body.value.replace(/\r\n/g, '\n').trim() !== d.body) patch.body = f.body.value;
  if (!Object.keys(patch).length) { st.dirty = false; paint(); return; }
  st.saving = 'Saving…'; const b = f.querySelector('#save-btn'); b.disabled = true; b.textContent = st.saving;
  try {
    const r = await api.drafts.edit(id, patch);
    st.saving = ''; st.dirty = false;
    st.draft = { ...r.draft, revisions: st.draft.revisions };
    await loadDraft(id);
    flash(`Saved as revision ${r.draft.revision}.`);
  } catch (err) {
    st.saving = '';
    flash(err.needsKey ? 'Operator key needed — open ● SYNC in the bar.' : err.message);
    paint(); const again = el.querySelector('#save-btn'); if (again) { again.disabled = false; again.textContent = 'Save'; }
  }
}

async function move(status, extra = {}) {
  if (st.dirty && !confirm('You have unsaved edits. Move the draft without saving them?')) return;
  const id = st.draftId;
  try {
    const r = await api.drafts.move(id, status, extra);
    st.draft = { ...r.draft, revisions: st.draft.revisions }; st.dirty = false;
    await loadDraft(id);
    flash(`${id} → ${status}.`);
    st.list = null; // the queue has changed
  } catch (err) { flash(err.message); paint(); }
}

async function regen(id, kind) {
  const d = st.draft;
  st.busy = true; paint();
  try {
    const r = await api.herald.generate({ module_id: d.module_id, formats: [d.format], parent_id: d.id, note: kind === 'variant' ? 'alternate take' : 'regenerate' });
    st.busy = false;
    if (r.drafts?.length) { st.pendingFlash = `New ${d.format} landed as ${r.drafts[0].id}, from ${d.id}.`; go(`#beacon/draft/${r.drafts[0].id}`); }
    else { flash(`HERALD made nothing: ${r.error || 'refused'}`); paint(); }
  } catch (err) { st.busy = false; flash(err.message); paint(); }
}

function flash(text) { st.flash = text; paint(); clearTimeout(flash.t); flash.t = setTimeout(() => { st.flash = ''; const p = el?.querySelector('.flash'); if (p) p.remove(); }, 6000); }
