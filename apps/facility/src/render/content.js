/**
 * CONTENT — everything HERALD has made, in one place.
 *
 * Every draft from the brain export with the status the operator has
 * given it here (kept in the store, synced back to the vault by
 * tools/vault-sync.mjs). Tabs by status, a search box, the body on
 * demand, and the same status controls as BEACON. The board in Obsidian
 * (02-Content/Board.md) shows the same thing from the vault's side.
 */
import { esc } from './widgets.js';

const STATUSES = ['all', 'draft', 'review', 'approved', 'scheduled', 'posted', 'killed'];
const TONE = { draft: 'flare', review: 'cyan', approved: 'vital', scheduled: 'arcane', posted: 'vital', killed: 'deny' };
const NEXT = { draft: ['review', 'approved', 'killed'], review: ['approved', 'draft', 'killed'], approved: ['scheduled', 'posted', 'killed'], scheduled: ['posted', 'approved', 'killed'], posted: ['approved'], killed: ['draft'] };
const chip = (t, tone = '') => `<span class="chip ${tone}">${esc(t)}</span>`;
let query = '';

export function renderContent(el, { store, brain }, hash = '#content', { keepScroll = false } = {}) {
  const tab = /^#content\/([a-z]+)/.exec(hash)?.[1] || 'all';
  const scroll = keepScroll ? el.scrollTop : 0;
  const all = store.drafts().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const q = query.toLowerCase();
  const shown = all.filter((d) => (tab === 'all' || d.status === tab) && (!q || [d.hook, d.title, d.source_module, d.source_subject, d.body, d.id].some((x) => String(x || '').toLowerCase().includes(q))));
  const count = (s) => (s === 'all' ? all.length : all.filter((d) => d.status === s).length);
  const sources = (brain?.files?.['02-Content'] || []).filter((f) => f.path.includes('/Sources/')).length;
  const runs = new Set(all.map((d) => d.run)).size;
  const cards = shown.map((d) => `<div class="card">
      <div class="card-head">${chip(d.format, 'arcane')} ${chip(d.platform)} ${chip(d.status, TONE[d.status])} <span class="ash">${esc(d.id)} · ${esc(String(d.created).slice(0, 16))}</span></div>
      <p class="hook">${esc(d.hook)}</p>
      <p class="ash">${esc(d.source_subject)} · ${esc(d.source_module)} · ${d.word_count}w${d.angle ? ` · <span class="faint">${esc(d.angle)}</span>` : ''}${d.compliance_notes ? ` · <span class="flare">note: ${esc(d.compliance_notes)}</span>` : ''}</p>
      <div class="acts">${(NEXT[d.status] || []).map((n) => `<button class="tiny" data-act="draft" data-id="${esc(d.id)}" data-status="${n}">${n}</button>`).join('')} <button class="tiny ghost" data-act="draft-open" data-id="${esc(d.id)}">read</button>${d.source_url ? ` <a class="tiny ghost" href="${esc(d.source_url)}" target="_blank" rel="noopener">source ↗</a>` : ''}</div>
      <pre class="body hidden" id="draft-${esc(d.id)}">${esc(d.body)}</pre>
    </div>`).join('');
  el.innerHTML = `<div class="wrap">
    <div class="view-head"><button class="back ghost" data-act="back">← Floor</button><h1>CONTENT</h1><span class="sub">everything HERALD has made · ${all.length} drafts · ${runs} run${runs === 1 ? '' : 's'} · ${sources} source note${sources === 1 ? '' : 's'} copied</span><span class="spacer"></span>
      <input type="search" id="content-q" placeholder="Search hooks, sources, bodies…" value="${esc(query)}" style="width:260px"></div>
    <div class="stat-row">${['draft', 'review', 'approved', 'scheduled', 'posted', 'killed'].map((s) => `<div class="stat ${s === 'posted' ? 'vital' : s === 'killed' ? 'breach' : ''}"><b>${count(s)}</b><span>${s}</span></div>`).join('')}</div>
    <div class="tabs">${STATUSES.map((s) => `<button data-act="tab" data-tab="${s}" class="${tab === s ? 'on' : ''}">${s.toUpperCase()} <span class="faint">${count(s)}</span></button>`).join('')}</div>
    ${cards || '<p class="empty">Nothing here. HERALD lands drafts in the brain; the site shows them at the next build.</p>'}
    <p class="src">Status moved here is written to your Supabase row when signed in, and npm run vault:sync brings it into the vault's files — the vault stays the truth. The daemon (npm run herald:auto) keeps this filling.</p>
  </div>`;
  if (keepScroll) el.scrollTop = scroll;
  const qi = el.querySelector('#content-q'); qi.addEventListener('input', (e) => { query = e.target.value; const pos = e.target.selectionStart; renderContent(el, { store, brain }, hash, { keepScroll: true }); const again = el.querySelector('#content-q'); again.focus(); again.setSelectionRange(pos, pos); });
}

export function bindContent(el, { store, go }) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'back') go('#');
    else if (act === 'tab') go(b.dataset.tab === 'all' ? '#content' : `#content/${b.dataset.tab}`);
    else if (act === 'draft') store.markDraft(id, b.dataset.status);
    else if (act === 'draft-open') { const pre = el.querySelector(`#draft-${CSS.escape(id)}`); if (pre) pre.classList.toggle('hidden'); }
  });
}
