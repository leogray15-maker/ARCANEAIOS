/**
 * SANCTUM — the operator, not the founder.
 *
 *   #sanctum            today: energy, sleep, the focus, a note; the protocol with streaks; the week
 *   #sanctum/<kind>     the entries of one kind: journal · reflection · principle · objective · decision
 *
 * `days`, `protocol_items`, `protocol_ticks` and `entries` — all typed by
 * Leo about Leo. Private by default: the API is operator-only, and
 * entries are never mirrored into the brain repository. No gamification;
 * a streak is a count, not a badge. Nothing here is a health claim.
 */
import { esc, chip, when, stampFull, failed, handleKeyForm, keepFocus } from './ui.js';

const KINDS = [['journal', 'Journal', 'What happened, what it meant.'], ['reflection', 'Reflections', 'Slower thoughts, read again later.'], ['principle', 'Principles', 'What you hold to. Kept, not done.'], ['objective', 'Objectives', 'Where the life is pointed. Done or dropped.'], ['decision', 'Life decisions', 'The big ones, and why.']];
const STATUS_TONE = { open: 'ash', kept: 'arcane', done: 'vital', dropped: 'deny' };
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const daysBack = (n) => { const out = []; const d = new Date(); for (let i = 0; i < n; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); d.setDate(d.getDate() - 1); } return out; };

const st = { kind: '', editing: '', showItems: false };
let el = null, go = null, store = null;

export function bindSanctum(view, ctx) {
  el = view; go = ctx.go; store = ctx.store;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChange);
}
export function renderSanctum(view, ctx, hash = '#sanctum', { keepScroll = false } = {}) {
  el = view;
  const m = /^#sanctum\/([a-z]+)$/.exec(hash);
  st.kind = m && KINDS.some((k) => k[0] === m[1]) ? m[1] : '';
  paint({ keepScroll });
}

function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const restore = keepFocus(el, 'input, textarea');
  const scroll = keepScroll ? el.scrollTop : 0;
  const sv = store.serverStatus();
  const day = today(); const d = store.day(day);
  const items = store.protocolItems(); const ticks = store.protocolDay(day);
  const week = daysBack(7);
  const done = Object.keys(ticks).length;
  el.innerHTML = `<div class="wrap app sanctum">
    <div class="view-head">
      <button class="back ghost" data-act="${st.kind ? 'sanctum' : 'back'}">${st.kind ? '← Sanctum' : '← Floor'}</button>
      <h1>SANCTUM</h1>
      <span class="sub">${esc(day)} · protocol <b>${done}/${items.length}</b>${d.energy ? ` · energy <b>${d.energy}</b>` : ''}${d.sleep ? ` · slept <b>${d.sleep}h</b>` : ''}</span>
      <span class="spacer"></span>
      <span class="${sv.tone}" title="${esc(sv.text)}">● ${esc(sv.tone === 'vital' ? 'private · on the server' : sv.text)}</span>
    </div>
    ${sv.tone === 'breach' ? `<p class="flash breach">${esc(sv.text)}</p>` : ''}
    ${store.server.needsKey || (!store.server.ready && store.server.reason === 'no operator key') ? failed({ needsKey: true, status: 401 }) : ''}
    <div class="tabs"><button data-act="tab" data-kind="" class="${st.kind ? '' : 'on'}">TODAY</button>${KINDS.map(([k, name]) => `<button data-act="tab" data-kind="${k}" class="${st.kind === k ? 'on' : ''}">${name.toUpperCase()} <span class="faint">${store.entries(k).filter((e) => e.status !== 'dropped').length}</span></button>`).join('')}</div>
    ${st.kind ? entriesView() : todayView(day, d, items, ticks, week)}
  </div>`;
  el.scrollTop = scroll; restore();
}

