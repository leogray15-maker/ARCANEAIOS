/**
 * THE WAR ROOM — which venture gets the next hour, the next pound, the
 * next quarter.
 *
 *   MOVES      the next three: now · next · later, done with an outcome, reordered by hand
 *   RANKING    the four ventures in order, each push / maintain / starve with one line of why — the Bridge reads this
 *   STOP       what to stop doing
 *   THE FLOOR  where the open orders are, by venture and by room
 *   VERDICTS   the last Council decisions and what came of them
 *
 * Everything is the store's server-backed state: list_items (moves, stop),
 * venture_focus, orders, decisions. VECTOR's job is here; VECTOR is not
 * wired yet, so every line is Leo's.
 */
import { VENTURES, ROOMS, ROOM_BY_ID } from '@arcane/config';
import { esc, chip, when, failed, handleKeyForm } from './ui.js';

const PRIO = ['P0', 'P1', 'P2', 'P3'];
const PRIO_TONE = ['deny', 'flare', 'arcane', 'ash'];
const TAGS = ['now', 'next', 'later'];
const TAG_TONE = { now: 'vital', next: 'flare', later: 'ash' };
const ALLOC = ['push', 'maintain', 'starve'];
const ALLOC_TONE = { push: 'vital', maintain: 'ash', starve: 'deny' };
const ALLOC_NOTE = { push: 'the next hour and the next pound go here', maintain: 'keep it running, no new bets', starve: 'no time, no money, until it earns it' };
const VERDICT_TONE = { BUILD: 'vital', DELAY: 'flare', WATCH: 'cyan', KILL: 'deny' };

const st = { showDone: false, editing: '' };
let el = null, go = null, store = null, brain = null;

