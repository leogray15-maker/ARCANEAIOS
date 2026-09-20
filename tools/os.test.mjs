/**
 * The operating system's spine: goals, targets, projects, the task engine,
 * reviews, bottlenecks and the capital plan — the rules the rooms rely on,
 * on the in-memory database. No network, no model.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { state, nextDue } from '../packages/database/src/state.js';
import { events } from '../packages/database/src/content.js';
import { METRICS, METRIC_IDS, goalTree, goalsFlat, goalChain, goalDescendants, target, targets, behind, fmt, periodOf } from '../apps/facility/src/core/goals.js';
import { projectSummary } from '../apps/facility/src/core/projects.js';
import { ruleFor, allocate, pctsValid, waterfall, cumulative } from '../apps/facility/src/core/capital.js';
import { HORIZON_IDS, REVIEW_KINDS, TASK_STATE_NAMES, ORDER_STATES } from '../packages/config/src/index.js';
import { importGoals, mirrorGoals, mirrorOperating } from './lib/state-mirror.mjs';
import { REPO } from './lib/brain.mjs';
import { aggregate } from '../packages/database/src/bridge.js';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const refuses = async (fn, re, m) => { try { await fn(); fails.push(`${m} (accepted)`); } catch (e) { if (!re.test(e.message)) fails.push(`${m}: ${e.message}`); } };
const db = memoryDb();
const now = new Date('2026-09-20T09:00:00');
let n = 0; const count = () => n;

/* ---- the vocabulary ---- */
ok(HORIZON_IDS.join(',') === 'decade,three,year,quarter,month,week,day', 'seven horizons, longest first'); n++;
ok(Object.keys(TASK_STATE_NAMES).every((s) => ORDER_STATES.includes(s)), 'every task state name maps to an order state'); n++;
ok(REVIEW_KINDS.length === 4 && REVIEW_KINDS.every((k) => k.questions.length >= 6), 'four review kinds, each with its questions'); n++;
ok(METRIC_IDS.length >= 15 && METRIC_IDS.every((id) => typeof METRICS[id].actual === 'function'), `metrics registry (${METRIC_IDS.length})`); n++;

/* ---- goals: the hierarchy ---- */
const decade = await state.insert(db, 'goals', { title: 'A quiet empire', horizon: 'decade' }, { now });
const year = await state.insert(db, 'goals', { title: '£10k a month', horizon: 'year', parent_id: decade.id, metric: 'revenue_month', target: 10000, starts: '2026-01-01', ends: '2026-12-31' }, { now });
const q = await state.insert(db, 'goals', { title: '50 Archives members', horizon: 'quarter', parent_id: year.id, metric: 'members_archives', target: 50, starts: '2026-07-01', ends: '2026-09-30' }, { now });
const typed = await state.insert(db, 'goals', { title: 'Write the book', horizon: 'quarter', parent_id: year.id, target: 12, current: 3, unit: 'chapters' }, { now });
ok(decade.id.startsWith('GL-') && year.parent_id === decade.id, 'goals are minted and chained'); n++;
await refuses(() => state.insert(db, 'goals', { title: 'x', horizon: 'year', parent_id: q.id }, { now }), /longer horizon/, 'a year goal serving a quarter goal'); n++;
await refuses(() => state.insert(db, 'goals', { title: 'x', horizon: 'month', parent_id: 'GL-nope' }, { now }), /no goal GL-nope/, 'a parent that does not exist'); n++;
await refuses(() => state.update(db, 'goals', year.id, { parent_id: year.id }, { now }), /own parent/, 'a goal as its own parent'); n++;
await refuses(() => state.insert(db, 'goals', { title: 'x', metric: 'not-a-metric' }, { now }), /unknown metric/, 'an unknown metric'); n++;
await refuses(() => state.remove(db, 'goals', typed.id), /never deleted/, 'deleting a goal'); n++;
const tree = goalTree(await state.list(db, 'goals'));
ok(tree.length === 1 && tree[0].children.length === 1 && tree[0].children[0].children.length === 2, 'the tree: decade → year → two quarters'); n++;
ok(goalsFlat(await state.list(db, 'goals')).map((g) => g.depth).join('') === '0122', 'flat order carries depth'); n++;
ok(goalChain(await state.list(db, 'goals'), q.id).map((g) => g.horizon).join('>') === 'decade>year>quarter', 'the chain from a goal to its root'); n++;
ok(goalDescendants(await state.list(db, 'goals'), decade.id).length === 3, 'descendants at any depth'); n++;

