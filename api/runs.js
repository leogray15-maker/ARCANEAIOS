/**
 * Agent runs and the record, for THE CONTROL ROOM and THE RECORDS.
 *
 *   GET /api/runs?limit=&agent=          → { runs }
 *   GET /api/runs?events=1&limit=&kind=  → { events }
 *   GET /api/runs?schema=1               → { tables } — which migrations are applied
 */
import { json, guard, db } from './_lib.js';
import { runs, events } from '../packages/database/src/content.js';
import { checkSchema } from '../packages/database/src/index.js';

export default guard(['GET'], async (req, res) => {
  const q = req.query || {};
  if (q.schema) return json(res, 200, { tables: await checkSchema(db()) });
  if (q.events) return json(res, 200, { events: await events.list(db(), { limit: q.limit, kind: String(q.kind || '') }) });
  return json(res, 200, { runs: await runs.list(db(), { limit: q.limit, agent: String(q.agent || '') }) });
});
