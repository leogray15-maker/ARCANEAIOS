/**
 * The drafts, for BEACON.
 *
 *   GET   /api/drafts?status=&statuses=a,b&module=&q=&limit=&offset=  → { rows, count, counts }
 *   GET   /api/drafts?id=HER-…                                        → the draft with its revisions
 *   PATCH /api/drafts { code, id, status?, note?, scheduled_for?, published_url? }   → move it
 *   PATCH /api/drafts { code, id, title?, body?, platform?, note? }                  → edit it (a revision)
 *
 * Every move is one the config allows (DRAFT_TRANSITIONS); every edit is
 * kept as a revision; every change is a system event. An edited body is
 * linted again: a HARD hit is refused with the reason, warnings are
 * recorded on the draft. Only a human calls this — HERALD never does.
 */
import { json, guard, db } from './_lib.js';
import { drafts } from '../packages/database/src/content.js';
import { lintEdit, countWords, PLATFORMS } from '../packages/content-engine/src/herald.js';
import { DRAFT_STATES } from '../packages/config/src/loop.js';

export default guard(['GET', 'PATCH'], async (req, res) => {
  if (req.method === 'GET') {
    const q = req.query || {};
    if (q.id) {
      const d = await drafts.get(db(), String(q.id));
      return d ? json(res, 200, { draft: d }) : json(res, 404, { error: `no draft ${q.id}` });
    }
    const statuses = String(q.statuses || '').split(',').map((s) => s.trim()).filter((s) => DRAFT_STATES.includes(s));
    const [list, counts] = await Promise.all([
      drafts.list(db(), { status: DRAFT_STATES.includes(q.status) ? q.status : '', statuses, module: String(q.module || ''), q: String(q.q || ''), limit: q.limit, offset: q.offset }),
      drafts.counts(db()),
    ]);
    return json(res, 200, { ...list, counts });
  }

  const b = req.body || {};
  const id = String(b.id || '').trim();
  if (!id) return json(res, 400, { error: 'id is required' });
  const note = String(b.note || '').slice(0, 300);

  if (b.status !== undefined) {
    const status = String(b.status);
    if (!DRAFT_STATES.includes(status)) return json(res, 400, { error: `status must be one of ${DRAFT_STATES.join(', ')}` });
    const d = await drafts.setStatus(db(), id, status, { note, scheduledFor: b.scheduled_for ? new Date(b.scheduled_for).toISOString() : undefined, publishedUrl: b.published_url !== undefined ? String(b.published_url).slice(0, 500) : undefined });
    return json(res, 200, { draft: d });
  }

  const patch = {};
  if (b.title !== undefined) patch.title = String(b.title).trim();
  if (b.platform !== undefined) { if (!PLATFORMS.includes(b.platform)) return json(res, 400, { error: `platform must be one of ${PLATFORMS.join(', ')}` }); patch.platform = b.platform; }
  let opts = { note };
  if (b.body !== undefined) {
    const body = String(b.body).replace(/\r\n/g, '\n').trim();
    if (!body) return json(res, 400, { error: 'body cannot be empty' });
    const cur = await db().get('content_drafts', { select: '*', id: `eq.${id}` }, { single: true });
    if (!cur) return json(res, 404, { error: `no draft ${id}` });
    const lint = lintEdit({ ...cur, ...patch }, body);
    if (!lint.ok) return json(res, 422, { error: `the gate refuses this edit: ${lint.errors.join('; ')}`, errors: lint.errors, warnings: lint.warnings });
    patch.body = body; patch.hook = lint.data.hook;
    opts = { ...opts, wordCount: countWords(body), complianceNotes: lint.warnings.join('; ') };
  }
  if (!Object.keys(patch).length) return json(res, 400, { error: 'nothing to change: send status, or title/body/platform' });
  const d = await drafts.edit(db(), id, patch, opts);
  return json(res, 200, { draft: d });
});
