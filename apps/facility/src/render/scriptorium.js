/**
 * SCRIPTORIUM — where the Library's summaries become drafts.
 *
 *   #scriptorium   the drafts waiting for a decision (approve or reject
 *                  here; edit in BEACON, which keeps every revision), the
 *                  summaries they are written from, and the two agents'
 *                  "run now"
 *
 * Drafts are content_drafts in `draft` — the same rows BEACON moves — so
 * nothing here publishes; approving is the operator's move, as always.
 */
import { api } from '../core/api.js';
import { esc, chip, when, loading, failed, empty, handleKeyForm, STATUS_TONE } from './ui.js';

const st = { drafts: null, summaries: null, error: null, loadedAt: 0, busy: {}, flash: null };
let el = null, go = null, onCounts = null;

export function bindScriptorium(view, ctx) {
  el = view; go = ctx.go; onCounts = ctx.onCounts || null;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', (e) => { e.preventDefault(); handleKeyForm(e.target, load); });
}
export function renderScriptorium(view, ctx, hash = '#scriptorium') {
  el = view;
  if ((!st.drafts && !st.error) || Date.now() - st.loadedAt > 30_000) load();
  paint();
}
async function load() {
  st.loadedAt = Date.now();
  try {
    const [d, s] = await Promise.all([api.drafts.list({ statuses: 'draft,review', limit: 100 }), api.ai.outputs({ agent: 'library-summariser', type: 'summary', limit: 40 })]);
    st.drafts = d.rows; st.summaries = s.outputs; st.error = null;
    onCounts?.(d.counts);
  } catch (e) { st.error = e; }
  paint();
}

function paint() {
  if (!el) return;
  const scroll = el.scrollTop;
  el.innerHTML = `<div class="wrap app scriptorium">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>SCRIPTORIUM</h1>
      <span class="sub">summaries into drafts · in Leo's voice</span>
      <span class="spacer"></span>
      ${runButton('library-summariser', 'Summarise the Archives')}
      ${runButton('scriptorium-drafter', 'Draft from summaries')}
      <button class="tiny ghost" data-act="reload">refresh</button>
    </div>
    ${st.flash ? `<p class="flash ${st.flash.tone === 'breach' ? 'breach' : ''}">${st.flash.html}</p>` : ''}
    ${st.error ? failed(st.error, { retry: 'reload' }) : !st.drafts ? loading('the drafts') : `
    <section>
      <h2>Waiting for a decision <span class="faint">${st.drafts.length} · nothing goes out until you approve it, and approving does not post</span></h2>
      ${st.drafts.length ? st.drafts.map(draftRow).join('') : empty('No drafts waiting. Run the Library Summariser, then the Drafter.')}
    </section>
    <section>
      <h2>Summaries from THE LIBRARY <span class="faint">${st.summaries.length}</span></h2>
      ${st.summaries.length ? st.summaries.map(summaryRow).join('') : empty('No summaries yet. Share the Arcane Archives with the Notion integration, then Summarise the Archives.')}
    </section>`}
  </div>`;
  el.scrollTop = scroll;
}

const runButton = (id, label) => `<button class="tiny ${st.busy[id] ? '' : 'primary'}" data-act="run" data-id="${id}" ${st.busy[id] ? 'disabled' : ''}>${st.busy[id] ? 'running…' : esc(label)}</button>`;

function draftRow(d) {
  return `<div class="order-row">
    <span>${chip(d.status, STATUS_TONE[d.status] || 'ash')}${chip(d.format, 'ash')}${chip(d.platform, 'ash')}${d.agent === 'SCRIBE' ? chip('SCRIBE', 'arcane') : chip(d.agent, 'ash')}</span>
    <span class="text"><b>${esc(d.title)}</b><br><span class="ash">${esc(d.hook)}</span>${d.compliance_notes ? `<br><span class="flare small">${esc(d.compliance_notes)}</span>` : ''}</span>
    <span class="faint nowrap">${esc(d.source_module || '')} · ${when(d.created_at)}</span>
    <a class="button-link" href="#beacon/draft/${esc(d.id)}">read · edit</a>
    <button class="tiny" data-act="move" data-id="${esc(d.id)}" data-status="approved">approve</button>
    <button class="tiny ghost" data-act="move" data-id="${esc(d.id)}" data-status="killed">reject</button>
  </div>`;
}
function summaryRow(o) {
  const lane = o.data?.lane || '';
  const drafted = o.data?.drafted_at;
  return `<div class="order-row">
    <span>${chip(lane || 'summary', ['health', 'trading'].includes(lane) ? 'deny' : 'ash')}${drafted ? chip(`${(o.data.drafts || []).length} drafted`, 'vital') : o.data?.withheld ? chip('withheld', 'deny') : chip('not drafted', 'ash')}</span>
    <span class="text"><b>${esc(o.title)}</b><br><span class="ash">${esc(String(o.content).slice(0, 320))}</span></span>
    <span class="faint nowrap">${o.data?.url ? `<a href="${esc(o.data.url)}" target="_blank" rel="noopener">Notion</a> · ` : ''}${when(o.created_at)}</span>
  </div>`;
}

async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return;
  const act = b.dataset.act;
  if (act === 'back') return go('#');
  if (act === 'reload') return load();
  if (act === 'move') {
    b.disabled = true;
    try { await api.drafts.move(b.dataset.id, b.dataset.status, { note: 'from SCRIPTORIUM' }); st.flash = null; }
    catch (err) { st.flash = { tone: 'breach', html: `Could not move ${esc(b.dataset.id)}: ${esc(err.message)}` }; }
    return load();
  }
  if (act === 'run') {
    const id = b.dataset.id;
    st.busy[id] = true; paint();
    try { const r = await api.ai.run(id); st.flash = { tone: 'vital', html: `${esc(r.summary || 'done')}` }; }
    catch (err) { st.flash = { tone: 'breach', html: `${esc(err.message)} <a href="#garage/${esc(id)}">history</a>` }; }
    delete st.busy[id];
    return load();
  }
}
