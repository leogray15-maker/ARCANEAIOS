/**
 * THE RECORDS — institutional memory.
 *
 *   #records              the timeline: every system event, newest first, filtered by kind or room
 *   #records/runs         agent runs: objective, status, usage, error
 *   #records/decisions    verdicts and their outcomes
 *   #records/lessons      what survived — one line each, kept on purpose
 *   #records/trace        the vault's Trace (the CLI runs) and this session's floor log
 *
 * Reads system_events and agent_runs through the API, decisions and
 * lessons through the store. Nothing here is edited except a lesson and
 * a decision's outcome; history is append-only.
 */
import { ROOM_BY_ID, VENTURES } from '@arcane/config';
import { api } from '../core/api.js';
import { esc, chip, when, stampFull, num, loading, empty, failed, handleKeyForm, keepFocus } from './ui.js';

const TABS = [['timeline', 'TIMELINE'], ['runs', 'RUNS'], ['decisions', 'DECISIONS'], ['lessons', 'LESSONS'], ['trace', 'TRACE']];
const VERDICT_TONE = { BUILD: 'vital', DELAY: 'flare', WATCH: 'cyan', KILL: 'deny' };
const KIND_TONE = (k) => (/failed|refused|removed|killed/.test(k) ? 'deny' : /generated|added|ok|set/.test(k) ? 'vital' : /status|changed/.test(k) ? 'cyan' : 'ash');

const st = { tab: 'timeline', events: null, runs: null, error: null, kind: '', q: '', loadedAt: 0 };
let el = null, go = null, store = null, brain = null;

export function bindRecords(view, ctx) {
  el = view; go = ctx.go; store = ctx.store; brain = ctx.brain;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('input', (e) => { if (e.target.id === 'rec-q') { st.q = e.target.value; paint({ keepScroll: true }); } });
  el.addEventListener('change', (e) => { if (e.target.id === 'rec-kind') { st.kind = e.target.value; paint({ keepScroll: true }); } });
}
export function renderRecords(view, ctx, hash = '#records', { keepScroll = false } = {}) {
  el = view;
  const t = /^#records\/([a-z]+)/.exec(hash)?.[1];
  st.tab = TABS.some((x) => x[0] === t) ? t : 'timeline';
  if ((!st.events && !st.error) || Date.now() - st.loadedAt > 60_000) load();
  paint({ keepScroll });
}
async function load() {
  st.loadedAt = Date.now();
  try { const [e, r] = await Promise.all([api.runs.events({ limit: 400 }), api.runs.list({ limit: 100 })]); st.events = e.events; st.runs = r.runs; st.error = null; }
  catch (e) { st.error = e; }
  paint({ keepScroll: true });
}