function todayView(day, d, items, ticks, week) {
  const streak = (it) => (it.cadence === 'week' ? `${store.protocolWeek(it.id)} / ${it.target} this week` : `${store.protocolStreak(it.id)} day${store.protocolStreak(it.id) === 1 ? '' : 's'}`);
  return `<div class="bridge-grid">
    <div class="bridge-main">
      <section>
        <h2>Today</h2>
        <div class="fields">
          <label class="field"><span>energy 1–10</span><input type="number" min="1" max="10" data-act="day" data-field="energy" value="${esc(d.energy ?? '')}" style="width:80px" ${store.server.ready ? '' : 'disabled'}></label>
          <label class="field"><span>slept (hours)</span><input type="number" min="0" max="24" step="0.5" data-act="day" data-field="sleep" value="${esc(d.sleep ?? '')}" style="width:80px" ${store.server.ready ? '' : 'disabled'}></label>
          <label class="field wide"><span>the focus <span class="faint">(the same line as the Bridge)</span></span><input data-act="day" data-field="focus" value="${esc(d.focus || '')}" placeholder="What matters today" ${store.server.ready ? '' : 'disabled'}></label>
          <label class="field wide"><span>a note on the day</span><textarea data-act="day" data-field="note" rows="3" placeholder="How it went. Kept per day." ${store.server.ready ? '' : 'disabled'}>${esc(d.note || '')}</textarea></label>
        </div>
        <p class="src">Saved when you leave the field. Energy and sleep feed the Journal's energy-vs-R view once trades carry them too.</p>
      </section>
      <section>
        <h2>The protocol</h2>
        <table class="grid"><thead><tr><th></th><th>Item</th><th>Target</th><th>Streak</th><th>Last 7</th></tr></thead><tbody>
        ${items.map((it) => `<tr><td><input type="checkbox" data-act="tick" data-item="${esc(it.id)}" ${ticks[it.id] ? 'checked' : ''} ${store.server.ready ? '' : 'disabled'}></td><td>${esc(it.name)}</td><td class="ash">${esc(String(it.target))} ${esc(it.unit)}</td><td class="ash">${streak(it)}</td><td class="week">${week.map((k) => `<span class="cellday ${store.protocolDay(k)[it.id] ? 'on' : ''}" title="${k}"></span>`).join('')}</td></tr>`).join('')}
        </tbody></table>
        <details ${st.showItems ? 'open' : ''}><summary>the items</summary>
          ${items.map((it) => `<form class="inline" data-act="item-save" data-id="${esc(it.id)}"><input name="name" value="${esc(it.name)}" style="width:160px"><input name="target" type="number" step="any" value="${esc(String(it.target))}" style="width:70px"><input name="unit" value="${esc(it.unit)}" style="width:100px"><select name="cadence"><option value="day" ${it.cadence === 'day' ? 'selected' : ''}>per day</option><option value="week" ${it.cadence === 'week' ? 'selected' : ''}>per week</option></select><button class="tiny" type="submit">keep</button><button class="tiny ghost" type="button" data-act="item-retire" data-id="${esc(it.id)}">retire</button></form>`).join('')}
          <form class="inline" data-act="item-add"><input name="name" placeholder="A new item" style="width:160px"><input name="target" type="number" step="any" placeholder="target" style="width:70px"><input name="unit" placeholder="unit" style="width:100px"><select name="cadence"><option value="day">per day</option><option value="week">per week</option></select><button class="tiny" type="submit">add</button></form>
        </details>
      </section>
    </div>
    <aside class="bridge-side">
      <h2>The last seven days</h2>
      <table class="grid">${week.map((k) => { const dd = store.day(k); const n = store.protocolDone(k); return `<tr><td class="ash">${esc(k === day ? 'today' : k)}</td><td class="r"><b>${n}</b><span class="faint">/${items.length}</span></td><td class="ash">${dd.energy ? `e${dd.energy}` : ''} ${dd.sleep ? `${dd.sleep}h` : ''}</td><td class="faint">${esc((dd.focus || '').slice(0, 40))}</td></tr>`; }).join('')}</table>
      <h2>Principles <span class="faint">kept</span></h2>
      ${store.entries('principle').filter((e) => e.status !== 'dropped').slice(0, 6).map((e) => `<p class="doctrine">${esc(e.title || e.body.slice(0, 120))}</p>`).join('') || '<p class="empty">None written yet.</p>'}
      <h2>Objectives <span class="faint">open</span></h2>
      ${store.entries('objective').filter((e) => e.status === 'open').slice(0, 6).map((e) => `<p><a href="#sanctum/objective">${esc(e.title || e.body.slice(0, 80))}</a></p>`).join('') || '<p class="empty">None open.</p>'}
    </aside>
  </div>`;
}