/* ---- targets: the arithmetic ---- */
const tables = {
  ledger_months: [{ id: '2026-09:archives', month: '2026-09', venture: 'archives', units: 14, revenue_gbp: null }, { id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 1428 }, { id: '2026-08:archives', month: '2026-08', venture: 'archives', units: 11 }],
  fixed_costs: [{ id: 'software', amount_gbp: 200, active: true }], cash_snapshots: [{ day: '2026-09-19', cash_gbp: 800 }], pots: [], dispatch: [], dispatch_items: [], products: [], stock_lots: [], settings: [], trades: [], protocol_items: [], protocol_ticks: [], orders: [],
  goals: await state.list(db, 'goals'),
};
const ty = target(year, tables, { now });
ok(ty.actual === 14 * 128 + 1428 && ty.how === 'computed', `a bound goal reads the tables (${ty.actual})`); n++;
ok(ty.variance === ty.actual - 10000 && ty.pct === Math.round(ty.actual / 100), 'variance and percent'); n++;
ok(ty.daysLeft === 102, `days left to the end date (${ty.daysLeft})`); n++;
ok(ty.trend === 'up' && ty.previous === 11 * 128, 'trend against the month before'); n++;
ok(behind(ty), 'behind: 72% of the year gone, 32% of the target reached'); n++;
const tq = target(q, tables, { now });
ok(tq.actual === 14 && tq.pct === 28 && tq.unit === 'members', 'members bound from the ledger'); n++;
const tt = target(typed, tables, { now });
ok(tt.actual === 3 && tt.pct === 25 && tt.how === 'typed' && tt.trend === null, 'a typed goal uses its current value and has no trend'); n++;
const td = target(decade, tables, { now, goals: tables.goals });
ok(td.how === 'children' && td.pct === target(year, tables, { now }).pct, 'a parent without a number is as far along as its children'); n++;
ok(fmt(1234.5, '£') === '£1,235' && fmt(28, '%') === '28%' && fmt(3, 'chapters') === '3 chapters' && fmt(null) === '—', 'figures in their units'); n++;
ok(targets(tables.goals, tables, { now }).length === 4 && targets(tables.goals, tables, { now })[0].depth === 0, 'every active goal as a target, tree-ordered'); n++;
ok(periodOf('week', now) === '2026-W38' && periodOf('quarter', now) === '2026-Q3' && periodOf('month', now) === '2026-09' && periodOf('day', now) === '2026-09-20', 'period keys'); n++;
await state.update(db, 'goals', typed.id, { status: 'done' }, { now });
const tDone = target((await state.list(db, 'goals')).find((g) => g.id === typed.id), tables, { now });
ok(tDone.pct === 100 && tDone.status === 'done', 'a done goal is 100%'); n++;

