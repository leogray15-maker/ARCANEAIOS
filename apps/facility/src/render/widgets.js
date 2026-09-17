/**
 * Room widgets — the State section of each dashboard.
 *
 * Each widget is a function (store, brain, room) → HTML. They read the
 * store (what the operator edits on the floor) and the brain export (what
 * the vault knows). Controls carry `data-act` attributes; panel.js routes
 * the clicks and inputs back to the store. Nothing here mutates.
 */
import { VENTURES, AGENTS, CAPS, GRADES, ROOM_BY_ID, BRIEF_BLOCKS } from '@arcane/config';
import { INVENTORY, DISPATCH, PDF_PRODUCTS, COHORTS, BUILD_QUEUE, FUNNEL, MANUSCRIPTS, PROTOCOL, BUDGET, DOCTRINE_FALLBACK } from '../config/roomdata.js';
import { signals } from '../core/vigil.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gbp = (n) => (Number.isFinite(n) ? `£${Math.round(n).toLocaleString('en-GB')}` : '—');
const src = (text) => `<p class="src">${esc(text)}</p>`;
const chip = (text, tone = '') => `<span class="chip ${tone}">${esc(text)}</span>`;
const bar = (pct, tone = 'arcane') => `<span class="bar"><span class="bar-fill ${tone}" style="width:${Math.max(0, Math.min(100, pct))}%"></span></span>`;
const num = (act, id, field, value, w = 60) => `<input class="num" type="number" min="0" data-act="${act}" data-id="${esc(id)}" data-field="${esc(field)}" value="${esc(value)}" style="width:${w}px">`;
const table = (head, rows) => `<table class="grid"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
/** An editable list with optional tags: the smallest useful board. */
function listBoard(store, key, { placeholder, tags = [], toneOf = () => 'ash', hint = '' } = {}) {
  const items = store.list(key);
  return `${items.length ? items.map((it) => `<div class="order"><span>${esc(it.text)}</span> ${it.tag ? chip(it.tag, toneOf(it.tag)) : ''}${tags.length ? ` <span class="faint">→</span> ${tags.map((t) => `<button class="tiny ghost" data-act="list-tag" data-key="${key}" data-id="${it.id}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}` : ''} <button class="tiny ghost" data-act="list-remove" data-key="${key}" data-id="${it.id}">×</button></div>`).join('') : `<p class="empty">Nothing here yet.</p>`}
    <form class="inline" data-act="list-add" data-key="${key}"><input name="text" placeholder="${esc(placeholder)}" style="flex:1;min-width:200px"><button type="submit">Add</button></form>${hint ? src(hint) : ''}`;
}

const stageTone = { live: 'vital', shipped: 'vital', building: 'flare', packing: 'flare', ready: 'cyan', proofing: 'cyan', queued: 'arcane', draft: 'flare', drafting: 'flare', idea: 'ash', idle: 'ash' };

/* ---------------- THE LAB ---------------- */
function lab(store) {
  const rows = store.stock().map((r) => `<tr>
    <td><span class="dot" style="background:${r.tint === 'blue' ? '#4f8bff' : r.tint === 'amber' ? '#e8b64c' : '#bfe8ff'}"></span>${esc(r.code)}</td>
    <td class="ash">${esc(r.size)}</td>
    <td><button class="tiny" data-act="stock-adj" data-id="${r.id}" data-delta="-1">−</button> <b>${r.vials}</b> <button class="tiny" data-act="stock-adj" data-id="${r.id}" data-delta="1">+</button></td>
    <td class="ash">${esc(r.batch)}</td>
    <td><button class="chip ${r.coa === 'published' ? 'vital' : r.coa === 'pending' ? 'flare' : 'deny'}" data-act="coa" data-id="${r.id}">${esc(r.coa)}</button></td>
  </tr>`);
  const low = store.lowStock();
  return `
    <div class="stat-row"><div class="stat"><b>${store.totalVials()}</b><span>vials</span></div><div class="stat"><b>${store.coaPct()}%</b><span>COA published</span></div><div class="stat"><b>${low.length}</b><span>low lines</span></div></div>
    ${table(['Compound', 'Size', 'Vials', 'Batch', 'COA'], rows)}
    <form class="inline" data-act="stock-add"><input name="code" placeholder="Compound" style="width:90px"><input name="size" placeholder="Size" style="width:50px"><input name="vials" type="number" placeholder="Vials" style="width:56px"><button type="submit">Add line</button></form>
    ${src(INVENTORY.source)}
    <h3>Dispatch</h3>
    ${table(['Ref', 'Items', 'Stage'], DISPATCH.rows.map((r) => `<tr><td>${esc(r.ref)}</td><td>${esc(r.items)}</td><td>${chip(r.stage, stageTone[r.stage])}</td></tr>`))}
    <p class="ash">${esc(DISPATCH.note)}</p>`;
}

/* ---------------- BEACON ---------------- */
function beacon(store) {
  const drafts = store.drafts();
  const by = (st) => drafts.filter((d) => d.status === st).length;
  const next = { draft: ['review', 'killed'], review: ['approved', 'killed'], approved: ['scheduled', 'posted', 'killed'], scheduled: ['posted', 'killed'], posted: [], killed: ['draft'] };
  const tone = { draft: 'flare', review: 'cyan', approved: 'vital', scheduled: 'arcane', posted: 'vital', killed: 'deny' };
  const list = drafts.filter((d) => d.status !== 'killed').slice(0, 12).map((d) => `<div class="card">
      <div class="card-head">${chip(d.format, 'arcane')} ${chip(d.platform)} ${chip(d.status, tone[d.status])} <span class="ash">${esc(d.id)}</span></div>
      <p class="hook">${esc(d.hook)}</p>
      <p class="ash">${esc(d.source_subject)} · ${esc(d.source_module)} · ${d.word_count}w${d.compliance_notes ? ` · <span class="flare">note: ${esc(d.compliance_notes)}</span>` : ''}</p>
      <div class="acts">${(next[d.status] || []).map((n) => `<button class="tiny" data-act="draft" data-id="${esc(d.id)}" data-status="${n}">${n}</button>`).join('')} <button class="tiny ghost" data-act="draft-open" data-id="${esc(d.id)}">read</button></div>
      <pre class="body hidden" id="draft-${esc(d.id)}">${esc(d.body)}</pre>
    </div>`).join('');
  return `
    <div class="stat-row"><div class="stat"><b>${by('draft')}</b><span>waiting</span></div><div class="stat"><b>${by('review')}</b><span>in review</span></div><div class="stat"><b>${by('approved') + by('scheduled')}</b><span>approved</span></div><div class="stat"><b>${by('posted')}</b><span>posted</span></div></div>
    ${list || '<p class="empty">No drafts in the queue. Run /herald.</p>'}
    <p><button data-act="open-content">Open the content board</button> <span class="ash">every draft, by status</span></p>
    ${src('The queue is the brain\'s 02-Content at the last build. Status moved here is kept on this device until the vault sync lands; the vault stays the truth.')}`;
}

/* ---------------- BRIDGE ---------------- */
function bridge(store, brain) {
  const b = brain?.brief;
  const blocks = BRIEF_BLOCKS.map((blk) => {
    const rows = b?.blocks?.[blk.id] || [];
    if (!rows.length) return `<h3>${blk.name}</h3><p class="empty">${esc(blk.note)}</p>`;
    const head = Object.keys(rows[0]);
    return `<h3>${blk.name}</h3>${table(head.map((h) => h.replace(/_/g, ' ')), rows.map((r) => `<tr>${head.map((h) => `<td>${esc(r[h])}</td>`).join('')}</tr>`))}`;
  }).join('');
  const goals = store.goalList().map((g) => `<tr><td>${esc(g.goal)}</td><td>${bar(store.goalPct(g), g.kind === 'money' ? 'gold' : 'arcane')}</td><td class="ash">${store.goalPct(g)}%</td></tr>`);
  const turns = store.counsel().slice(-12);
  const counsel = `<h3>Counsel <span class="faint">Leo ↔ ARCANE</span></h3>
    <div class="counsel">${turns.length ? turns.map((t) => `<div class="turn ${t.who}"><span class="who">${t.who === 'leo' ? 'LEO' : 'ARCANE'}${t.specialist ? ` <span class="faint">· ${esc(t.specialist)}</span>` : ''}</span><p>${esc(t.text)}</p>${t.order ? `<p class="proposal">proposes <span class="chip ${['deny', 'flare', 'arcane', 'ash'][['P0', 'P1', 'P2', 'P3'].indexOf(t.order.priority)]}">${esc(t.order.priority)}</span> ${esc(ROOM_BY_ID[t.order.room]?.name || t.order.room)}: ${esc(t.order.text)} <button class="tiny" data-act="counsel-order" data-room="${esc(t.order.room)}" data-text="${esc(t.order.text)}" data-p="${['P0', 'P1', 'P2', 'P3'].indexOf(t.order.priority)}">add order</button></p>` : ''}</div>`).join('') : '<p class="empty">Ask the network something. ARCANE answers from the brief, names the specialist it concerns, and may propose one order.</p>'}</div>
    <form class="inline" data-act="counsel-ask"><input name="q" placeholder="Speak to the network…" style="flex:1;min-width:240px" autocomplete="off"><button type="submit" class="primary">Ask</button>${turns.length ? '<button type="button" class="tiny ghost" data-act="counsel-clear">clear</button>' : ''}</form>
    <p class="src">Counsel runs on the reasoning layer (Claude, server-side). Only a device with sync on can ask.</p>`;
  return `
    <p class="ash">Brief of <b>${esc(b?.date || '—')}</b> · memory on <b>${esc(store.where())}</b></p>
    ${brain?.doctrine ? `<p class="doctrine">${esc(brain.doctrine)}</p>` : ''}
    ${counsel}
    ${blocks}
    <h3>Goals</h3>${table(['Goal', 'Progress', ''], goals)}
    <h3>Doctrine</h3><ul class="list">${(brain?.principles?.length ? brain.principles : DOCTRINE_FALLBACK).map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;
}

/* ---------------- THE VAULT ---------------- */
function vault(store) {
  const rev = store.monthlyRevenue(), fixed = store.monthlyFixed(), runway = store.runwayMonths();
  const ventures = VENTURES.map((v) => { const l = store.ledger(v.id); return `<tr><td>${esc(v.name)}</td><td>${v.price ? `${num('ledger', v.id, 'units', l.units, 56)} <span class="ash">${esc(v.unitLabel)} × £${v.price}</span>` : `${num('ledger', v.id, 'mrr', l.mrr, 70)} <span class="ash">£ / mo</span>`}</td><td><b>${gbp(store.ventureRevenue(v))}</b></td></tr>`; });
  const fixedRows = BUDGET.fixed.map((f) => `<tr><td>${esc(f.name)}</td><td>${num('fixed', f.id, 'amount', store.state.budget.fixed[f.id] ?? f.amount, 70)}</td></tr>`);
  const split = store.allocations().map((a) => `<tr><td><span class="dot" style="background:var(--${a.accent})"></span>${esc(a.name)}</td><td>${num('split', a.id, 'pct', a.pct, 44)}%</td><td><b>${gbp(a.amount)}</b></td><td class="ash">${esc(a.note)}</td></tr>`);
  return `
    <div class="stat-row"><div class="stat"><b>${gbp(rev)}</b><span>revenue / mo</span></div><div class="stat"><b>${gbp(fixed)}</b><span>fixed / mo</span></div><div class="stat ${store.monthlyNet() < 0 ? 'breach' : 'vital'}"><b>${gbp(store.monthlyNet())}</b><span>net</span></div><div class="stat"><b>${runway === Infinity ? '∞' : runway.toFixed(1)}</b><span>runway (mo)</span></div></div>
    <p>Cash on hand ${num('cash', 'cash', 'cash', store.state.budget.cash, 90)}</p>
    <h3>Revenue by venture</h3>${table(['Venture', 'Figure', 'Month'], ventures)}
    <h3>Fixed costs</h3>${table(['Line', '£ / mo'], fixedRows)}
    <h3>The split — ${store.splitTotal()}%${store.splitTotal() !== 100 ? ' <span class="breach">(not 100)</span>' : ''}</h3>${table(['Pot', '%', 'This month', ''], split)}
    ${src(BUDGET.source)}
    <h3>Trading Journal</h3><p><button class="primary" data-act="open-journal">Open the Journal</button> <span class="ash">Trades, R-multiples, setups, psychology. Spec in <code>brain/05-Knowledge/Trading-Journal.md</code>.</span></p>`;
}

/* ---------------- THE LIBRARY ---------------- */
function library(store, brain) {
  const a = brain?.archives;
  return `
    ${a?.summary ? `<p>${esc(a.summary)}</p>` : '<p class="empty">Archives index not built. Run npm run herald:index.</p>'}
    ${a?.lanes?.length ? table(['Lane', 'Modules', 'Handling'], a.lanes.map((l) => `<tr><td>${esc(l.lane)}</td><td>${esc(l.modules)}</td><td class="ash">${esc(l.handling).replace(/\*\*/g, '')}</td></tr>`)) : ''}
    ${a?.subjects?.length ? `<h3>Largest subjects</h3>${table(['Subject', 'Lane', 'Modules', 'Words'], a.subjects.map((s) => `<tr><td>${esc(s.subject)}</td><td>${esc(s.lane)}</td><td>${esc(s.modules)}</td><td class="ash">${esc(s.words)}</td></tr>`))}` : ''}
    <h3>PDF products</h3>${table(['Title', 'From', 'Pages', 'Price', 'Stage'], PDF_PRODUCTS.rows.map((r) => `<tr><td>${esc(r.title)}</td><td class="ash">${esc(r.from)}</td><td>${r.pages}</td><td>£${r.price}</td><td>${chip(r.stage, stageTone[r.stage])}</td></tr>`))}
    ${src(PDF_PRODUCTS.source)}`;
}

/* ---------------- THE MARKET ---------------- */
function market(store) {
  const f = store.state.funnel;
  const pct = (a, b) => (b ? `${Math.round(a / b * 100)}%` : '—');
  return `
    <div class="stat-row"><div class="stat"><b>${f.visitors}</b><span>visitors</span></div><div class="stat"><b>${f.leads}</b><span>leads · ${pct(f.leads, f.visitors)}</span></div><div class="stat"><b>${f.orders}</b><span>orders · ${pct(f.orders, f.leads)}</span></div><div class="stat"><b>${gbp(f.orders * f.aov)}</b><span>revenue</span></div></div>
    <p>Visitors ${num('funnel', 'visitors', 'visitors', f.visitors)} Leads ${num('funnel', 'leads', 'leads', f.leads)} Orders ${num('funnel', 'orders', 'orders', f.orders)} AOV £${num('funnel', 'aov', 'aov', f.aov)}</p>
    ${src(FUNNEL.source)}
    <h3>Order board</h3>${table(['Ref', 'Items', 'Stage'], DISPATCH.rows.map((r) => `<tr><td>${esc(r.ref)}</td><td>${esc(r.items)}</td><td>${chip(r.stage, stageTone[r.stage])}</td></tr>`))}`;
}

/* ---------------- the rest ---------------- */
const forge = () => `${table(['Item', 'Target', 'Stage'], BUILD_QUEUE.rows.map((r) => `<tr><td>${esc(r.item)}</td><td class="ash">${esc(r.target)}</td><td>${chip(r.stage, stageTone[r.stage])}</td></tr>`))}${src(BUILD_QUEUE.source)}`;
const vitals = () => `${table(['Cohort', 'Count', ''], COHORTS.rows.map((r) => `<tr><td>${esc(r.label)}</td><td><b>${r.count}</b></td><td class="ash">${esc(r.note)}</td></tr>`))}${src(COHORTS.source)}`;
const scriptorium = () => `${table(['Title', 'Stage', 'Progress', 'Price'], MANUSCRIPTS.rows.map((r) => `<tr><td>${esc(r.title)}</td><td>${chip(r.stage, stageTone[r.stage])}</td><td>${bar(r.pct, 'breach')}</td><td class="ash">${r.price ? `£${r.price}` : '—'}</td></tr>`))}${src(MANUSCRIPTS.source)}`;
const records = (store, brain) => `
  <h3>Trace</h3>${brain?.trace?.length ? brain.trace.slice().reverse().map((t) => `<div class="card"><div class="card-head">${chip(t.agent, 'arcane')} <span class="ash">${esc(t.day)} ${esc(t.time)} · ${esc(t.run)}</span></div><p>${esc(t.action)}</p><p class="ash">${esc(t.inputs)}</p><p class="ash">${esc(t.result)}${t.notes && t.notes !== '—' ? ` · ${esc(t.notes)}` : ''}</p></div>`).join('') : '<p class="empty">No runs traced yet.</p>'}
  <h3>Trading Journal</h3><p><button data-act="open-journal">Open the Journal</button> <span class="ash">the trade record lives beside the trace</span></p>
  <h3>Floor log</h3>${store.records(12).map((r) => `<p class="ash"><span class="faint">${new Date(r.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> ${esc(r.text)}</p>`).join('') || '<p class="empty">Nothing yet this session.</p>'}`;
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
const control = () => `${table(['Agent', ...CAPS.map((c) => c.name)], AGENTS.map((a) => `<tr><td><span class="dot" style="background:${a.colour}"></span>${esc(a.name)}</td>${CAPS.map((c) => `<td>${chip(a.caps[c.id], a.caps[c.id])}</td>`).join('')}</tr>`))}<p class="ash">Grades: ${GRADES.join(' · ')}. No agent holds allow; spend is deny for everyone. Enforced by npm run check.</p>`;
const garage = () => AGENTS.map((a) => `<div class="card"><div class="card-head"><span class="dot" style="background:${a.colour}"></span><b>${esc(a.name)}</b> <span class="ash">${esc(a.role)} · ${esc(a.call)} · ${esc(ROOM_BY_ID[a.room].name)}</span>${a.council ? chip('council', 'gold') : ''}</div><p class="ash">${esc(a.brief)}</p></div>`).join('');
const observatory = (store, brain) => {
  const live = signals(store.state, brain);
  const tone = (sv) => (sv === 'breach' ? 'deny' : sv === 'warn' ? 'flare' : 'ash');
  return `<h3>Live signals <span class="faint">computed now, by VIGIL</span></h3>
    ${live.length ? table(['Severity', 'Room', 'Signal', 'Clears when'], live.map((s) => `<tr><td>${chip(s.severity, tone(s.severity))}</td><td>${esc(ROOM_BY_ID[s.room]?.name || s.room)}</td><td>${esc(s.text)}</td><td class="ash">${esc(s.clear)}</td></tr>`)) : '<p class="vital">Nothing moved that needs you. Quiet is a signal too.</p>'}
    ${brain?.signals?.length ? `<h3>From the vault</h3>${table(['When', 'Who', 'Signal', 'Severity', 'State'], brain.signals.map((s) => `<tr><td class="ash">${esc(s.when)}</td><td>${esc(s.who)}</td><td>${esc(s.signal)}</td><td>${chip(s.severity, tone(s.severity))}</td><td class="ash">${esc(s.state)}</td></tr>`))}` : ''}`;
};
const warroom = (store, brain) => { const rows = brain?.brief?.blocks?.rooms || []; return `<h3>The next three moves</h3>${listBoard(store, 'moves', { placeholder: 'A move, in one line', tags: ['now', 'next', 'stop'], toneOf: (t) => (t === 'now' ? 'vital' : t === 'stop' ? 'deny' : 'flare'), hint: 'VECTOR ranks the ventures by what is compounding and names what to stop doing. Three lines, tagged now / next / stop.' })}
  <h3>Where the work is</h3>${rows.length ? table(Object.keys(rows[0]).map((h) => h.replace(/_/g, ' ')), rows.map((r) => `<tr>${Object.values(r).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)) : '<p class="empty">The brief has no ROOMS block.</p>'}`; };
const inventor = (store, brain) => `${listBoard(store, 'ideas', { placeholder: 'An idea, before it gets lost', tags: ['BUILD', 'WATCH', 'KILL'], toneOf: (t) => (t === 'BUILD' ? 'vital' : t === 'KILL' ? 'deny' : 'flare'), hint: 'SPARK takes an idea through market, competition, economics, MVP, cost and risk, then returns BUILD, WATCH or KILL. A BUILD becomes an order; a KILL gets one line on why.' })}
  <p class="ash">${Math.max(0, (brain?.files?.['00-Inbox'] || []).length - 1)} item(s) in the brain's inbox.</p>`;
const intel = (store, brain) => `<h3>Watchlist</h3>${listBoard(store, 'watch', { placeholder: 'Competitor, supplier, market, regulation to watch', tags: ['opportunity', 'threat', 'signal'], toneOf: (t) => (t === 'opportunity' ? 'vital' : t === 'threat' ? 'deny' : 'cyan'), hint: 'Web research is not wired yet, so CIPHER cannot watch these alone. Until it can, this is the list it will be given.' })}
  ${brain?.signals?.length ? `<h3>Signals</h3>${table(['When', 'Who', 'Signal', 'Severity'], brain.signals.slice(0, 8).map((s) => `<tr><td class="ash">${esc(s.when)}</td><td>${esc(s.who)}</td><td>${esc(s.signal)}</td><td>${chip(s.severity, s.severity === 'breach' ? 'deny' : s.severity === 'warn' ? 'flare' : 'ash')}</td></tr>`))}` : ''}`;
const dealroom = (store) => `<h3>Pipeline</h3>${listBoard(store, 'pipeline', { placeholder: 'Company · contact · what for', tags: ['lead', 'contacted', 'meeting', 'proposal', 'won', 'lost'], toneOf: (t) => (t === 'won' ? 'vital' : t === 'lost' ? 'deny' : t === 'meeting' || t === 'proposal' ? 'flare' : 'cyan'), hint: 'The CRM is not wired. ENVOY researches a company, drafts the outreach and prepares the meeting brief. Sends nothing without your word.' })}`;
const lounge = (store) => { const mins = Math.round((Date.now() - (store.sessionStart || Date.now())) / 60000); return `<div class="stat-row"><div class="stat ${mins > 90 ? 'breach' : ''}"><b>${mins}</b><span>minutes in the building</span></div></div>
  <h3>Stop doing</h3>${listBoard(store, 'stop', { placeholder: 'A thing to stop doing', hint: 'EMBER is the only agent whose job is to tell you to leave. Past ninety minutes the counter turns red.' })}`; };
const sanctum = (store) => {
  const today = new Date().toISOString().slice(0, 10); const d = store.protocolDay(today);
  return `<h3>Today — ${today}</h3>${table(['Protocol', 'Target', 'Done', 'Streak'], PROTOCOL.rows.map((r) => `<tr><td>${esc(r.item)}</td><td class="ash">${r.target} ${esc(r.unit)}</td><td><input type="checkbox" data-act="protocol" data-day="${today}" data-item="${esc(r.item)}" ${d[r.item] ? 'checked' : ''}></td><td class="ash">${store.protocolStreak(r.item)} day${store.protocolStreak(r.item) === 1 ? '' : 's'}</td></tr>`))}${src(PROTOCOL.source)}
  <p class="ash">Energy and sleep logged here feed the Trading Journal's Energy vs R view.</p>`;
};

export const WIDGETS = {
  apothecary: lab, beacon, bridge, vault, archives: library, market, forge, vitals, scriptorium, sanctum,
  records, council, control, garage, observatory, warroom, inventor, intel, dealroom, lounge,
};