function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const restore = keepFocus(el, '#rec-q');
  const scroll = keepScroll ? el.scrollTop : 0;
  el.innerHTML = `<div class="wrap app records">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>THE RECORDS</h1>
      <span class="sub">institutional memory · ${st.events ? `<b>${num(st.events.length)}</b> events` : '…'} · <b>${store.decisions().length}</b> decisions · <b>${store.openItems('lessons').length}</b> lessons</span>
      <span class="spacer"></span>
      ${st.tab === 'timeline' ? `<input type="search" id="rec-q" placeholder="Search the record" value="${esc(st.q)}" style="width:220px"><select id="rec-kind"><option value="">every kind</option>${[...new Set((st.events || []).map((e) => e.kind.split('.')[0]))].sort().map((k) => `<option value="${k}" ${st.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>` : ''}
    </div>
    <div class="tabs">${TABS.map(([id, name]) => `<button data-act="tab" data-tab="${id}" class="${st.tab === id ? 'on' : ''}">${name}</button>`).join('')}</div>
    ${st.tab === 'timeline' ? timeline() : st.tab === 'runs' ? runs() : st.tab === 'decisions' ? decisions() : st.tab === 'lessons' ? lessons() : trace()}
  </div>`;
  el.scrollTop = scroll; restore();
}

function timeline() {
  if (st.error) return failed(st.error, { retry: 'reload' });
  if (!st.events) return loading('the record');
  const q = st.q.trim().toLowerCase();
  const list = st.events.filter((e) => (!st.kind || e.kind.startsWith(st.kind + '.')) && (!q || `${e.kind} ${e.summary} ${e.actor} ${e.subject_id}`.toLowerCase().includes(q)));
  if (!list.length) return empty('Nothing recorded that matches.');
  const byDay = {}; for (const e of list) { const d = String(e.at).slice(0, 10); (byDay[d] || (byDay[d] = [])).push(e); }
  return Object.entries(byDay).map(([d, es]) => `<h2>${esc(d)} <span class="faint">${es.length}</span></h2>${es.map((e) => `<div class="order-row"><span class="faint nowrap" title="${esc(stampFull(e.at))}">${esc(String(e.at).slice(11, 16))}</span>${chip(e.kind, KIND_TONE(e.kind))}<span class="text">${esc(e.summary)}</span><span class="faint">${esc(e.actor || '')}</span>${e.subject_type === 'draft' ? `<a class="room" href="#beacon/draft/${esc(e.subject_id)}">open</a>` : e.subject_type === 'order' ? `<a class="room" href="#bridge">bridge</a>` : ''}</div>`).join('')}`).join('');
}
function runs() {
  if (st.error) return failed(st.error, { retry: 'reload' });
  if (!st.runs) return loading('runs');
  if (!st.runs.length) return empty('No agent has run yet. HERALD runs from the Library.');
  const tone = (s) => (s === 'ok' ? 'vital' : s === 'running' ? 'cyan' : s === 'evidence' ? 'ash' : 'deny');
  return `<table class="grid"><thead><tr><th>Run</th><th>Agent</th><th>Status</th><th>Objective</th><th>Model</th><th class="r">Tokens</th><th>Started</th><th>Took</th></tr></thead><tbody>
    ${st.runs.map((r) => { const took = r.finished_at ? Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 1000) : null;
      // What the run caused: every order that names it. The answer to "why
      // does this order exist?" and to "what came of that run?" is the same row.
      const caused = store.allOrders().filter((o) => o.sourceId === r.id);
      const read = r.sources?.length ? `read ${r.sources.length} source${r.sources.length === 1 ? '' : 's'}` : '';
      const problems = r.input?.problems?.length ? `${r.input.problems.length} gap${r.input.problems.length === 1 ? '' : 's'} in the data` : '';
      return `<tr><td><code>${esc(r.id)}</code></td><td>${chip(r.agent, 'arcane')}</td><td>${chip(r.status, tone(r.status))}</td><td>${esc(r.objective)}${r.error ? `<br><span class="breach">${esc(r.error).slice(0, 160)}</span>` : ''}${r.output?.drafts?.length ? `<br><span class="faint">${r.output.drafts.map((d) => `<a href="#beacon/draft/${esc(d)}">${esc(d)}</a>`).join(' ')}</span>` : ''}${caused.length ? `<br><span class="faint">caused: ${caused.map((o) => `<a href="#room/${esc(o.room)}" title="${esc(o.t)}">${esc(o.id)}</a> ${chip(o.state, o.state === 'proposed' ? 'arcane' : o.done ? 'ash' : 'vital')}`).join(' ')}</span>` : ''}${read || problems ? `<br><span class="faint">${[read, problems].filter(Boolean).join(' · ')}</span>` : ''}</td><td class="ash">${esc(r.model || '')}</td><td class="r ash">${r.usage?.in ? `${num(r.usage.in)} / ${num(r.usage.out)}` : '—'}</td><td class="ash nowrap" title="${esc(stampFull(r.started_at))}">${when(r.started_at)}</td><td class="ash">${took === null ? '—' : `${took}s`}</td></tr>`; }).join('')}
  </tbody></table>`;
}
function decisions() {
  const list = store.decisions();
  if (!list.length) return empty('Nothing put to the Council yet.', '<p><a class="button-link" href="#room/council">Convene the Council →</a></p>');
  return list.map((d) => `<div class="card"><div class="card-head">${chip(d.verdict, VERDICT_TONE[d.verdict])}<b>${esc(d.question)}</b><span class="faint">${esc(d.id)} · ${esc(stampFull(d.ts))}</span></div>
    <p>${esc(d.summary)}</p>
    ${d.conditions?.length ? `<p class="ash">First: ${d.conditions.map(esc).join(' · ')}</p>` : ''}${d.dissent ? `<p class="flare">Dissent: ${esc(d.dissent)}</p>` : ''}
    ${d.outcome ? `<p class="vital">Outcome: ${esc(d.outcome)} <span class="faint">${when(d.reviewed)}</span></p>` : `<form class="inline" data-act="decision-outcome" data-id="${esc(d.id)}"><input name="outcome" placeholder="What actually happened" style="flex:1;min-width:240px"><button class="tiny" type="submit">record</button></form>`}
  </div>`).join('');
}
function lessons() {
  const list = store.list('lessons');
  return `<form class="inline add-order" data-act="lesson-add"><input name="text" placeholder="A lesson, in one line — what survived" style="flex:1;min-width:280px" autocomplete="off"><select name="venture"><option value="">general</option>${VENTURES.map((v) => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}</select><button type="submit" class="primary">Keep</button></form>
    ${list.length ? list.map((l) => `<div class="order-row ${l.done ? 'done' : ''}"><span class="text">${esc(l.text)}</span>${l.venture ? chip(VENTURES.find((v) => v.id === l.venture)?.name || l.venture, 'cyan') : ''}<span class="faint nowrap">${when(l.ts)}</span><span class="row-acts">${l.done ? `<button class="tiny ghost" data-act="lesson-restore" data-id="${esc(l.id)}">restore</button>` : `<button class="tiny ghost" data-act="lesson-retire" data-id="${esc(l.id)}" title="no longer true">retire</button>`}</span></div>`).join('') : '<p class="empty">No lessons kept yet. A failed experiment, a bad trade, a draft that did not land — each leaves one line here.</p>'}`;
}
function trace() {
  return `<h2>The vault's Trace <span class="faint">${brain?.trace?.length || 0}</span></h2>
    ${brain?.trace?.length ? brain.trace.slice().reverse().map((t) => `<div class="card"><div class="card-head">${chip(t.agent, 'arcane')} <span class="ash">${esc(t.day)} ${esc(t.time)} · ${esc(t.run)}</span></div><p>${esc(t.action)}</p><p class="ash">${esc(t.inputs)}</p><p class="ash">${esc(t.result)}${t.notes && t.notes !== '—' ? ` · ${esc(t.notes)}` : ''}</p></div>`).join('') : '<p class="empty">No runs traced in the vault (the CLI path writes these).</p>'}
    <h2>This session's floor log</h2>
    ${store.records(30).map((r) => `<p class="ash"><span class="faint">${new Date(r.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span> ${esc(r.text)}</p>`).join('') || '<p class="empty">Nothing yet this session.</p>'}`;
}

/* ---------- events ---------- */
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'back') go('#');
  else if (act === 'tab') go(b.dataset.tab === 'timeline' ? '#records' : `#records/${b.dataset.tab}`);
  else if (act === 'reload') load();
  else if (act === 'lesson-retire') store.doneItem('lessons', id, true, 'no longer true');
  else if (act === 'lesson-restore') store.doneItem('lessons', id, false);
}
function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f)) return;
  if (f.dataset.act === 'lesson-add') { const t = f.text.value.trim(); if (!t) return; store.addItem('lessons', t, '', { venture: f.venture.value }); f.reset(); }
  else if (f.dataset.act === 'decision-outcome') { const o = f.outcome.value.trim(); if (o) store.setDecisionOutcome(f.dataset.id, o); }
}