function entriesView() {
  const [kind, name, note] = KINDS.find((k) => k[0] === st.kind);
  const list = store.entries(kind);
  const stateful = kind === 'objective' || kind === 'decision';
  return `<p class="ash">${esc(note)} Private: kept on the server, never mirrored into the brain.</p>
    <form data-act="entry-add" data-kind="${kind}" class="entry-form">
      <input name="title" placeholder="${kind === 'journal' ? 'A title, or the date' : 'One line'}" autocomplete="off">
      <textarea name="body" rows="4" placeholder="${kind === 'principle' ? 'The principle, and where it came from.' : kind === 'decision' ? 'The decision, the alternatives, why this one.' : 'Write.'}"></textarea>
      <div class="acts"><button type="submit" class="primary" ${store.server.ready ? '' : 'disabled'}>Keep</button></div>
    </form>
    ${list.length ? list.map((e) => `<div class="card entry ${e.status}">
      <div class="card-head">${e.status !== 'open' ? chip(e.status, STATUS_TONE[e.status]) : ''}<b>${esc(e.title || '')}</b><span class="faint" title="${esc(stampFull(e.created_at))}">${when(e.created_at)}</span></div>
      ${st.editing === e.id ? `<form data-act="entry-edit" data-id="${esc(e.id)}" class="entry-form"><input name="title" value="${esc(e.title)}"><textarea name="body" rows="6">${esc(e.body)}</textarea><div class="acts"><button type="submit" class="primary">Keep</button><button type="button" class="ghost" data-act="cancel">cancel</button></div></form>` : `<pre class="body">${esc(e.body)}</pre>
      <div class="acts">${e.status !== 'dropped' ? `<button class="tiny ghost" data-act="entry-open" data-id="${esc(e.id)}">edit</button>` : ''}${stateful && e.status === 'open' ? `<button class="tiny" data-act="entry-status" data-id="${esc(e.id)}" data-status="done">done</button>` : ''}${kind === 'principle' && e.status === 'open' ? `<button class="tiny" data-act="entry-status" data-id="${esc(e.id)}" data-status="kept">kept</button>` : ''}${e.status !== 'dropped' ? `<button class="tiny ghost" data-act="entry-status" data-id="${esc(e.id)}" data-status="dropped">drop</button>` : `<button class="tiny ghost" data-act="entry-status" data-id="${esc(e.id)}" data-status="open">restore</button>`}</div>`}
    </div>`).join('') : `<p class="empty">Nothing in ${esc(name.toLowerCase())} yet.</p>`}`;
}

/* ---------- events ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'back') go('#');
  else if (act === 'sanctum') go('#sanctum');
  else if (act === 'tab') go(b.dataset.kind ? `#sanctum/${b.dataset.kind}` : '#sanctum');
  else if (act === 'entry-open') { st.editing = id; paint({ keepScroll: true }); }
  else if (act === 'cancel') { st.editing = ''; paint({ keepScroll: true }); }
  else if (act === 'entry-status') store.setEntry(id, { status: b.dataset.status });
  else if (act === 'item-retire') { if (confirm('Retire this item from the protocol? Its history stays.')) store.setProtocolItem(id, { active: false }); }
}
function onChange(e) {
  const i = e.target; const act = i.dataset.act; if (!act) return;
  if (act === 'tick') { const item = i.dataset.item; setTimeout(() => store.toggleProtocol(today(), item), 0); }
  else if (act === 'day') { const f = i.dataset.field; const raw = i.value; const v = f === 'energy' || f === 'sleep' ? (raw === '' ? null : Number(raw)) : raw; if ((f === 'energy' || f === 'sleep') && raw !== '' && !Number.isFinite(v)) return; setTimeout(() => store.setDay(today(), { [f]: v }), 0); }
}
function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f)) return;
  const act = f.dataset.act;
  if (act === 'entry-add') { const body = f.body.value.trim(), title = f.title.value.trim(); if (!body && !title) return; store.addEntry(f.dataset.kind, title, body); f.reset(); }
  else if (act === 'entry-edit') { st.editing = ''; store.setEntry(f.dataset.id, { title: f.title.value.trim(), body: f.body.value.trim() }); }
  else if (act === 'item-save') { store.setProtocolItem(f.dataset.id, { name: f.name.value.trim(), target: Number(f.target.value) || 0, unit: f.unit.value.trim(), cadence: f.cadence.value }); st.showItems = true; }
  else if (act === 'item-add') { const name = f.name.value.trim(); if (!name) return; const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); store.setProtocolItem(id, { name, target: Number(f.target.value) || 0, unit: f.unit.value.trim(), cadence: f.cadence.value, active: true }); st.showItems = true; f.reset(); }
}
