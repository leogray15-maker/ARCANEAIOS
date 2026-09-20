/**
 * The workflow engine: a pure step runner over a DAG. No caller exists
 * yet (docs/OPENJARVIS_PORT.md) — this tests the engine on its own terms.
 */
import { validate, run, progress } from '../packages/database/src/workflow.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
let n = 0;

/* ---- validation ---- */
let threw = null;
try { validate([{ id: 'a' }, { id: 'a' }]); } catch (e) { threw = e; }
ok(threw && /share an id/.test(threw.message), 'duplicate step ids are refused'); n++;
threw = null;
try { validate([{ id: 'a', after: ['nope'] }]); } catch (e) { threw = e; }
ok(threw && /unknown step/.test(threw.message), 'waiting on an unknown step is refused'); n++;
threw = null;
try { validate([{ id: 'a', after: ['b'] }, { id: 'b', after: ['a'] }]); } catch (e) { threw = e; }
ok(threw && /cycle/.test(threw.message), 'a cycle is refused'); n++;

/* ---- linear chain, agent steps ---- */
const order = [];
const linear = [
  { id: 'research', kind: 'agent', run: async () => { order.push('research'); return 'facts'; } },
  { id: 'draft', kind: 'agent', after: ['research'], run: async (ctx) => { order.push('draft'); return `drafted from ${ctx.done.research}`; } },
];
let s = await run(linear, {});
ok(order.join(',') === 'research,draft', 'steps run in dependency order'); n++;
ok(s.done.draft === 'drafted from facts', 'a later step reads an earlier one\'s output through ctx.done'); n++;
ok(progress(linear, s).finished, 'a fully completed workflow reports finished'); n++;

/* ---- parallel wave ---- */
const started = [];
const parallel = [
  { id: 'a', kind: 'agent', run: async () => { started.push('a'); return 1; } },
  { id: 'b', kind: 'agent', run: async () => { started.push('b'); return 2; } },
  { id: 'c', kind: 'agent', after: ['a', 'b'], run: async (ctx) => ctx.done.a + ctx.done.b },
];
s = await run(parallel, {});
ok(s.done.c === 3, 'a step waits for every dependency before it runs'); n++;
ok(started.includes('a') && started.includes('b'), 'independent steps both ran'); n++;

/* ---- a condition that fails skips everything downstream ---- */
const cond = [
  { id: 'check', kind: 'condition', test: async () => false },
  { id: 'only-if-true', kind: 'agent', after: ['check'], run: async () => { throw new Error('should never run'); } },
  { id: 'also-downstream', kind: 'agent', after: ['only-if-true'], run: async () => { throw new Error('should never run either'); } },
];
s = await run(cond, {});
ok(!s.failed, 'a false condition is not a failure'); n++;
ok(s.skipped.includes('only-if-true') && s.skipped.includes('also-downstream'), 'everything downstream of a false condition is skipped, transitively'); n++;
ok(progress(cond, s).finished, 'skipped steps still count toward finished'); n++;

/* ---- a true condition lets the branch run ---- */
const condTrue = [
  { id: 'check', kind: 'condition', test: async () => true },
  { id: 'runs', kind: 'agent', after: ['check'], run: async () => 'ran' },
];
s = await run(condTrue, {});
ok(s.done.runs === 'ran' && !s.skipped.length, 'a true condition lets its branch run'); n++;

/* ---- approval pauses the workflow, and resumes on decision ---- */
const withApproval = [
  { id: 'propose', kind: 'agent', run: async () => 'the plan' },
  { id: 'gate', kind: 'approval', after: ['propose'], describe: async (ctx) => `approve: ${ctx.done.propose}?` },
  { id: 'execute', kind: 'agent', after: ['gate'], run: async () => 'executed' },
];
s = await run(withApproval, {});
ok(s.pending?.id === 'gate' && s.pending.description === 'approve: the plan?', `the run stops at the approval and describes it (${JSON.stringify(s.pending)})`); n++;
ok(!('execute' in s.done), 'nothing past the approval has run yet'); n++;
const p1 = progress(withApproval, s);
ok(!p1.finished && p1.pending?.id === 'gate', 'progress reports the pending approval'); n++;

// Resume, approved.
s = await run(withApproval, {}, { ...s, pending: { id: 'gate', decision: 'approved' } });
ok(s.done.execute === 'executed' && progress(withApproval, s).finished, 'approving resumes the workflow to completion'); n++;

// A fresh run, resumed as denied instead.
let s2 = await run(withApproval, {});
s2 = await run(withApproval, {}, { ...s2, pending: { id: 'gate', decision: 'denied' } });
ok(s2.skipped.includes('gate') && s2.skipped.includes('execute') && !('execute' in s2.done), 'denying an approval skips it and everything downstream, and never executes'); n++;
ok(progress(withApproval, s2).finished, 'a denied branch still reaches a finished state'); n++;

/* ---- failure stops the run and does not resume on its own ---- */
const failing = [
  { id: 'boom', kind: 'agent', run: async () => { throw new Error('the tool refused'); } },
  { id: 'never', kind: 'agent', after: ['boom'], run: async () => { throw new Error('should not run'); } },
];
s = await run(failing, {});
ok(s.failed?.id === 'boom' && /refused/.test(s.failed.error), 'a thrown error is captured as a named failure, not thrown to the caller'); n++;
ok(!('never' in s.done) && !s.skipped.includes('never'), 'a step downstream of a failure is neither run nor marked skipped — it is simply never reached'); n++;
const s3 = await run(failing, {}, s);
ok(s3.failed?.id === 'boom', 'a failed workflow does not silently resume when run() is called again'); n++;

/* ---- an unknown step kind fails that step, not the whole process ---- */
s = await run([{ id: 'x', kind: 'nonsense' }], {});
ok(s.failed?.id === 'x' && /unknown step kind/.test(s.failed.error), 'an unknown step kind is a named failure'); n++;

if (fails.length) { console.error(`✗ workflow: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ workflow — dependency order, parallel waves, conditions that skip transitively, approvals that pause and resume on either decision, failures that stop cleanly (${n} checks)`);
