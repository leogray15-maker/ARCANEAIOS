/**
 * Room widgets — the State section of each dashboard.
 *
 * Each widget is a function (store, brain, room) → HTML. They read the
 * store (what the operator edits on the floor) and the brain export (what
 * the vault knows). Controls carry `data-act` attributes; panel.js routes
 * the clicks and inputs back to the store. Nothing here mutates.
 */
import { VENTURES, AGENTS, ROOM_BY_ID } from '@arcane/config';
import { monthOf, monthLabel } from '../core/money.js';
import { signals } from '../core/vigil.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gbp = (n) => (Number.isFinite(n) ? `£${Math.round(n).toLocaleString('en-GB')}` : '—');
const src = (text) => `<p class="src">${esc(text)}</p>`;
const chip = (text, tone = '') => `<span class="chip ${tone}">${esc(text)}</span>`;
const table = (head, rows) => `<table class="grid"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
/** An editable list with optional tags: the smallest useful board. */
function listBoard(store, key, { placeholder, tags = [], toneOf = () => 'ash', hint = '' } = {}) {
  const items = store.openItems(key);
  return `${items.length ? items.map((it) => `<div class="order"><span>${esc(it.text)}</span> ${it.tag ? chip(it.tag, toneOf(it.tag)) : ''}${tags.length ? ` <span class="faint">→</span> ${tags.map((t) => `<button class="tiny ghost" data-act="list-tag" data-key="${key}" data-id="${it.id}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}` : ''} <button class="tiny ghost" data-act="list-remove" data-key="${key}" data-id="${it.id}">×</button></div>`).join('') : `<p class="empty">Nothing here yet.</p>`}
    <form class="inline" data-act="list-add" data-key="${key}"><input name="text" placeholder="${esc(placeholder)}" style="flex:1;min-width:200px"><button type="submit">Add</button></form>${hint ? src(hint) : ''}`;
}

const stageTone = { live: 'vital', shipped: 'vital', building: 'flare', packing: 'flare', ready: 'cyan', proofing: 'cyan', queued: 'arcane', draft: 'flare', drafting: 'flare', idea: 'ash', idle: 'ash' };

/* ---------------- the rooms that read the tables through a widget ---------------- */
const ledgerCell = (store, month, venture, field, value, w = 70) => `<input class="num" type="number" min="0" data-act="ledger" data-month="${month}" data-id="${venture}" data-field="${field}" value="${esc(value ?? '')}" placeholder="—" style="width:${w}px" ${store.server.ready ? '' : 'disabled'}>`;
const market = (store) => {
  const month = monthOf(); const p = store.money(month).ventures.find((v) => v.id === 'peptides'); const r = store.ledgerRow(month, 'peptides') || {};
  const pct = (a, b) => (a && b ? `${Math.round(a / b * 100)}%` : '—');
  return `<h3>${esc(monthLabel(month))} <span class="faint">the funnel, typed monthly — the ledger row for Arcane Peptides</span></h3>
    <div class="stat-row"><div class="stat"><b>${r.visitors ?? '—'}</b><span>visitors</span></div><div class="stat"><b>${r.leads ?? '—'}</b><span>leads · ${pct(r.leads, r.visitors)}</span></div><div class="stat"><b>${r.orders ?? '—'}</b><span>orders · ${pct(r.orders, r.leads)}</span></div><div class="stat"><b>${p?.revenue === null || p?.revenue === undefined ? '—' : gbp(p.revenue)}</b><span>revenue</span></div></div>
    <p>Visitors ${ledgerCell(store, month, 'peptides', 'visitors', r.visitors)} Leads ${ledgerCell(store, month, 'peptides', 'leads', r.leads)} Orders ${ledgerCell(store, month, 'peptides', 'orders', r.orders)} Revenue £${ledgerCell(store, month, 'peptides', 'revenue_gbp', r.revenue_gbp, 90)}</p>
    ${src('The same row THE VAULT shows for this month. Earlier months are in the Vault\'s history.')}
    <h3>Dispatch <span class="faint">from THE LAB</span></h3>${store.dispatchQueue().length ? table(['Ref', 'Items', 'Stage'], store.dispatchQueue().map((d) => `<tr><td>${esc(d.ref)}</td><td>${esc(d.items)}</td><td>${chip(d.stage, stageTone[d.stage])}</td></tr>`)) : '<p class="empty">Nothing packing or ready.</p>'}
    <p><a class="button-link" href="#lab/dispatch">Open the queue in THE LAB →</a></p>`;
};
const vitals = (store) => {
  const month = monthOf(); const r = store.ledgerRow(month, 'track') || {}; const prev = store.moneyHistory(6).filter((h) => h.month !== month);
  const v = VENTURES.find((x) => x.id === 'track');
  return `<h3>${esc(monthLabel(month))}</h3>
    <div class="stat-row"><div class="stat"><b>${r.units ?? '—'}</b><span>members</span></div><div class="stat"><b>${r.units === null || r.units === undefined ? '—' : gbp(r.units * v.price)}</b><span>at £${v.price} / mo</span></div><div class="stat"><b>${r.visitors ?? '—'}</b><span>visitors</span></div><div class="stat"><b>${r.leads ?? '—'}</b><span>sign-ups</span></div></div>
    <p>Members ${ledgerCell(store, month, 'track', 'units', r.units)} Visitors ${ledgerCell(store, month, 'track', 'visitors', r.visitors)} Sign-ups ${ledgerCell(store, month, 'track', 'leads', r.leads)}</p>
    ${prev.length ? `<h3>Before</h3>${table(['Month', 'Members', 'Revenue'], prev.map((h) => { const row = store.ledgerRow(h.month, 'track'); return `<tr><td>${esc(monthLabel(h.month))}</td><td>${row?.units ?? '—'}</td><td>${h.byVenture.track === null ? '—' : gbp(h.byVenture.track)}</td></tr>`; }))}` : ''}
    ${src('Arcane Track has no integration yet; the member count is typed monthly here and read by THE VAULT and the goals. Health data from the app never comes here.')}`;
};
const forge = (store) => {
  const open = store.openOrders('forge'); const done = store.orders('forge').filter((o) => o.done).slice(0, 8);
  const by = (st) => open.filter((o) => (o.state || 'open') === st);
  return `<div class="stat-row"><div class="stat"><b>${open.length}</b><span>open</span></div><div class="stat ${by('blocked').length ? 'breach' : ''}"><b>${by('blocked').length}</b><span>blocked</span></div><div class="stat"><b>${by('active').length}</b><span>active</span></div><div class="stat"><b>${done.length}</b><span>done lately</span></div></div>
    ${src('The build queue is this room\'s orders board (right). Migrations, keys, deploys and repairs live there; the Bridge shows every P0 and P1 of them.')}`;
};
const scriptorium = (store) => `<h3>Manuscripts</h3>${listBoard(store, 'manuscripts', { placeholder: 'A title — book, masterclass, long piece', tags: ['idea', 'drafting', 'proofing', 'live'], toneOf: (t) => (t === 'live' ? 'vital' : t === 'proofing' ? 'cyan' : t === 'drafting' ? 'flare' : 'ash'), hint: 'The Codex\'s titles and where each one is. Sales are typed monthly in THE VAULT as the Codex\'s units.' })}`;
const council = (store, brain) => {
  const tone = (v) => (v === 'BUILD' ? 'vital' : v === 'KILL' ? 'deny' : v === 'DELAY' ? 'flare' : 'cyan');
  const cards = store.decisions().map((d) => `<div class="card">
      <div class="card-head">${chip(d.verdict, tone(d.verdict))} <b>${esc(d.question)}</b> <span class="faint">${esc(d.id)} · ${new Date(d.ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
      <p>${esc(d.summary)}</p>
      ${d.conditions?.length ? `<p class="ash">Conditions first:</p><ol class="list">${d.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>` : ''}
      ${d.dissent ? `<p class="flare">Dissent: ${esc(d.dissent)}</p>` : ''}
      <details><summary>the nine positions</summary>${(d.positions || []).map((p) => `<p><span class="dot" style="background:${AGENTS.find((a) => a.name === p.seat)?.colour || '#8a889e'}"></span><b>${esc(p.seat)}</b> ${chip(p.leans, tone(p.leans))} ${esc(p.position)}${p.concern ? ` <span class="ash">— wants: ${esc(p.concern)}</span>` : ''}</p>`).join('')}</details>
      <form class="inline" data-act="decision-outcome" data-id="${esc(d.id)}"><input name="outcome" placeholder="${d.outcome ? esc(d.outcome) : 'What actually happened (fill in later)'}" style="flex:1;min-width:200px"><button class="tiny" type="submit">record</button></form>
    </div>`).join('');
  return `<h3>Put a decision to the Council</h3>
    <form class="inline" data-act="council-ask"><input name="q" placeholder="The decision, in one line — e.g. Launch the £800 website offer to landscapers this month?" style="flex:1;min-width:280px" autocomplete="off"><button type="submit" class="primary">Convene</button></form>
    <p class="src">Nine seats answer from their own domains in one structured session; ARCANE returns BUILD, DELAY, WATCH or KILL with the conditions that must be true first. Disagreement is recorded, not smoothed over.</p>
    ${cards || (brain?.decisions?.length ? '' : '<p class="empty">No decisions recorded yet.</p>')}
    ${brain?.decisions?.length ? `<h3>From the vault</h3>${table(['Date', 'Decision', 'Verdict', 'Via', 'Outcome'], brain.decisions.map((d) => `<tr><td class="ash">${esc(d.date)}</td><td>${esc(d.decision)}</td><td>${chip(d.verdict, tone(d.verdict))}</td><td class="ash">${esc(d.deliberation)}</td><td class="ash">${esc(d.outcome_later)}</td></tr>`))}` : ''}`;
};
const garage = () => AGENTS.map((a) => `<div class="card"><div class="card-head"><span class="dot" style="background:${a.colour}"></span><b>${esc(a.name)}</b> <span class="ash">${esc(a.role)} · ${esc(a.call)} · ${esc(ROOM_BY_ID[a.room].name)}</span>${a.council ? chip('council', 'gold') : ''}</div><p class="ash">${esc(a.brief)}</p></div>`).join('');
const observatory = (store, brain) => {
  const live = signals(store.state, brain);
  const tone = (sv) => (sv === 'breach' ? 'deny' : sv === 'warn' ? 'flare' : 'ash');
  return `<h3>Live signals <span class="faint">computed now, by VIGIL</span></h3>
    ${live.length ? table(['Severity', 'Room', 'Signal', 'Clears when'], live.map((s) => `<tr><td>${chip(s.severity, tone(s.severity))}</td><td>${esc(ROOM_BY_ID[s.room]?.name || s.room)}</td><td>${esc(s.text)}</td><td class="ash">${esc(s.clear)}</td></tr>`)) : '<p class="vital">Nothing moved that needs you. Quiet is a signal too.</p>'}
    ${brain?.signals?.length ? `<h3>From the vault</h3>${table(['When', 'Who', 'Signal', 'Severity', 'State'], brain.signals.map((s) => `<tr><td class="ash">${esc(s.when)}</td><td>${esc(s.who)}</td><td>${esc(s.signal)}</td><td>${chip(s.severity, tone(s.severity))}</td><td class="ash">${esc(s.state)}</td></tr>`))}` : ''}`;
};
const inventor = (store, brain) => `${listBoard(store, 'ideas', { placeholder: 'An idea, before it gets lost', tags: ['BUILD', 'WATCH', 'KILL'], toneOf: (t) => (t === 'BUILD' ? 'vital' : t === 'KILL' ? 'deny' : 'flare'), hint: 'SPARK takes an idea through market, competition, economics, MVP, cost and risk, then returns BUILD, WATCH or KILL. A BUILD becomes an order; a KILL gets one line on why.' })}
  <p class="ash">${Math.max(0, (brain?.files?.['00-Inbox'] || []).length - 1)} item(s) in the brain's inbox.</p>`;
const intel = (store, brain) => `<h3>Watchlist</h3>${listBoard(store, 'watch', { placeholder: 'Competitor, supplier, market, regulation to watch', tags: ['opportunity', 'threat', 'signal'], toneOf: (t) => (t === 'opportunity' ? 'vital' : t === 'threat' ? 'deny' : 'cyan'), hint: 'Web research is not wired yet, so CIPHER cannot watch these alone. Until it can, this is the list it will be given.' })}
  ${brain?.signals?.length ? `<h3>Signals</h3>${table(['When', 'Who', 'Signal', 'Severity'], brain.signals.slice(0, 8).map((s) => `<tr><td class="ash">${esc(s.when)}</td><td>${esc(s.who)}</td><td>${esc(s.signal)}</td><td>${chip(s.severity, s.severity === 'breach' ? 'deny' : s.severity === 'warn' ? 'flare' : 'ash')}</td></tr>`))}` : ''}`;
const dealroom = (store) => `<h3>Pipeline</h3>${listBoard(store, 'pipeline', { placeholder: 'Company · contact · what for', tags: ['lead', 'contacted', 'meeting', 'proposal', 'won', 'lost'], toneOf: (t) => (t === 'won' ? 'vital' : t === 'lost' ? 'deny' : t === 'meeting' || t === 'proposal' ? 'flare' : 'cyan'), hint: 'The CRM is not wired. ENVOY researches a company, drafts the outreach and prepares the meeting brief. Sends nothing without your word.' })}`;
const lounge = (store) => { const mins = Math.round((Date.now() - (store.sessionStart || Date.now())) / 60000); return `<div class="stat-row"><div class="stat ${mins > 90 ? 'breach' : ''}"><b>${mins}</b><span>minutes in the building</span></div></div>
  <h3>Stop doing</h3>${listBoard(store, 'stop', { placeholder: 'A thing to stop doing', hint: 'EMBER is the only agent whose job is to tell you to leave. Past ninety minutes the counter turns red.' })}`; };
// BRIDGE, THE WAR ROOM, THE VAULT, THE LAB, SANCTUM, THE RECORDS, THE CONTROL ROOM, BEACON and THE LIBRARY are full
// applications (render/*.js); their rooms open those instead of a dashboard. The rest are dashboards with a widget.
export const WIDGETS = {
  market, forge, vitals, scriptorium,
  council, garage, observatory, inventor, intel, dealroom, lounge,
};
