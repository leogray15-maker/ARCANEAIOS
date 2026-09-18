/**
 * The Content Machine, checked headlessly: the operator gate refuses what
 * it should, the engine lands linted drafts with their provenance, the
 * status machine follows the config, an edit that trips the gate is
 * refused and a clean one becomes a revision, and a regenerated draft
 * points at its parent. Runs on the in-memory database with the mock
 * writer, so it needs no key, no network and no credits.
 */
import { memoryDb } from '../packages/database/src/memory.js';
import { generate, lintEdit } from '../packages/content-engine/src/herald.js';
import { drafts, runs, events } from '../packages/database/src/content.js';
import { operator } from '../api/_auth.js';
import { DRAFT_TRANSITIONS } from '../packages/config/src/loop.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
const expectThrow = async (fn, re, m) => { try { await fn(); fails.push(`${m} (did not throw)`); } catch (e) { if (!re.test(e.message)) fails.push(`${m}: ${e.message}`); } };

/* ---- the gate ---- */
const env = { ARCANE_OPERATOR_KEY: 'a-key-long-enough-to-count' };
const req = (auth, code = '') => ({ headers: auth ? { authorization: `Bearer ${auth}` } : {}, query: { code }, body: {} });
ok(operator(req(''), {}).status === 503, 'no server key → 503 (fails closed)');
ok(operator(req(''), env).status === 401, 'no client key → 401');
ok(operator(req('wrong'), env).status === 403, 'wrong key → 403');
ok(operator(req('a-key-long-enough-to-count', 'sync-abcdefghijklmnopqrstuvwxyz'), env).ok === true, 'right key → ok');
ok(operator(req('a-key-long-enough-to-count', 'sync-abcdefghijklmnopqrstuvwxyz'), env).device === 'sync-abcdefghijklmnopqrstuvwxyz', 'device recorded from a well-formed code');
ok(operator(req('a-key-long-enough-to-count', 'nonsense'), env).device === '', 'a malformed code is not a device');

/* ---- a module with enough text for five cuts ---- */
const sentence = (i) => `Line ${i} says one plain thing about the work, and then it stops before it starts to explain itself to you.`;
const body = Array.from({ length: 80 }, (_, i) => sentence(i + 1)).join(' ');
const module = { id: 'mindset-mastery--a-test-module--abc123', title: 'A Test Module', subject: 'Mindset Mastery', lane: 'mindset', kind: 'module', words: body.split(' ').length, gate: 'allowed', notion_id: 'abc123', source_url: 'https://www.notion.so/abc123', source_path: 'A Test Module abc123.md', body };
const db = memoryDb({ archive_modules: [module] });

/* ---- generate ---- */
const r1 = await generate({ db, module, mock: true, device: 'sync-abcdefghijklmnopqrstuvwxyz', note: 'test' });
ok(r1.status === 'ok', `mock run ok (${r1.error || ''})`);
ok(r1.drafts.length === 5, `five drafts landed (${r1.drafts.length})`);
ok(new Set(r1.drafts.map((d) => d.format)).size === 5, 'one per format');
ok(r1.drafts.every((d) => d.status === 'draft'), 'every draft lands as draft');
ok(r1.drafts.every((d) => d.module_id === module.id && d.source_module === module.title && d.source_subject === module.subject && d.source_url && d.source_note === '[[A Test Module abc123]]'), 'provenance on every draft');
ok(r1.drafts.every((d) => /^HER-\d{8}-\d{3}$/.test(d.id)) && /^HER-R-\d{8}-\d{3}$/.test(r1.run), 'ids in the HERALD shape');
ok(r1.drafts.every((d) => d.model === 'mock' && /^MOCK/.test(d.title)), 'mock drafts say so');
const run1 = (await runs.list(db))[0];
ok(run1?.status === 'ok' && run1.device === 'sync-abcdefghijklmnopqrstuvwxyz' && run1.output.drafts.length === 5, 'run recorded with device and output');
ok((await drafts.get(db, r1.drafts[0].id)).revisions.length === 1, 'generated revision kept');

