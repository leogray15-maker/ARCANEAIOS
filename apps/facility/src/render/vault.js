/**
 * THE VAULT — the treasury, with a history.
 *
 *   #vault             this month: revenue by venture (typed as units or £), fixed costs, cash, the split, runway; the months before
 *   #vault/<YYYY-MM>   another month's figures
 *
 * Everything is typed by Leo into ledger_months, fixed_costs,
 * cash_snapshots and pots; core/money.js does the arithmetic; the Bridge,
 * the goals, the brief and VIGIL read the same numbers. Nothing here moves
 * money. The Trading Journal is its own room; the Lab's stock value is
 * shown here because it is money sitting on a shelf.
 */
import { VENTURES } from '@arcane/config';
import { monthOf, prevMonth, monthLabel } from '../core/money.js';
import { esc, chip, when, failed, handleKeyForm, keepFocus, proposalsBlock } from './ui.js';

const gbp = (n, d = 0) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (x) => (x === null || x === undefined ? '—' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`);
const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const st = { month: monthOf(), adding: '' };
let el = null, go = null, store = null;

export function bindVault(view, ctx) {
  el = view; go = ctx.go; store = ctx.store;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', onChange);
}

export function renderVault(view, ctx, hash = '#vault', { keepScroll = false } = {}) {
  el = view;
  const m = /^#vault\/(\d{4}-\d{2})$/.exec(hash);
  st.month = m ? m[1] : monthOf();
  paint({ keepScroll });
}

const cell = (act, data, value, { w = 90, step = 'any' } = {}) => `<input class="num" type="number" min="0" step="${step}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')} value="${esc(value ?? '')}" placeholder="—" style="width:${w}px" ${store.server.ready ? '' : 'disabled'}>`;

function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const restore = keepFocus(el, 'input.num, input[name]');
  const scroll = keepScroll ? el.scrollTop : 0;
  const sv = store.serverStatus();
  const month = st.month;
  const m = store.money(month);
  const lab = store.lab();
  const hist = store.moneyHistory(12);
  const isNow = month === monthOf();
  const runwayText = m.runway === null ? '—' : m.runway === Infinity ? 'covered' : `${m.runway.toFixed(1)} mo`;
  el.innerHTML = `<div class="wrap app vault">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>THE VAULT</h1>
      <span class="sub">treasury · <b>${esc(monthLabel(month))}</b>${isNow ? '' : ' <span class="flare">(not this month)</span>'}</span>
      <span class="spacer"></span>
      <a class="tiny ghost" href="#vault/${esc(prevMonth(month))}">← ${esc(monthLabel(prevMonth(month)))}</a>
      ${isNow ? '' : `<a class="tiny ghost" href="#vault">this month →</a>`}
      <span class="${sv.tone}" title="${esc(sv.text)}">● ${esc(sv.tone === 'vital' ? 'state on the server' : sv.text)}</span>
    </div>
    ${sv.tone === 'breach' ? `<p class="flash breach">${esc(sv.text)}</p>` : ''}
    ${store.server.needsKey || (!store.server.ready && store.server.reason === 'no operator key') ? failed({ needsKey: true, status: 401 }) : ''}
    ${proposalsBlock(store, 'vault')}
    <div class="stat-row">
      <div class="stat"><b>${gbp(m.revenue)}</b><span>revenue ${esc(monthLabel(month))}${m.change !== null ? ` · <span class="${m.change >= 0 ? 'vital' : 'breach'}">${pct(m.change)}</span> vs ${esc(monthLabel(prevMonth(month)))}` : ''}</span></div>
      <div class="stat"><b>${gbp(m.fixed)}</b><span>fixed / month</span></div>
      <div class="stat ${m.net === null ? '' : m.net < 0 ? 'breach' : 'vital'}"><b>${gbp(m.net)}</b><span>net</span></div>
      <div class="stat"><b>${m.cash ? gbp(m.cash.cash) : '—'}</b><span>cash${m.cash ? ` · ${esc(m.cash.day)}` : ' · not typed'}</span></div>
      <div class="stat ${m.runway !== null && m.runway !== Infinity && m.runway < 3 ? 'breach' : ''}"><b>${runwayText}</b><span>runway</span></div>
      <div class="stat"><b>${gbp(lab.valueCost)}</b><span>stock at cost · <a href="#lab">${gbp(lab.valueSell)} at price</a></span></div>
    </div>
    <div class="bridge-grid">
      <div class="bridge-main">
        <section>
          <h2>Revenue by venture <span class="faint">${esc(monthLabel(month))}</span></h2>
          <table class="grid"><thead><tr><th>Venture</th><th>Figure</th><th class="r">Revenue</th><th>Note</th></tr></thead><tbody>
          ${m.ventures.map((v) => { const r = store.ledgerRow(month, v.id) || {}; return `<tr>
            <td>${esc(v.name)}</td>
            <td>${v.price ? `${cell('ledger', { month, venture: v.id, field: 'units' }, r.units, { w: 70, step: 1 })} <span class="ash">${esc(v.unitLabel)} × £${v.price}</span> <span class="faint">or £</span>${cell('ledger', { month, venture: v.id, field: 'revenue_gbp' }, r.revenue_gbp, { w: 90 })}` : `£${cell('ledger', { month, venture: v.id, field: 'revenue_gbp' }, r.revenue_gbp, { w: 90 })} <span class="ash">${esc(v.unitLabel)}</span> ${cell('ledger', { month, venture: v.id, field: 'units' }, r.units, { w: 60, step: 1 })}`}</td>
            <td class="r"><b>${gbp(v.revenue)}</b></td>
            <td><input data-act="ledger-note" data-month="${month}" data-venture="${v.id}" value="${esc(r.note || '')}" placeholder="—" style="width:200px" ${store.server.ready ? '' : 'disabled'}></td>
          </tr>`; }).join('')}
          <tr><td><b>Total</b></td><td></td><td class="r"><b>${gbp(m.revenue)}</b></td><td></td></tr>
          </tbody></table>
          <p class="src">A priced venture takes members or orders and computes the revenue; type the £ figure instead when it differs. Empty means not typed, never zero.</p>
        </section>

        <section>
          <h2>Fixed costs <span class="faint">${gbp(m.fixed)} / month</span></h2>
          <table class="grid"><thead><tr><th>Line</th><th class="r">£ / month</th><th>Room</th><th></th></tr></thead><tbody>
          ${store.state.fixedCosts.filter((f) => f.active !== false).map((f) => `<tr><td>${esc(f.name)}</td><td class="r">${cell('fixed', { id: f.id }, f.amount_gbp, { w: 90 })}</td><td class="ash">${esc(f.room || '')}</td><td class="r"><button class="tiny ghost" data-act="fixed-retire" data-id="${esc(f.id)}" title="retire this line">×</button></td></tr>`).join('')}
          </tbody></table>
          <form class="inline add-order" data-act="fixed-add"><input name="name" placeholder="A new fixed cost" style="width:220px" required><input name="amount" type="number" min="0" step="any" placeholder="£ / month" style="width:100px"><button type="submit">Add</button></form>
          ${store.state.fixedCosts.some((f) => f.active === false) ? `<details><summary>${store.state.fixedCosts.filter((f) => f.active === false).length} retired</summary>${store.state.fixedCosts.filter((f) => f.active === false).map((f) => `<p class="ash">${esc(f.name)} · ${gbp(f.amount_gbp)} <button class="tiny ghost" data-act="fixed-restore" data-id="${esc(f.id)}">restore</button></p>`).join('')}</details>` : ''}
        </section>

        <section>
          <h2>History</h2>
          ${hist.length ? `<table class="grid"><thead><tr><th>Month</th>${VENTURES.map((v) => `<th class="r">${esc(v.name.replace('The Arcane ', '').replace('Arcane ', ''))}</th>`).join('')}<th class="r">Revenue</th><th class="r">Fixed</th><th class="r">Net</th></tr></thead><tbody>
            ${hist.map((h) => `<tr class="row" data-act="open-month" data-month="${h.month}"><td><a href="#vault/${h.month}">${esc(monthLabel(h.month))}</a></td>${VENTURES.map((v) => `<td class="r ash">${gbp(h.byVenture[v.id])}</td>`).join('')}<td class="r"><b>${gbp(h.revenue)}</b></td><td class="r ash">${gbp(h.fixed)}</td><td class="r ${h.net === null ? '' : h.net < 0 ? 'breach' : 'vital'}">${gbp(h.net)}</td></tr>`).join('')}
          </tbody></table><p class="src">Fixed is today's list applied to every month; the revenue is what was typed for that month.</p>` : '<p class="empty">No months typed yet. This month\'s figures above are the first row.</p>'}
        </section>
      </div>

      <aside class="bridge-side">
        <h2>Cash</h2>
        <form class="inline" data-act="cash"><span class="ash">£</span><input name="cash" type="number" min="0" step="any" value="${esc(m.cash?.cash ?? '')}" placeholder="cash on hand" style="width:110px"><input name="day" type="date" value="${esc(today())}"><button type="submit" class="primary">Snapshot</button></form>
        ${store.state.cash.length ? `<table class="grid">${store.state.cash.slice().sort((a, b) => String(b.day).localeCompare(String(a.day))).slice(0, 8).map((c) => `<tr><td class="ash">${esc(c.day)}</td><td class="r"><b>${gbp(c.cash_gbp)}</b></td><td class="faint">${esc(c.note || '')}</td></tr>`).join('')}</table>` : '<p class="empty">No snapshot yet. Cash on hand, dated — that is what runway is computed from.</p>'}

        <h2>The split <span class="${m.split === 100 ? 'faint' : 'breach'}">${m.split}%${m.split === 100 ? '' : ' — not 100'}</span></h2>
        <table class="grid">${m.pots.map((p) => `<tr><td><span class="dot" style="background:var(--${esc(p.accent)})"></span>${esc(p.name)}</td><td class="r">${cell('pot', { id: p.id }, p.pct, { w: 52, step: 1 })}%</td><td class="r"><b>${gbp(p.amount)}</b></td></tr>`).join('')}</table>
        <p class="src">${m.pots.map((p) => `${esc(p.name)}: ${esc(p.note)}`).join(' · ')}</p>

        <h2>The Journal</h2>
        <p><a class="button-link" href="#journal">Open the Trading Journal →</a></p>
        <p class="src">Trades are the operator's own record, on THE TRADING FLOOR. Trading P&L is not revenue here until you type it as a figure.</p>
      </aside>
    </div>
  </div>`;
  el.scrollTop = scroll; restore();
}

/* ---------- events ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'back') go('#');
  else if (act === 'open-month' && !e.target.closest('a')) go(`#vault/${b.dataset.month}`);
  else if (act === 'proposal-approve') store.approveProposal('vault', id);
  else if (act === 'proposal-reject') { if (confirm('Reject this proposal? It stays in the record as killed.')) store.rejectProposal('vault', id); }
  else if (act === 'fixed-retire') store.setFixed(id, { active: false });
  else if (act === 'fixed-restore') store.setFixed(id, { active: true });
}
function onChange(e) {
  const i = e.target; const act = i.dataset.act; if (!act) return;
  const raw = i.value.trim(); const n = raw === '' ? null : Number(raw);
  if (raw !== '' && !Number.isFinite(n)) return;
  if (act === 'ledger') { const { month, venture, field } = i.dataset; setTimeout(() => store.setLedger(month, venture, { [field]: n }), 0); }
  else if (act === 'ledger-note') { const { month, venture } = i.dataset; const note = i.value; setTimeout(() => store.setLedger(month, venture, { note }), 0); }
  else if (act === 'fixed') { const id = i.dataset.id; setTimeout(() => store.setFixed(id, { amount_gbp: n ?? 0 }), 0); }
  else if (act === 'pot') { const id = i.dataset.id; if (n !== null && n >= 0 && n <= 100) setTimeout(() => store.setPot(id, { pct: n }), 0); }
}
function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f)) return;
  if (f.dataset.act === 'cash') { const v = Number(f.cash.value); if (!Number.isFinite(v) || !f.day.value) return; store.setCash(f.day.value, v); }
  else if (f.dataset.act === 'fixed-add') { const name = f.name.value.trim(); if (!name) return; const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); store.setFixed(id, { name, amount_gbp: Number(f.amount.value) || 0, active: true }); f.reset(); }
}
