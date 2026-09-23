// @ts-check
/**
 * The AI layer's tables, as verbs: agents (switches and the run lock),
 * outputs (what agents produce), model_usage (what every call cost).
 *
 * Same client as the rest of the database — `db.get/post/patch` over
 * PostgREST, or the in-memory twin in tests — so these work against both.
 */
import { nextId, events } from './content.js';

/**
 * @typedef {Record<string, unknown>} Row
 * @typedef {{
 *   kind: string,
 *   get: (table: string, params?: Record<string, string | number | undefined> | string, opts?: { single?: boolean, count?: boolean }) => Promise<unknown>,
 *   post: (table: string, body: unknown, opts?: { upsert?: string, returning?: boolean }) => Promise<unknown>,
 *   patch: (table: string, params: Record<string, string>, body: unknown, opts?: { returning?: boolean }) => Promise<unknown>,
 *   delete: (table: string, params: Record<string, string>) => Promise<unknown>,
 * }} Db
 *
 * @typedef {{ id: string, enabled: boolean, schedule: string, config: Row, lock_run_id: string | null, lock_until: string | null, last_run_at: string | null, last_status: string }} AgentRow
 * @typedef {'summary' | 'draft' | 'verdict' | 'trend' | 'note'} OutputType
 * @typedef {'pending' | 'approved' | 'rejected'} OutputStatus
 * @typedef {{ id: string, run_id: string, agent: string, type: OutputType, room: string, title: string, content: string, data: Row, source_ref: string, source_hash: string, status: OutputStatus, model: string, created_at: string, updated_at?: string, reviewed_at?: string | null }} OutputRow
 */

export const OUTPUT_TYPES = /** @type {const} */ (['summary', 'draft', 'verdict', 'trend', 'note']);
export const OUTPUT_STATUSES = /** @type {const} */ (['pending', 'approved', 'rejected']);