/* ---- the gate on the body ---- */
// The mock cuts the short from the module's first sentences, so a dose on line one lands in the short and nowhere else:
// the gate refuses that one draft (after one repair) and the other four still land, with the refusal on the run.
const sick = { ...module, id: 'x--sick--1', body: `Take 250mg every morning and it heals your gut. ${body}` };
const r2 = await generate({ db, module: sick, mock: true });
ok(r2.status === 'ok' && r2.drafts.length === 4 && r2.refused.length === 1 && r2.refused[0].format === 'short' && r2.refused[0].errors.some((e) => /dose-unit/.test(e)), `the gate refuses the draft that names a dose and lands the rest (${r2.status}, ${r2.drafts.length} landed, refused ${JSON.stringify(r2.refused)})`);
ok(r2.repaired === true && (await runs.list(db))[0].output.refused.length === 1, 'the repair was attempted once and the refusal is on the run');
const dead = { ...module, id: 'x--dead--2', body: 'Take 250mg every morning and it heals your gut. Then take 500mg. Then inject it.' };
const r2b = await generate({ db, module: dead, mock: true });
ok(r2b.status === 'refused' && r2b.drafts.length === 0 && /gate refused every draft/.test(r2b.error), 'a module that is nothing but claims lands nothing');
ok((await runs.list(db))[0].status === 'refused', 'a refused run is recorded as refused');

/* ---- the status machine ---- */
const id = r1.drafts[0].id;
await expectThrow(() => drafts.setStatus(db, id, 'posted'), /cannot go to posted/, 'draft → posted is not a move');
await expectThrow(() => drafts.setStatus(db, id, 'nonsense'), /not a draft state/, 'unknown state refused');
const a = await drafts.setStatus(db, id, 'approved', { note: 'good' });
ok(a.status === 'approved' && a.approved_at && a.revision === 2, 'approve stamps approved_at and is a revision');
const k = await drafts.setStatus(db, id, 'killed');
ok(k.status === 'killed' && k.rejected_at, 'reject stamps rejected_at');
const back = await drafts.setStatus(db, id, 'draft');
ok(back.status === 'draft' && back.approved_at === null && back.rejected_at === null, 'revive clears the stamps');
for (const [from, tos] of Object.entries(DRAFT_TRANSITIONS)) for (const to of tos) ok(to !== from, `${from} → ${to} is a real move`);

/* ---- edits ---- */
const med = r1.drafts.find((d) => d.format === 'medium');
const bad = lintEdit(med, `Take 250mg every morning.\n\n${med.body}`);
ok(!bad.ok && bad.errors.some((e) => /dose-unit/.test(e)), 'an edited body that names a dose is refused');
const clean = `A new first line that becomes the hook.\n\n${med.body}`;
const good = lintEdit(med, clean);
ok(good.ok && good.data.hook === 'A new first line that becomes the hook.', 'a clean edit passes and the hook follows the first line');
const e1 = await drafts.edit(db, med.id, { body: clean, hook: good.data.hook, title: 'Edited' }, { wordCount: good.words });
ok(e1.revision === 2 && e1.title === 'Edited' && e1.hook === good.data.hook, 'edit bumps the revision and keeps the title');
const full = await drafts.get(db, med.id);
ok(full.revisions.length === 2 && full.revisions[0].kind === 'edit' && full.revisions[1].kind === 'generated' && full.revisions[1].body === med.body, 'both texts are in the history');

/* ---- regenerate ---- */
const r3 = await generate({ db, module, mock: true, formats: ['short'], parent: r1.drafts[0] });
ok(r3.status === 'ok' && r3.drafts.length === 1 && r3.drafts[0].parent_id === r1.drafts[0].id && r3.drafts[0].format === 'short', 'a regenerated short points at its parent');

/* ---- listing ---- */
const { rows, count } = await drafts.list(db, { statuses: ['draft', 'review'] });
ok(count === 10 && rows.length === 10, `ten drafts waiting: five, four, one (${count})`);
const counts = await drafts.counts(db);
ok(counts.draft === 10 && counts.killed === 0, 'counts by status');
const ev = await events.list(db);
ok(ev.some((e) => e.kind === 'draft.status') && ev.some((e) => e.kind === 'draft.edited') && ev.some((e) => e.kind === 'run.refused'), 'the record has status, edit and refusal events');

if (fails.length) { console.error(`✗ content machine — ${fails.length} failed:\n  ${fails.join('\n  ')}`); process.exit(1); }
console.log(`✓ content machine — gate, engine, status machine, edits, regenerate and the record behave (${6 + 9 + 4 + 7 + 5 + 1 + 3} checks)`);