/* ---- projects and the task engine ---- */
const prj = await state.insert(db, 'projects', { name: 'Launch the Codex site', venture: 'codex', goal_id: year.id, due: '2026-09-25', budget_gbp: 500, spent_gbp: 120 }, { now });
ok(prj.id.startsWith('PRJ-') && prj.status === 'ready', 'a project is minted'); n++;
await refuses(() => state.insert(db, 'projects', { name: 'x', goal_id: 'GL-nope' }, { now }), /no goal/, 'a project serving a goal that does not exist'); n++;
await refuses(() => state.insert(db, 'orders', { room: 'forge', text: 'x', project_id: 'PRJ-nope' }, { now }), /no project/, 'an order in a project that does not exist'); n++;
const o1 = await state.insert(db, 'orders', { room: 'forge', text: 'Build the page', priority: 1, project_id: prj.id, goal_id: year.id, estimate_h: 4 }, { now });
const o2 = await state.insert(db, 'orders', { room: 'forge', text: 'Write the copy', priority: 2, project_id: prj.id, depends_on: o1.id, estimate_h: 2 }, { now });
await refuses(() => state.update(db, 'orders', o2.id, { depends_on: o2.id }, { now }), /wait on itself/, 'an order waiting on itself'); n++;
let ps = projectSummary(prj, await state.list(db, 'orders'), { now });
ok(ps.total === 2 && ps.open === 2 && ps.pct === 0 && ps.estimate === 6 && ps.daysLeft === 5, `a project sums its orders (${ps.total}, ${ps.estimate}h, ${ps.daysLeft}d)`); n++;
ok(ps.health === 'at_risk' && /due in 5 days at 0%/.test(ps.reasons[0]), `due soon with little done is at risk (${ps.reasons[0]})`); n++;
await state.update(db, 'orders', o1.id, { state: 'blocked', blocked_on: 'the domain' }, { now });
ps = projectSummary(prj, await state.list(db, 'orders'), { now });
ok(ps.health === 'blocked' && /P0\/P1 blocked: the domain/.test(ps.reasons[0]), 'a blocked P1 blocks the project, with the reason'); n++;
await state.update(db, 'orders', o1.id, { state: 'done' }, { now });
await state.update(db, 'orders', o2.id, { state: 'done' }, { now });
ps = projectSummary(prj, await state.list(db, 'orders'), { now });
ok(ps.health === 'complete' && ps.pct === 100, 'every order done is complete'); n++;
const far = await state.insert(db, 'projects', { name: 'Later', due: '2026-12-01' }, { now });
await state.insert(db, 'orders', { room: 'forge', text: 'a', project_id: far.id }, { now });
ok(projectSummary(far, await state.list(db, 'orders'), { now }).health === 'on_track', 'work in hand with time is on track'); n++;
await refuses(() => state.remove(db, 'projects', prj.id), /never deleted/, 'deleting a project'); n++;

/* ---- recurrence ---- */
ok(nextDue('2026-09-20', 'day') === '2026-09-21' && nextDue('2026-09-20', 'week') === '2026-09-27' && nextDue('2026-01-31', 'month') === '2026-03-03', 'next due dates'); n++;
const rec = await state.insert(db, 'orders', { room: 'vault', text: 'Type the cash snapshot', priority: 2, recurrence: 'week', due: '2026-09-20' }, { now });
await state.update(db, 'orders', rec.id, { state: 'done' }, { now });
const orders = await state.list(db, 'orders');
const again = orders.find((o) => o.text === rec.text && o.state === 'open');
ok(again && again.id !== rec.id && again.due === '2026-09-27' && again.recurrence === 'week', `a recurring order comes back with the next due date (${again?.due})`); n++;
const ev = (await events.list(db, { limit: 50 })).find((e) => e.subject_id === rec.id && /recurs as/.test(e.summary));
ok(!!ev, 'the record says it recurred'); n++;
await refuses(() => state.insert(db, 'orders', { room: 'vault', text: 'x', recurrence: 'fortnight' }, { now }), /must be one of/, 'an unknown recurrence'); n++;

