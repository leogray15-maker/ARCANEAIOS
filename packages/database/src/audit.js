/**
 * The hash chain over `system_events` — the record's own history made
 * checkable, not merely append-only by convention (there is still no
 * update or delete route for the table; this is what lets anyone confirm
 * that held rather than take it on trust).
 *
 * `row_hash = sha256(prev_hash + at + kind + subject_type + subject_id + summary)`.
 * `events.add()` (packages/database/src/content.js) computes it at write
 * time from the previous row it just read — one process, one row at a
 * time, in order, so there is no read-then-write race on the chain
 * itself. Rows written before this pass carry a null hash: the chain's
 * genesis boundary is the first null, not a break, because nothing
 * chained them at the time.
 */
import { createHash } from 'node:crypto';

export function nextHash(prevHash, row) {
  const h = createHash('sha256');
  h.update(String(prevHash || ''));
  h.update('|'); h.update(String(row.at || ''));
  h.update('|'); h.update(String(row.kind || ''));
  h.update('|'); h.update(String(row.subject_type || ''));
  h.update('|'); h.update(String(row.subject_id || ''));
  h.update('|'); h.update(String(row.summary || ''));
  return h.digest('hex');
}

/**
 * Walk `rows` oldest-first and confirm every hash follows from the one
 * before it. A `null` `row_hash` is only valid while it is still at the
 * front of the chain (nothing hashed came before it); once a hashed row
 * has appeared, every row after it must chain, or the record has been
 * tampered with or written out of order.
 *
 * Returns `{ ok, checked, brokenAt }` — `brokenAt` is the row's `id`, or
 * null when the chain holds (including the case where nothing is chained
 * yet at all).
 */
export function verifyAuditChain(rows = []) {
  const ordered = [...rows].sort((a, b) => Number(a.id) - Number(b.id));
  let prev = null, checked = 0, seenHashed = false;
  for (const row of ordered) {
    if (row.row_hash === null || row.row_hash === undefined) {
      if (seenHashed) return { ok: false, checked, brokenAt: row.id };
      continue;   // still in the unhashed genesis era
    }
    seenHashed = true;
    const expect = nextHash(prev, row);
    if (row.row_hash !== expect) return { ok: false, checked, brokenAt: row.id };
    if (row.prev_hash !== undefined && row.prev_hash !== null && row.prev_hash !== prev) return { ok: false, checked, brokenAt: row.id };
    prev = row.row_hash;
    checked++;
  }
  return { ok: true, checked, brokenAt: null };
}
