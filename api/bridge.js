/**
 * The Bridge, in one call.
 *
 *   GET /api/bridge → what matters today, what is waiting, what is active, the ventures, the goals, counsel
 *
 * Assembled by packages/database/src/bridge.js from the same tables the
 * rooms write. Nothing is stored here; refresh and it is current.
 */
import { json, guard, db } from './_lib.js';
import { aggregate } from '../packages/database/src/bridge.js';

export default guard(['GET'], async (req, res) => json(res, 200, await aggregate(db())));
