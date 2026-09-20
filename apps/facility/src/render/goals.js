/**
 * NORTH STAR — the goal hierarchy.
 *
 *   #goals            the tree: 10 YEAR → 3 YEAR → 1 YEAR → QUARTER → MONTH → WEEK → DAY, click through
 *   #goals/<id>       one goal: its target read against the tables, its chain, its children,
 *                     the ventures/projects/tasks that serve it, notes, review history
 *
 * A goal is a row in `goals` (0011). Its actual is computed when it names
 * a metric (core/goals.js), typed otherwise. A goal with neither but with
 * children is as far along as they are, on average — never invented.
 */
import { GOAL_HORIZONS, HORIZON_BY_ID, GOAL_CATEGORIES, VENTURE_BY_ID } from '@arcane/config';
import { METRICS, fmt, behind } from '../core/goals.js';
import { esc, chip, when, failed, handleKeyForm } from './ui.js';

const STATUS_TONE = { active: 'cyan', done: 'vital', dropped: 'deny', paused: 'ash' };
const TREND_CHIP = { up: ['▲', 'vital'], down: ['▼', 'deny'], flat: ['—', 'ash'] };

let el = null, go = null, store = null;
const st = { adding: '' };

export function bindGoals(view, ctx) { el = view; go = ctx.go; store = ctx.store; el.addEventListener('click', onClick); el.addEventListener('submit', onSubmit); el.addEventListener('change', onChange); }
export function renderGoals(view, ctx, hash = '#goals', { keepScroll = false } = {}) { el = view; paint(hash, { keepScroll }); }

function progressBar(g) {
  if (g.pct === null) return '<span class="faint">no number yet</span>';
  const over = g.elapsedPct !== null && behind(g) ? ' breach' : '';
  return `<span class="bar"><span class="bar-fill${over ? ' breach' : g.pct >= 100 ? ' vital' : ''}" style="width:${Math.min(100, g.pct)}%"></span></span> <b>${g.pct}%</b>${behind(g) ? ' <span class="breach" title="more of the time has gone than of the target has been reached">behind</span>' : ''}`;
}

function goalRow(g, tgt, depth = 0) {
  const trend = tgt.trend ? TREND_CHIP[tgt.trend] : null;
  return `<div class="order-row goal-row" style="padding-left:${depth * 20}px" data-id="${esc(g.id)}">
    ${depth ? '<span class="faint">↳</span>' : ''}
    <a class="text" href="#goals/${esc(g.id)}"><b>${esc(g.title)}</b></a>
    ${chip(HORIZON_BY_ID[g.horizon]?.name || g.horizon, 'arcane')}
    ${g.status !== 'active' ? chip(g.status, STATUS_TONE[g.status]) : ''}
    ${g.venture ? chip(VENTURE_BY_ID[g.venture]?.name || g.venture, 'cyan') : ''}
    <span class="faint">${tgt.actual === null ? '—' : fmt(tgt.actual, tgt.unit)}${tgt.target !== null ? ` / ${fmt(tgt.target, tgt.unit)}` : ''}</span>
    ${progressBar(tgt)}
    ${trend ? `<span class="${trend[1]}" title="trend">${trend[0]}</span>` : ''}
    ${tgt.daysLeft !== null ? `<span class="faint nowrap">${tgt.daysLeft < 0 ? `${-tgt.daysLeft}d over` : `${tgt.daysLeft}d left`}</span>` : ''}
  </div>`;
}

function paint(hash, { keepScroll = false } = {}) {
  if (!el || !store) return;
  const scroll = keepScroll ? el.scrollTop : 0;
  const id = /^#goals\/([A-Za-z0-9-]+)$/.exec(hash)?.[1];
  const sv = store.serverStatus();
  const tree = store.goalTree();
  const walkTargets = (nodes, depth) => nodes.flatMap((g) => [goalRow(g, store.targetOf(g.id), depth), ...walkTargets(g.children, depth + 1)]);

  el.innerHTML = `<div class="wrap app goals">
    <div class="view-head">
      <button class="back ghost" data-act="${id ? 'goals' : 'back'}">${id ? '← North Star' : '← Floor'}</button>
      <h1>NORTH STAR</h1>
      <span class="sub">${store.goals().length} active goal${store.goals().length === 1 ? '' : 's'} · ${store.goals(true).filter((g) => g.status === 'done').length} done</span>
      <span class="spacer"></span>
      <a class="button-link" href="#targets">TARGETS →</a>
    </div>
    ${sv.tone === 'breach' ? `<p class="flash breach">${esc(sv.text)}</p>` : ''}
    ${store.server.needsKey || (!store.server.ready && store.server.reason === 'no operator key') ? failed({ needsKey: true, status: 401 }) : ''}
    ${id ? goalPage(id) : `
      ${tree.length ? walkTargets(tree, 0).join('') : '<p class="empty">No goals yet. Start with a 10-year direction, or straight at a quarter — the hierarchy fills in either way.</p>'}
      <h3>New goal</h3>
      ${goalForm()}
    `}
  </div>`;
  if (keepScroll) el.scrollTop = scroll;
}

