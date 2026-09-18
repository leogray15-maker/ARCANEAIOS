/**
 * The Archives, for the Library.
 *
 *   GET /api/modules?q=&subject=&lane=&gate=&limit=&offset=   → { rows, count }
 *   GET /api/modules?id=<module id>                            → the module, with its text
 *   GET /api/modules?facet=subjects                            → { subjects, sources }
 *
 * Read-only. The modules were put here by tools/archives-sync.mjs from the
 * Obsidian vault (or a Notion connector); nothing here writes to them.
 */
import { json, guard, db } from './_lib.js';
import { modules, sources, drafts } from '../packages/database/src/content.js';

export default guard(['GET'], async (req, res) => {
  const q = req.query || {};
  if (q.id) {
    const m = await modules.get(db(), String(q.id));
    if (!m) return json(res, 404, { error: `no module ${q.id}` });
    // What has already been cut from it, so the Library can say so.
    const { rows } = await drafts.list(db(), { module: m.id, limit: 50 });
    return json(res, 200, { module: m, drafts: rows });
  }
  if (q.facet === 'subjects') {
    const [subjects, srcs] = await Promise.all([modules.subjects(db()), sources.list(db())]);
    return json(res, 200, { subjects, sources: srcs });
  }
  const out = await modules.search(db(), { q: String(q.q || ''), subject: String(q.subject || ''), lane: String(q.lane || ''), gate: String(q.gate || ''), kind: q.kind === 'all' ? '' : 'module', sensitive: q.sensitive === 'true' ? true : q.sensitive === 'false' ? false : undefined, limit: q.limit, offset: q.offset });
  return json(res, 200, out);
});