/* ---- decisions carry what was weighed ---- */
const dec = await state.insert(db, 'decisions', { question: 'Launch the £800 offer?', source: 'leo', context: 'Cash is £800.', options: [{ name: 'Launch now' }, { name: 'Wait a month' }], evidence: '3 leads asked', assumptions: 'they convert at 30%', risks: 'no time to deliver', impact_gbp: 2400, review_on: '2026-10-20', venture: 'codex' }, { now });
ok(dec.options.length === 2 && dec.impact_gbp === 2400 && dec.review_on === '2026-10-20' && dec.verdict === 'WATCH', 'a decision keeps its options, evidence, impact and review date'); n++;
await state.update(db, 'decisions', dec.id, { verdict: 'BUILD', outcome: 'launched, 2 sold', retro: 'the 30% was optimistic' }, { now });
const d2 = (await state.list(db, 'decisions'))[0];
ok(d2.verdict === 'BUILD' && d2.reviewed_at && d2.retro, 'outcome and retrospective recorded'); n++;

/* ---- reviews are kept, then immutable ---- */
const rev = await state.insert(db, 'reviews', { kind: 'day', period: '2026-09-20', answers: { completed: 'two orders' }, facts: { done: 2 } }, { now });
ok(rev.status === 'draft' && rev.id.startsWith('REV-'), 'a review starts as a draft'); n++;
await state.update(db, 'reviews', rev.id, { answers: { completed: 'two orders', lessons: 'start earlier' }, status: 'kept' }, { now });
const kept = (await state.list(db, 'reviews'))[0];
ok(kept.status === 'kept' && kept.kept_at && kept.answers.lessons === 'start earlier', 'kept with its answers'); n++;
await refuses(() => state.update(db, 'reviews', rev.id, { answers: { completed: 'nothing' } }, { now }), /part of the record/, 'editing a kept review'); n++;
await refuses(() => state.remove(db, 'reviews', rev.id), /part of the record/, 'deleting a kept review'); n++;
await refuses(() => state.insert(db, 'reviews', { kind: 'sprint', period: 'x' }, { now }), /must be one of/, 'an unknown review kind'); n++;

/* ---- bottlenecks ---- */
const b = await state.insert(db, 'bottlenecks', { text: 'Only one pair of hands packs the boxes', area: 'production', severity: 'warn', venture: 'peptides', evidence: '8 in the queue, 2 shipped a day' }, { now });
ok(b.id.startsWith('BTL-') && b.status === 'open', 'a bottleneck is recorded with its evidence'); n++;
await state.update(db, 'bottlenecks', b.id, { status: 'cleared' }, { now });
ok((await state.list(db, 'bottlenecks'))[0].cleared_at, 'clearing stamps it'); n++;
await refuses(() => state.remove(db, 'bottlenecks', b.id), /never deleted/, 'deleting a bottleneck'); n++;

