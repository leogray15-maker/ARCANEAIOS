/**
 * Proposals: what an agent wants done, written down for the operator to
 * approve or kill. Shared by the API's agents (api/_agent.js, api/intel.js)
 * and the mission worker, so a proposal looks the same wherever it came from.
 */
import { state } from './state.js';

const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * Write proposals down as `proposed` orders and hand back their ids. Nothing
 * is executed and nothing enters the queue: the operator approves or kills
 * each one. Words already on the board are skipped rather than repeated,
 * or a daily run would propose the same thing every morning.
 */
export async function propose(d, items, { agent, holder, runId, actor = agent }) {
  const existing = await state.list(d, 'orders').catch(() => []);
  const seen = new Set(existing.filter((o) => !['done', 'killed'].includes(o.state)).map((o) => `${o.room}::${String(o.text).trim().toLowerCase()}`));
  const out = [];
  for (const item of items || []) {
    const p = item?.proposal || item;
    if (!p?.room || !p?.text) { out.push(null); continue; }
    const key = `${p.room}::${String(p.text).trim().toLowerCase()}`;
    if (seen.has(key)) { out.push(null); continue; }
    try {
      const row = await state.insert(d, 'orders', {
        room: p.room, text: p.text, priority: typeof p.priority === 'number' ? p.priority : (PRIORITY[p.priority] ?? 2),
        state: 'proposed', actor: 'agent', agent, holder, source: 'agent', source_id: runId,
        note: p.why || [item.headline, item.detail, item.source ? `Source: ${item.source}` : ''].filter(Boolean).join('\n\n'),
      }, { actor });
      seen.add(key);
      out.push(row.id);
    } catch { out.push(null); }   // a refused proposal is not a failed run
  }
  return out;
}