export function bindWarroom(view, ctx) {
  el = view; go = ctx.go; store = ctx.store; brain = ctx.brain;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChange);
  // Deferred: a repaint inside a blur handler pulls the node out from under the browser.
  el.addEventListener('focusout', (e) => { if (e.target.dataset.act === 'why') { const t = e.target; setTimeout(() => saveWhy(t), 0); } });
  el.addEventListener('keydown', (e) => { if (e.target.dataset.act === 'why' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
}

export function renderWarroom(view, ctx, hash = '#warroom', { keepScroll = false } = {}) { el = view; paint({ keepScroll }); }

function moveRow(m, i, count) {
  return `<div class="order-row move ${m.done ? 'done' : ''}" data-id="${esc(m.id)}">
    ${m.done ? `<span class="faint">✓</span>` : `<input type="checkbox" data-act="move-done" data-id="${esc(m.id)}" title="done — say what came of it">`}
    ${chip(m.tag || 'later', TAG_TONE[m.tag] || 'ash')}
    ${st.editing === m.id ? `<form class="row-form" data-act="move-edit" data-id="${esc(m.id)}" style="flex:1"><input name="text" value="${esc(m.text)}" style="width:100%"><button class="tiny" type="submit">keep</button></form>` : `<span class="text" data-act="move-text" data-id="${esc(m.id)}" title="click to edit">${esc(m.text)}</span>`}
    ${m.venture ? chip(VENTURES.find((v) => v.id === m.venture)?.name || m.venture, 'cyan') : ''}
    ${m.done && m.outcome ? `<span class="ash">— ${esc(m.outcome)}</span>` : ''}
    <span class="faint nowrap">${when(m.done ? m.doneTs : m.ts)}</span>
    ${m.done ? `<span class="row-acts"><button class="tiny ghost" data-act="move-reopen" data-id="${esc(m.id)}">reopen</button></span>` : `<span class="row-acts">${TAGS.filter((t) => t !== m.tag).map((t) => `<button class="tiny ghost" data-act="move-tag" data-id="${esc(m.id)}" data-tag="${t}">${t}</button>`).join('')}<button class="tiny ghost" data-act="move-up" data-id="${esc(m.id)}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="tiny ghost" data-act="move-down" data-id="${esc(m.id)}" ${i === count - 1 ? 'disabled' : ''}>↓</button><button class="tiny ghost" data-act="move-remove" data-id="${esc(m.id)}" title="remove">×</button></span>`}
  </div>`;
}

function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const scroll = keepScroll ? el.scrollTop : 0;
  const active = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset?.venture : null;
  const moves = store.openItems('moves');
  const done = store.list('moves').filter((m) => m.done).sort((a, b) => (b.doneTs || 0) - (a.doneTs || 0));
  const stop = store.openItems('stop');
  const open = store.allOpenOrders();
  const ranked = VENTURES.map((v) => ({ v, f: store.focusOf(v.id) })).sort((a, b) => (a.f.rank || 9) - (b.f.rank || 9) || VENTURES.indexOf(a.v) - VENTURES.indexOf(b.v));
  const decisions = store.decisions().slice(0, 6);
  const sv = store.serverStatus();
  const nowCount = moves.filter((m) => m.tag === 'now').length;

  el.innerHTML = `<div class="wrap app warroom">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>THE WAR ROOM</h1>
      <span class="sub">${moves.length} move${moves.length === 1 ? '' : 's'} on the board · ${nowCount} now · ${open.length} open orders on the floor</span>
      <span class="spacer"></span>
      <a class="button-link" href="#bridge">BRIDGE →</a>
    </div>
    ${sv.tone === 'breach' ? `<p class="flash breach">${esc(sv.text)}</p>` : ''}
    ${store.server.needsKey || (!store.server.ready && store.server.reason === 'no operator key') ? failed({ needsKey: true, status: 401 }) : ''}
    ${nowCount > 3 ? `<p class="flash breach">${nowCount} moves tagged now. Three is the limit that means anything — demote the rest.</p>` : ''}
    <div class="bridge-grid">
      <div class="bridge-main">
        <section>
          <h2>The next three moves</h2>
          ${moves.length ? moves.map((m, i) => moveRow(m, i, moves.length)).join('') : '<p class="empty">No moves on the board. What is the one thing that, done this week, makes the rest easier?</p>'}
          <form class="inline add-order" data-act="move-add">
            <input name="text" placeholder="A move, in one line" style="flex:1;min-width:240px" autocomplete="off">
            <select name="tag">${TAGS.map((t) => `<option value="${t}" ${t === 'next' ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <select name="venture"><option value="">no venture</option>${VENTURES.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select>
            <button type="submit">Add</button>
          </form>
          <p class="src">now = this week, next = after that, later = on the board but not yet. Done asks what came of it; the answer is the record.</p>
          ${done.length ? `<details ${st.showDone ? 'open' : ''}><summary>${done.length} done</summary>${done.slice(0, 20).map((m, i) => moveRow(m, i, done.length)).join('')}</details>` : ''}
        </section>

        <section>
          <h2>The ranking <span class="faint">who gets the next hour, the next pound</span></h2>
          ${ranked.map(({ v, f }, i) => {
            const roomsOf = ROOMS.filter((r) => r.venture === v.id).map((r) => r.id);
            const vo = open.filter((o) => o.venture === v.id || roomsOf.includes(o.room)).sort((a, b) => a.p - b.p);
            const vm = moves.filter((m) => m.venture === v.id);
            return `<div class="venture-card rank">
              <div class="vc-head">
                <span class="rank-n">${i + 1}</span>
                <b>${esc(v.name)}</b>
                <span class="faint">${esc(v.kind)} · ${esc(v.model)}</span>
                <span class="spacer"></span>
                <button class="tiny ghost" data-act="rank-up" data-venture="${v.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="tiny ghost" data-act="rank-down" data-venture="${v.id}" ${i === ranked.length - 1 ? 'disabled' : ''}>↓</button>
              </div>
              <div class="alloc">${ALLOC.map((a) => `<button class="tiny ${f.allocation === a ? ALLOC_TONE[a] + ' on' : 'ghost'}" data-act="alloc" data-venture="${v.id}" data-alloc="${a}" title="${esc(ALLOC_NOTE[a])}">${a}</button>`).join('')}<span class="faint">${esc(ALLOC_NOTE[f.allocation] || '')}</span></div>
              <input class="why" data-act="why" data-venture="${v.id}" placeholder="Why this rank, in one line" value="${esc(f.why)}" autocomplete="off" ${store.server.ready ? '' : 'disabled'}>
              <p class="faint">${vo.length} open order${vo.length === 1 ? '' : 's'}${vo.filter((o) => o.p === 0).length ? ` · <span class="breach">${vo.filter((o) => o.p === 0).length} P0</span>` : ''} · ${vm.length} move${vm.length === 1 ? '' : 's'}${vo[0] ? ` · top: ${chip(PRIO[vo[0].p], PRIO_TONE[vo[0].p])} ${esc(vo[0].t)}` : ''}</p>
            </div>`; }).join('')}
          <p class="src">Rank is the order; allocation is the instruction. A venture on starve gets nothing until it earns it back. The Bridge shows this beside every venture.</p>
        </section>

        <section>
          <h2>Stop doing</h2>
          ${stop.length ? stop.map((s) => `<div class="order-row"><input type="checkbox" data-act="stop-done" data-id="${esc(s.id)}" title="stopped"><span class="text">${esc(s.text)}</span><span class="faint nowrap">${when(s.ts)}</span><span class="row-acts"><button class="tiny ghost" data-act="stop-remove" data-id="${esc(s.id)}">×</button></span></div>`).join('') : '<p class="empty">Nothing on the stop list. There is always something.</p>'}
          <form class="inline add-order" data-act="stop-add"><input name="text" placeholder="A thing to stop doing" style="flex:1;min-width:240px" autocomplete="off"><button type="submit">Add</button></form>
        </section>
      </div>

      <aside class="bridge-side">
        <h2>Where the work is</h2>
        ${(() => { const byRoom = {}; for (const o of open) byRoom[o.room] = (byRoom[o.room] || 0) + 1; const rows = ROOMS.filter((r) => byRoom[r.id]).sort((a, b) => byRoom[b.id] - byRoom[a.id]); return rows.length ? `<table class="grid">${rows.map((r) => { const top = open.filter((o) => o.room === r.id).sort((a, b) => a.p - b.p)[0]; return `<tr><td><a href="#room/${r.id}">${esc(r.name)}</a></td><td class="r"><b>${byRoom[r.id]}</b></td><td class="ash">${chip(PRIO[top.p], PRIO_TONE[top.p])} ${esc(top.t).slice(0, 60)}</td></tr>`; }).join('')}</table>` : '<p class="empty">No open orders.</p>'; })()}

        <h2>Verdicts <span class="faint">from THE COUNCIL</span></h2>
        ${decisions.length ? decisions.map((d) => `<div class="venture-card"><div class="vc-head">${chip(d.verdict, VERDICT_TONE[d.verdict])}<b>${esc(d.question)}</b><span class="spacer"></span><span class="faint">${when(d.ts)}</span></div>${d.summary ? `<p class="ash">${esc(d.summary).slice(0, 240)}</p>` : ''}${d.conditions?.length ? `<p class="faint">first: ${d.conditions.map(esc).join(' · ')}</p>` : ''}${d.outcome ? `<p class="vital">outcome: ${esc(d.outcome)}</p>` : '<p class="flare">no outcome yet</p>'}</div>`).join('') : '<p class="empty">Nothing put to the Council yet.</p>'}
        <p><a class="button-link" href="#room/council">Convene the Council →</a></p>

        <h2>Doctrine</h2>
        ${brain?.doctrine ? `<p class="doctrine">${esc(brain.doctrine)}</p>` : '<p class="empty">No current intent set.</p>'}
      </aside>
    </div>
  </div>`;
  if (keepScroll) el.scrollTop = scroll;
  if (active) { const again = el.querySelector(`input[data-act="why"][data-venture="${active}"]`); if (again) again.focus(); }
}

/* ---------- events ---------- */
function saveWhy(input) { const v = input.dataset.venture; const why = input.value.trim(); if (why !== store.focusOf(v).why) store.setFocus(v, { why }); }
const rankedIds = () => VENTURES.map((v) => ({ v, f: store.focusOf(v.id) })).sort((a, b) => (a.f.rank || 9) - (b.f.rank || 9) || VENTURES.indexOf(a.v) - VENTURES.indexOf(b.v)).map((x) => x.v.id);
const swap = (arr, i, j) => { const c = [...arr]; [c[i], c[j]] = [c[j], c[i]]; return c; };

function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'back') go('#');
  else if (act === 'move-tag') store.tagItem('moves', id, b.dataset.tag);
  else if (act === 'move-remove') { if (confirm('Remove this move? Prefer "done" with an outcome if it happened.')) store.removeItem('moves', id); }
  else if (act === 'move-reopen') store.doneItem('moves', id, false);
  else if (act === 'move-text') { st.editing = id; paint({ keepScroll: true }); el.querySelector('form[data-act=move-edit] input')?.focus(); }
  else if (act === 'move-up' || act === 'move-down') { const ids = store.openItems('moves').map((m) => m.id); const i = ids.indexOf(id); const j = act === 'move-up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= ids.length) return; store.reorderList('moves', swap(ids, i, j)); }
  else if (act === 'rank-up' || act === 'rank-down') { const ids = rankedIds(); const i = ids.indexOf(b.dataset.venture); const j = act === 'rank-up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= ids.length) return; store.rankVentures(swap(ids, i, j)); }
  else if (act === 'alloc') { const ids = rankedIds(); const f = store.focusOf(b.dataset.venture); store.setFocus(b.dataset.venture, { allocation: b.dataset.alloc, rank: f.rank || ids.indexOf(b.dataset.venture) + 1 }); }
  else if (act === 'stop-remove') store.removeItem('stop', id);
}
function onChange(e) {
  const i = e.target; const act = i.dataset.act; if (!act) return;
  if (act === 'move-done') { const outcome = prompt('Done. What came of it? (one line, optional)'); if (outcome === null) { i.checked = false; return; } store.doneItem('moves', i.dataset.id, true, outcome.trim()); }
  else if (act === 'stop-done') store.doneItem('stop', i.dataset.id, true, 'stopped');
}
function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f)) return;
  const act = f.dataset.act;
  if (act === 'move-add') { const t = f.text.value.trim(); if (!t) return; store.addItem('moves', t, f.tag.value, { venture: f.venture.value, position: store.openItems('moves').length }); f.text.value = ''; }
  else if (act === 'move-edit') { const t = f.text.value.trim(); st.editing = ''; if (t) store.editItem('moves', f.dataset.id, { text: t }); else paint({ keepScroll: true }); }
  else if (act === 'stop-add') { const t = f.text.value.trim(); if (!t) return; store.addItem('stop', t); f.text.value = ''; }
}