/* ---- the capital plan ---- */
ok(pctsValid({ a: 60, b: 40 }) && !pctsValid({ a: 60, b: 30 }), 'percentages must add to 100'); n++;
const alloc = allocate(1000.01, { reinvest: 50, pay: 30, reserve: 20 });
ok(Math.abs(alloc.reinvest + alloc.pay + alloc.reserve - 1000.01) < 0.001 && alloc.reinvest === 500.01 || alloc.reinvest === 500.005 || Math.abs(Object.values(alloc).reduce((a, x) => a + x, 0) - 1000.01) < 0.001, 'pounds add to the amount exactly'); n++;
await refuses(() => state.insert(db, 'capital_rules', { id: 'big', name: 'Big months', min_available: 5000, pcts: { reinvest: 70, pay: 20 } }, { now }), /add to 100/, 'a rule whose percentages do not add to 100'); n++;
await state.insert(db, 'capital_rules', { id: 'big', name: 'Big months', min_available: 5000, pcts: { reinvest: 70, pay: 20, reserve: 10 }, position: 0 }, { now });
await state.insert(db, 'capital_rules', { id: 'normal', name: 'Normal months', min_available: 1000, pcts: { reinvest: 40, pay: 40, reserve: 20 }, position: 1 }, { now });
const rules = await state.list(db, 'capital_rules');
ok(ruleFor(rules, 6000)?.id === 'big' && ruleFor(rules, 2000)?.id === 'normal' && ruleFor(rules, 500) === null, 'the first rule whose threshold is met applies; below every threshold the pots do'); n++;
const pots = [{ id: 'tax', name: 'Tax', pct: 25, position: 0 }, { id: 'reinvest', name: 'Reinvest', pct: 35, position: 1 }, { id: 'pay', name: 'Pay', pct: 25, position: 2 }, { id: 'reserve', name: 'Reserve', pct: 15, position: 3 }];
const wf = waterfall({ ledger_months: [{ id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 4000 }], fixed_costs: [{ id: 'a', amount_gbp: 1000, active: true }], pots, capital_rules: rules, dispatch: [{ id: 'D1', stage: 'shipped', shipped_at: '2026-09-10T10:00:00Z' }], dispatch_items: [{ id: 'I1', dispatch_id: 'D1', product_id: 'p', lot_id: 'L1', vials: 10, unit_price_gbp: 40, unit_cost_gbp: 5 }] }, '2026-09');
ok(wf.revenue === 4000 && wf.cogs === 50 && wf.cogsKnown && wf.gross === 3950 && wf.fixed === 1000 && wf.net === 2950, `the waterfall: revenue 4000 − cogs 50 = gross 3950 − fixed 1000 = net ${wf.net}`); n++;
ok(wf.taxPct === 25 && wf.tax === 737.5 && wf.available === 2212.5, `tax reserve 25% of net = ${wf.tax}; available ${wf.available}`); n++;
ok(wf.rule?.id === 'normal' && wf.pcts.reinvest === 40, 'the normal rule applies at £2,212 available'); n++;
ok(Math.abs(Object.values(wf.buckets).reduce((a, x) => a + x, 0) - 2212.5) < 0.001 && wf.buckets.reinvest === 885, `the buckets add to the available figure (${JSON.stringify(wf.buckets)})`); n++;
const wf0 = waterfall({ ledger_months: [{ id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 1500 }], fixed_costs: [{ id: 'a', amount_gbp: 1000, active: true }], pots, capital_rules: [] }, '2026-09');
ok(!wf0.cogsKnown && wf0.cogs === null && /unknown/.test(wf0.explain.cogs) && wf0.rule === null && Math.abs(wf0.pcts.reinvest - 46.67) < 0.01, 'with no shipped lines the cost of goods is unknown, said so, and the pots (renormalised) apply'); n++;
const wfNeg = waterfall({ ledger_months: [{ id: '2026-09:peptides', month: '2026-09', venture: 'peptides', revenue_gbp: 500 }], fixed_costs: [{ id: 'a', amount_gbp: 1000, active: true }], pots }, '2026-09');
ok(wfNeg.net === -500 && wfNeg.tax === 0 && wfNeg.available === -500 && Object.values(wfNeg.buckets).every((v) => v === 0), 'a loss reserves no tax and allocates nothing'); n++;
const wfNone = waterfall({ pots }, '2026-09');
ok(wfNone.revenue === null && wfNone.net === null && wfNone.available === null, 'nothing typed is nothing, not zero'); n++;
const al = await state.insert(db, 'capital_allocations', { id: '2026-09', month: '2026-09', available: wf.available, rule_id: 'normal', proposed: wf.buckets }, { now });
ok(al.confirmed_at === null && Object.keys(al.confirmed).length === 0, 'a proposed allocation is not confirmed'); n++;
await state.update(db, 'capital_allocations', '2026-09', { confirmed: wf.buckets }, { now });
const al2 = (await state.list(db, 'capital_allocations'))[0];
ok(al2.confirmed_at && al2.confirmed.reinvest === 885, 'confirming stamps it'); n++;
await refuses(() => state.update(db, 'capital_allocations', '2026-09', { confirmed: { reinvest: 1 } }, { now }), /confirmed/, 'changing a confirmed allocation'); n++;
await refuses(() => state.remove(db, 'capital_allocations', '2026-09'), /record/, 'deleting a confirmed allocation'); n++;
const cum = cumulative([al2, { month: '2026-08', confirmed: { reinvest: 100, pay: 50 }, confirmed_at: '2026-08-31T00:00:00Z' }]);
ok(cum.rows[0].month === '2026-08' && cum.total.reinvest === 985 && cum.total.pay === 935, `cumulative confirmed by bucket (${JSON.stringify(cum.total)})`); n++;