/** The first day of the month, UTC, as an ISO string: the budget's window. */
export const monthStart = (/** @type {Date} */ now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

export const agentsTable = {
  /** @param {Db} db @returns {Promise<AgentRow[]>} */
  async list(db) { return /** @type {AgentRow[]} */ (await db.get('agents', { select: '*', order: 'id.asc' })); },

  /** @param {Db} db @param {string} id @returns {Promise<AgentRow | null>} */
  async get(db, id) { return /** @type {AgentRow | null} */ (await db.get('agents', { select: '*', id: `eq.${id}` }, { single: true })); },

  /**
   * Make sure a row exists for each defined agent, without touching what the
   * operator has set. New rows start disabled with the definition's default
   * schedule. Returns the rows.
   * @param {Db} db @param {Array<{ id: string, schedule: string, config: Row }>} defs @returns {Promise<AgentRow[]>}
   */
  async ensure(db, defs) {
    const have = new Map((await this.list(db)).map((r) => [r.id, r]));
    const missing = defs.filter((d) => !have.has(d.id));
    if (missing.length) {
      const made = /** @type {AgentRow[]} */ (await db.post('agents', missing.map((d) => ({ id: d.id, enabled: false, schedule: d.schedule, config: d.config, last_status: '' }))));
      for (const r of made) have.set(r.id, r);
    }
    return defs.map((d) => /** @type {AgentRow} */ (have.get(d.id)));
  },

  /** @param {Db} db @param {string} id @param {{ enabled?: boolean, schedule?: string }} patch @param {string} actor */
  async set(db, id, patch, actor = 'leo') {
    /** @type {Row} */
    const body = {};
    if (patch.enabled !== undefined) body.enabled = !!patch.enabled;
    if (patch.schedule !== undefined) body.schedule = String(patch.schedule).trim();
    const [row] = /** @type {AgentRow[]} */ (await db.patch('agents', { id: `eq.${id}` }, body));
    if (row) await events.add(db, { kind: 'agent.config', actor, subject_type: 'agent', subject_id: id, summary: `${id}: ${Object.entries(body).map(([k, v]) => `${k} → ${v === '' ? '(manual)' : v}`).join(', ')}`, data: body });
    return /** @type {AgentRow | null} */ (row || null);
  },

  /**
   * Take the agent's run lock. One conditional PATCH — free, or held past
   * its expiry — so two callers racing for the same agent cannot both win:
   * the second matches no row once the first has written its lock.
   * @param {Db} db @param {string} id @param {string} runId @param {number} ttlMs @param {Date} [now]
   * @returns {Promise<boolean>}
   */
  async lock(db, id, runId, ttlMs, now = new Date()) {
    const until = new Date(now.getTime() + ttlMs).toISOString();
    const rows = /** @type {AgentRow[]} */ (await db.patch('agents', { id: `eq.${id}`, or: `(lock_until.is.null,lock_until.lt.${now.toISOString()})` }, { lock_run_id: runId, lock_until: until }));
    return Array.isArray(rows) && rows.length === 1 && rows[0].lock_run_id === runId;
  },

  /** Release only our own lock, and record how the run ended. @param {Db} db @param {string} id @param {string} runId @param {string} status */
  async unlock(db, id, runId, status) {
    await db.patch('agents', { id: `eq.${id}`, lock_run_id: `eq.${runId}` }, { lock_run_id: null, lock_until: null, last_run_at: new Date().toISOString(), last_status: status }, { returning: false });
  },
};

export const outputs = {
  /**
   * @param {Db} db
   * @param {{ run_id: string, agent: string, type: OutputType, room: string, title?: string, content: string, data?: Row, source_ref?: string, source_hash?: string, model?: string, status?: OutputStatus }} o
   * @returns {Promise<OutputRow>}
   */
  async save(db, o) {
    if (!OUTPUT_TYPES.includes(o.type)) throw new Error(`"${o.type}" is not an output type`);
    const id = await nextId(db, 'outputs', 'OUT');
    const [row] = /** @type {OutputRow[]} */ (await db.post('outputs', { id, run_id: o.run_id, agent: o.agent, type: o.type, room: o.room, title: String(o.title || '').slice(0, 200), content: o.content, data: o.data || {}, source_ref: o.source_ref || '', source_hash: o.source_hash || '', model: o.model || '', status: o.status || 'pending' }));
    return row;
  },

  /** @param {Db} db @param {{ room?: string, agent?: string, type?: string, status?: string, limit?: number }} [q] @returns {Promise<OutputRow[]>} */
  async list(db, q = {}) {
    /** @type {Record<string, string | number>} */
    const params = { select: '*', order: 'created_at.desc,id.desc', limit: Math.min(200, Math.max(1, Number(q.limit) || 50)) };
    if (q.room) params.room = `eq.${q.room}`;
    if (q.agent) params.agent = `eq.${q.agent}`;
    if (q.type) params.type = `eq.${q.type}`;
    if (q.status) params.status = `eq.${q.status}`;
    return /** @type {OutputRow[]} */ (await db.get('outputs', params));
  },

  /** @param {Db} db @param {string} id @returns {Promise<OutputRow | null>} */
  async get(db, id) { return /** @type {OutputRow | null} */ (await db.get('outputs', { select: '*', id: `eq.${id}` }, { single: true })); },

  /** The newest output an agent made from one source, to tell whether the source has changed since. @param {Db} db @param {string} agent @param {string} sourceRef @returns {Promise<OutputRow | null>} */
  async latestFor(db, agent, sourceRef) {
    const [row] = /** @type {OutputRow[]} */ (await db.get('outputs', { select: '*', agent: `eq.${agent}`, source_ref: `eq.${sourceRef}`, order: 'created_at.desc,id.desc', limit: 1 }));
    return row || null;
  },

  /** Only the operator moves an output out of pending. @param {Db} db @param {string} id @param {OutputStatus} status @param {{ actor?: string, content?: string }} [o] */
  async review(db, id, status, { actor = 'leo', content } = {}) {
    if (!OUTPUT_STATUSES.includes(status)) throw new Error(`"${status}" is not an output status`);
    /** @type {Row} */
    const body = { status, reviewed_at: status === 'pending' ? null : new Date().toISOString() };
    if (content !== undefined) body.content = String(content);
    const [row] = /** @type {OutputRow[]} */ (await db.patch('outputs', { id: `eq.${id}` }, body));
    if (row) await events.add(db, { kind: 'output.status', actor, subject_type: 'output', subject_id: id, summary: `${id} (${row.type}): → ${status}${content !== undefined ? ' (edited)' : ''}`, data: { status } });
    return /** @type {OutputRow | null} */ (row || null);
  },
};

export const usage = {
  /** @param {Db} db @param {Row} rec */
  async record(db, rec) { await db.post('model_usage', rec, { returning: false }); },

  /** Paid spend this calendar month (UTC), in pounds. What the router checks before every paid call. @param {Db} db @param {Date} [now] */
  async monthSpendGbp(db, now = new Date()) {
    const rows = /** @type {Array<{ cost_gbp: number | string }>} */ (await db.get('model_usage', { select: 'cost_gbp', free: 'eq.false', at: `gte.${monthStart(now)}`, limit: 100000 }));
    return rows.reduce((n, r) => n + (Number(r.cost_gbp) || 0), 0);
  },

  /** This month by model and by agent, for THE AGENT GARAGE and /api/health. @param {Db} db @param {Date} [now] */
  async summary(db, now = new Date()) {
    const rows = /** @type {Array<{ model: string, agent: string, free: boolean, ok: boolean, cost_gbp: number | string, tokens_in: number, tokens_out: number }>} */ (await db.get('model_usage', { select: 'model,agent,free,ok,cost_gbp,tokens_in,tokens_out', at: `gte.${monthStart(now)}`, limit: 100000 }));
    /** @type {Record<string, { calls: number, failed: number, gbp: number, tokens: number }>} */
    const byModel = {};
    /** @type {Record<string, { calls: number, gbp: number }>} */
    const byAgent = {};
    let gbp = 0, calls = 0, failed = 0;
    for (const r of rows) {
      const c = Number(r.cost_gbp) || 0; gbp += c; calls++; if (!r.ok) failed++;
      const m = byModel[r.model] || (byModel[r.model] = { calls: 0, failed: 0, gbp: 0, tokens: 0 });
      m.calls++; if (!r.ok) m.failed++; m.gbp += c; m.tokens += (r.tokens_in || 0) + (r.tokens_out || 0);
      const a = byAgent[r.agent || '(none)'] || (byAgent[r.agent || '(none)'] = { calls: 0, gbp: 0 });
      a.calls++; a.gbp += c;
    }
    return { month: monthStart(now).slice(0, 7), gbp, calls, failed, byModel, byAgent };
  },
};