function goalForm(parentId = '') {
  const parents = parentId ? store.goals().filter((g) => g.id !== parentId) : [];
  return `<form class="inline" data-act="goal-add" data-parent="${esc(parentId)}">
    <select name="horizon">${GOAL_HORIZONS.map((h) => `<option value="${h.id}">${h.name}</option>`).join('')}</select>
    <input name="title" placeholder="Title" style="flex:1;min-width:200px" required>
    <select name="category"><option value="">category</option>${GOAL_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select>
    ${parentId ? `<input type="hidden" name="parent_id" value="${esc(parentId)}">` : `<select name="parent_id"><option value="">no parent</option>${store.goals().map((g) => `<option value="${esc(g.id)}">${esc(g.title)} (${HORIZON_BY_ID[g.horizon]?.name})</option>`).join('')}</select>`}
    <select name="metric"><option value="">typed value</option>${Object.entries(METRICS).map(([id, m]) => `<option value="${id}">${esc(m.name)}</option>`).join('')}</select>
    <input name="target" type="number" step="any" placeholder="target" style="width:100px">
    <input name="ends" type="date" placeholder="ends">
    <button type="submit">Add</button>
  </form>`;
}

function goalPage(id) {
  const g = store.goal(id);
  if (!g) return '<p class="empty">No such goal.</p>';
  const tgt = store.targetOf(id);
  const chain = store.goalChain(id);
  const children = store.goalDescendants(id).filter((x) => x.parent_id === id);
  const orders = store.ordersForGoal(id);
  const open = orders.filter((o) => !o.done && o.state !== 'proposed');
  const projects = store.projectsForGoal(id);
  const metricNote = g.metric ? `Bound to <b>${esc(METRICS[g.metric]?.name || g.metric)}</b> — the actual is computed, never typed.` : 'No metric bound — type the current value as it stands.';
  return `<div class="bridge-grid">
    <div class="bridge-main">
      <p class="faint">${chain.map((c) => (c.id === id ? `<b>${esc(c.title)}</b>` : `<a href="#goals/${esc(c.id)}">${esc(c.title)}</a>`)).join(' → ')}</p>
      <section>
        <h2>${esc(g.title)} ${chip(HORIZON_BY_ID[g.horizon]?.name || g.horizon, 'arcane')} ${g.status !== 'active' ? chip(g.status, STATUS_TONE[g.status]) : ''}</h2>
        <div class="stat-row">
          <div class="stat"><b>${tgt.actual === null ? '—' : fmt(tgt.actual, tgt.unit)}</b><span>actual</span></div>
          <div class="stat"><b>${tgt.target === null ? '—' : fmt(tgt.target, tgt.unit)}</b><span>target</span></div>
          <div class="stat ${tgt.variance !== null && tgt.variance < 0 ? 'breach' : tgt.variance !== null ? 'vital' : ''}"><b>${tgt.variance === null ? '—' : fmt(tgt.variance, tgt.unit)}</b><span>variance</span></div>
          <div class="stat"><b>${tgt.pct === null ? '—' : `${tgt.pct}%`}</b><span>progress</span></div>
          <div class="stat"><b>${tgt.daysLeft === null ? '—' : tgt.daysLeft}</b><span>days left</span></div>
        </div>
        <p class="src">${metricNote}${tgt.trend ? ` Trending ${tgt.trend === 'up' ? 'up' : tgt.trend === 'down' ? 'down' : 'flat'} against the period before.` : ''}${behind(tgt) ? ' More of the time has gone than of the target has been reached.' : ''}</p>
        <form class="inline" data-act="goal-edit" data-id="${esc(g.id)}">
          ${g.metric ? '' : `<input name="current" type="number" step="any" placeholder="current" value="${esc(g.current ?? '')}" style="width:100px">`}
          <input name="target" type="number" step="any" placeholder="target" value="${esc(g.target ?? '')}" style="width:100px">
          <input name="unit" placeholder="unit" value="${esc(g.unit || '')}" style="width:90px">
          <input name="starts" type="date" value="${esc(g.starts || '')}">
          <input name="ends" type="date" value="${esc(g.ends || '')}">
          <select name="status">${['active', 'done', 'paused', 'dropped'].map((s) => `<option value="${s}" ${g.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="tiny" type="submit">save</button>
        </form>
        <label class="field wide"><span>notes</span><textarea data-act="goal-note" data-id="${esc(g.id)}" rows="2" placeholder="Notes, dependencies, review history">${esc(g.note || '')}</textarea></label>
      </section>
      <section>
        <h2>Serves this goal <span class="faint">${open.length} open of ${orders.length}</span></h2>
        ${projects.length ? `<h3>Projects</h3>${projects.map((p) => `<div class="order-row"><a class="text" href="#projects/${esc(p.id)}">${esc(p.name)}</a>${chip(p.status)}</div>`).join('')}` : ''}
        ${open.length ? open.slice(0, 20).map((o) => `<div class="order-row"><span class="chip ${['deny', 'flare', 'arcane', 'ash'][o.p]}">${['P0', 'P1', 'P2', 'P3'][o.p]}</span><span class="text">${esc(o.t)}</span><a class="room" href="#room/${esc(o.room)}">${esc(o.room)}</a></div>`).join('') : '<p class="empty">No task names this goal yet.</p>'}
        <form class="inline" data-act="task-add" data-goal="${esc(id)}"><select name="room">${[['bridge', 'Bridge'], ['warroom', 'War Room'], ['forge', 'Forge'], ['beacon', 'Beacon'], ['apothecary', 'The Lab'], ['vault', 'Vault']].map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select><input name="text" placeholder="A task that serves this goal" style="flex:1;min-width:200px"><button type="submit">Add</button></form>
      </section>
    </div>
    <aside class="bridge-side">
      <h2>Children <span class="faint">the next horizon down</span></h2>
      ${children.length ? children.map((c) => { const ct = store.targetOf(c.id); return `<div class="venture-card"><div class="vc-head"><a href="#goals/${esc(c.id)}"><b>${esc(c.title)}</b></a> ${chip(HORIZON_BY_ID[c.horizon]?.name, 'arcane')}</div><p class="ash">${ct.actual === null ? '—' : fmt(ct.actual, ct.unit)}${ct.target !== null ? ` / ${fmt(ct.target, ct.unit)}` : ''} ${progressBar(ct)}</p></div>`; }).join('') : `<p class="empty">No goal serves this one yet.</p>${goalForm(id)}`}
      ${children.length ? goalForm(id) : ''}
    </aside>
  </div>`;
}

function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'FORM') return;
  const act = b.dataset.act;
  if (act === 'back') go('#');
  else if (act === 'goals') go('#goals');
}
function onChange(e) {
  const i = e.target;
  if (i.dataset.act === 'goal-note') { const id = i.dataset.id; const v = i.value; setTimeout(() => store.setGoal(id, { note: v }), 0); }
}
function onSubmit(e) {
  const f = e.target; if (!f.dataset.act) return;
  e.preventDefault();
  if (handleKeyForm(f)) return;
  const act = f.dataset.act;
  if (act === 'goal-add') {
    const title = f.title.value.trim(); if (!title) return;
    store.addGoal({ title, horizon: f.horizon.value, category: f.category.value, parent_id: f.parent_id?.value || f.dataset.parent || null, metric: f.metric.value, target: f.target.value === '' ? null : Number(f.target.value), ends: f.ends.value || null });
    f.reset();
  } else if (act === 'goal-edit') {
    const patch = {};
    if (f.current) patch.current = f.current.value === '' ? null : Number(f.current.value);
    patch.target = f.target.value === '' ? null : Number(f.target.value);
    patch.unit = f.unit.value; patch.starts = f.starts.value || null; patch.ends = f.ends.value || null; patch.status = f.status.value;
    store.setGoal(f.dataset.id, patch);
  } else if (act === 'task-add') {
    const text = f.text.value.trim(); if (!text) return;
    store.addOrder(f.room.value, text, 2, { goalId: f.dataset.goal });
    f.reset();
  }
}