/* ---- the vault: Goals.md seeds the table once, then is the mirror ---- */
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'arcane-brain-'));
fs.cpSync(path.join(REPO, 'brain'), scratch, { recursive: true });
const db2 = memoryDb();
await state.insert(db2, 'goal_progress', { goal_id: 'g-codex', value: 40 }, { now });
const seeded = await importGoals(db2, scratch);
ok(seeded.length >= 9 && seeded.includes('g-mrr') && seeded.includes('g-coa'), `Goals.md seeded the table with its ids (${seeded.length})`); n++;
const g2 = await state.list(db2, 'goals');
ok(g2.find((g) => g.id === 'g-mrr').metric === 'revenue_month' && g2.find((g) => g.id === 'g-mrr').target === 10000, 'the £10k goal is bound to this month\'s revenue'); n++;
ok(g2.find((g) => g.id === 'g-codex').current === 40 && !g2.find((g) => g.id === 'g-codex').metric, 'a typed goal carried its goal_progress value over'); n++;
ok((await importGoals(db2, scratch)).length === 0, 'a second import adds nothing'); n++;
ok((await mirrorGoals(db2, scratch, now)) !== 'kept', 'Goals.md rewritten as a generated file'); n++;
ok(/generated: true/.test(fs.readFileSync(path.join(scratch, '05-Knowledge', 'Goals.md'), 'utf8')), 'and marked generated'); n++;
ok((await importGoals(db2, scratch)).length === 0, 'a generated Goals.md is never imported back'); n++;
await state.insert(db2, 'projects', { name: 'Mirror me', due: '2026-10-01' }, { now });
const op = await mirrorOperating(db2, scratch, now);
ok(op.projects !== 'kept' && fs.existsSync(path.join(scratch, '05-Knowledge', 'Projects.md')) && fs.existsSync(path.join(scratch, '05-Knowledge', 'Bottlenecks.md')), 'projects and bottlenecks mirrored'); n++;
await state.insert(db2, 'reviews', { kind: 'week', period: '2026-W38', answers: { goals: 'moved' }, status: 'kept' }, { now });
ok((await mirrorOperating(db2, scratch, now)).reviews === 1 && fs.existsSync(path.join(scratch, '04-Records', 'Reviews', 'week-2026-W38.md')), 'a kept review lands in the Records'); n++;
fs.rmSync(scratch, { recursive: true, force: true });

/* ---- the Bridge carries the picture ---- */
const agg = await aggregate(db, { now });
ok(agg.north_star?.id === decade.id && agg.annual.length === 1 && agg.targets.length >= 3, 'the aggregate names the north star and the year'); n++;
ok(agg.projects.length === 2 && agg.projects.every((p) => p.health), 'projects with health'); n++;
ok(agg.agents.list.length === 19 && typeof agg.agents.counts.idle === 'number', 'nineteen agents with a derived status'); n++;
ok(agg.reviews.length === 4 && agg.reviews.find((r) => r.kind === 'day').status === 'kept', 'the review cycle says which are kept'); n++;
ok(agg.capital && agg.capital.month === '2026-09', 'the capital waterfall for the month'); n++;

/* ---- the record ---- */
const log = await events.list(db, { limit: 200 });
ok(['goal.added', 'project.added', 'review.added', 'bottleneck.added', 'capital-rule.set', 'allocation.set', 'decision.changed'].every((k) => log.some((e) => e.kind === k)), 'every new object leaves an event'); n++;

if (fails.length) { console.error(`✗ os: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ the operating system — goals with a hierarchy, targets read from the tables, projects with computed health, recurring orders, decisions that keep what was weighed, immutable reviews and allocations, the capital waterfall (${count()} checks)`);
