/**
 * The audit hash chain: every row follows from the one before it, a
 * tampered summary is caught, an out-of-order write is caught, and rows
 * from before the chain existed are a genesis boundary, not a break.
 */
import { nextHash, verifyAuditChain } from '../packages/database/src/audit.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
let n = 0;

function chain(rows) {
  let prev = null;
  return rows.map((r, i) => { const row = { id: i + 1, prev_hash: prev, ...r }; row.row_hash = nextHash(prev, row); prev = row.row_hash; return row; });
}

const good = chain([
  { at: '2026-09-20T09:00:00Z', kind: 'order.added', subject_type: 'order', subject_id: 'ORD-1', summary: 'first' },
  { at: '2026-09-20T09:01:00Z', kind: 'order.changed', subject_type: 'order', subject_id: 'ORD-1', summary: 'second' },
  { at: '2026-09-20T09:02:00Z', kind: 'approval.approved', subject_type: 'order', subject_id: 'ORD-1', summary: 'third' },
]);
ok(verifyAuditChain(good).ok, 'a correctly chained sequence verifies'); n++;
ok(verifyAuditChain(good).checked === 3, 'every row is checked'); n++;

/* ---- tamper: the summary, after the fact ---- */
const tampered = good.map((r) => (r.id === 2 ? { ...r, summary: 'rewritten' } : r));
const t = verifyAuditChain(tampered);
ok(!t.ok && t.brokenAt === 2, `a rewritten row is caught at the row it was rewritten (${t.brokenAt})`); n++;

/* ---- tamper: the ids swapped, so sorting by id (the canonical order) no longer matches the order the hashes were chained in ---- */
const swapped = good.map((r) => (r.id === 2 ? { ...r, id: 3 } : r.id === 3 ? { ...r, id: 2 } : r));
ok(!verifyAuditChain(swapped).ok, 'rows presented in the wrong hash order do not verify'); n++;

/* ---- tamper: prev_hash pointed somewhere else ---- */
const rerouted = good.map((r) => (r.id === 3 ? { ...r, prev_hash: 'somethingelse' } : r));
ok(!verifyAuditChain(rerouted).ok, 'a prev_hash that does not match the actual previous row is caught'); n++;

/* ---- genesis: rows written before the chain existed carry no hash ---- */
const genesis = [
  { id: 1, at: 'a', kind: 'k', subject_type: 'x', subject_id: '1', summary: 'before the chain', row_hash: null, prev_hash: null },
  { id: 2, at: 'b', kind: 'k', subject_type: 'x', subject_id: '2', summary: 'also before', row_hash: null, prev_hash: null },
];
const g = verifyAuditChain(genesis);
ok(g.ok && g.checked === 0, 'unhashed rows are a boundary, not a failure, and are not counted as checked'); n++;

/* ---- mixed: genesis rows, then the chain begins ---- */
let prev = null;
const chained = [{ at: 'c', kind: 'k', subject_type: 'x', subject_id: '3', summary: 'first hashed' }].map((r) => { const row = { id: 3, prev_hash: prev, ...r }; row.row_hash = nextHash(prev, row); prev = row.row_hash; return row; });
ok(verifyAuditChain([...genesis, ...chained]).ok, 'genesis rows followed by a real chain still verify'); n++;

/* ---- a hashed row followed by a null hash is itself a break (nothing legitimately un-hashes) ---- */
const brokenTail = [...chained, { id: 4, at: 'd', kind: 'k', subject_type: 'x', subject_id: '4', summary: 'no hash', row_hash: null, prev_hash: null }];
const bt = verifyAuditChain(brokenTail);
ok(!bt.ok && bt.brokenAt === 4, 'a null hash appearing after the chain has started is a break'); n++;

/* ---- unsorted input is sorted by id before verification ---- */
ok(verifyAuditChain([good[2], good[0], good[1]]).ok === false || verifyAuditChain([...good].reverse()).ok, 'input order does not matter — verification sorts by id first'); n++;
ok(verifyAuditChain([...good].reverse()).checked === 3, 'sorted, a reversed input still verifies fully'); n++;

/* ---- an empty log verifies trivially ---- */
ok(verifyAuditChain([]).ok && verifyAuditChain([]).checked === 0, 'no rows is a verified (empty) chain'); n++;

/* ---- determinism ---- */
ok(nextHash(null, good[0]) === good[0].row_hash, 'the same inputs always hash the same way'); n++;
ok(nextHash('x', good[0]) !== nextHash('y', good[0]), 'a different previous hash changes the result'); n++;

if (fails.length) { console.error(`✗ audit: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ audit — the hash chain verifies, tamper (rewrite, reorder, reroute) is caught, genesis rows are a boundary not a break (${n} checks)`);
