/**
 * The Content Machine's tables, as verbs.
 *
 * Every write that changes a draft goes through here so the rules hold in
 * one place: an id is minted the same way HERALD's emit does; a status
 * move must be one the config allows; every edit bumps the revision and
 * keeps the previous text; every change leaves a system event. The API
 * functions and the tools call these; nothing else writes content.
 */
import { DRAFT_STATES, DRAFT_TRANSITIONS } from '../../config/src/loop.js';
import { DatabaseError } from './index.js';
import { nextHash } from './audit.js';

const pad = (n, w = 3) => String(n).padStart(w, '0');
export const compactDay = (d = new Date()) => `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;

/** Next `<prefix>-YYYYMMDD-NNN` given the ids already in `table` for today. Same rule as HERALD's emit, so the vault and the database never collide. */
export async function nextId(db, table, prefix, now = new Date()) {
  const day = compactDay(now);
  const rows = await db.get(table, { select: 'id', id: `like.${prefix}-${day}-*` });
  let max = 0;
  const re = new RegExp(`^${prefix}-${day}-(\\d{3})$`);
  for (const r of rows) { const m = re.exec(r.id); if (m) max = Math.max(max, Number(m[1])); }
  return `${prefix}-${day}-${pad(max + 1)}`;
}

/* ---------- knowledge ---------- */

export const MODULE_COLUMNS = 'id,notion_id,source_id,source_url,title,subject,parent,lane,kind,words,sensitive,flags,gate,excerpt,indexed_at,updated_at';

export const modules = {
  /** Browse and search. `q` uses Postgres full-text search over title, subject and body. */
  async search(db, { q = '', subject = '', lane = '', gate = '', kind = 'module', sensitive, limit = 50, offset = 0 } = {}) {
    const params = { select: MODULE_COLUMNS, order: q ? 'words.desc' : 'subject.asc,words.desc', limit: Math.min(200, Math.max(1, Number(limit) || 50)), offset: Math.max(0, Number(offset) || 0) };
    if (kind) params.kind = `eq.${kind}`;
    if (subject) params.subject = `eq.${subject}`;
    if (lane) params.lane = `eq.${lane}`;
    if (gate === '!never') params.gate = 'neq.never'; else if (gate) params.gate = `eq.${gate}`;
    if (sensitive === true || sensitive === false) params.sensitive = `is.${sensitive}`;
    if (q.trim()) params.search = `wfts.${q.trim()}`;
    return db.get('archive_modules', params, { count: true });
  },
  async get(db, id, { body = true } = {}) {
    // Never `*`: the search tsvector is large and useless to a reader.
    return db.get('archive_modules', { select: body ? `${MODULE_COLUMNS},source_path,body,content_hash` : MODULE_COLUMNS, id: `eq.${id}` }, { single: true });
  },
  async subjects(db) {
    return db.get('archive_subjects', { select: 'subject,lane,gate,modules,words,sensitive', order: 'modules.desc' });
  },
  async upsert(db, rows, { chunk = 200 } = {}) {
    let n = 0;
    for (let i = 0; i < rows.length; i += chunk) { await db.post('archive_modules', rows.slice(i, i + chunk), { upsert: 'id', returning: false }); n += Math.min(chunk, rows.length - i); }
    return n;
  },
  /** id → content_hash for every module, so a sync can skip what has not changed. */
  async hashes(db) {
    const rows = await db.get('archive_modules', { select: 'id,content_hash', limit: 100000 });
    return Object.fromEntries(rows.map((r) => [r.id, r.content_hash]));
  },
};

export const sources = {
  async mark(db, id, patch) { return db.post('knowledge_sources', { id, kind: patch.kind || id, ...patch }, { upsert: 'id' }); },
  async list(db) { return db.get('knowledge_sources', { select: '*', order: 'id.asc' }); },
};

/* ---------- content ---------- */

export const DRAFT_COLUMNS = 'id,run_id,module_id,parent_id,agent,format,platform,status,title,hook,angle,cta,tags,word_count,compliance,compliance_notes,source_subject,source_module,source_ref,source_url,source_note,revision,model,created_at,updated_at,approved_at,rejected_at,scheduled_for,published_at,published_url';

export const drafts = {
  async list(db, { statuses = [], status = '', module = '', q = '', limit = 200, offset = 0 } = {}) {
    const params = { select: DRAFT_COLUMNS, order: 'created_at.desc,id.desc', limit: Math.min(500, Math.max(1, Number(limit) || 200)), offset: Math.max(0, Number(offset) || 0) };
    const set = status ? [status] : statuses;
    if (set.length === 1) params.status = `eq.${set[0]}`; else if (set.length) params.status = `in.(${set.join(',')})`;
    if (module) params.module_id = `eq.${module}`;
    if (q.trim()) { const k = `*${q.trim().replace(/[*%,()]/g, ' ')}*`; params.or = `(title.ilike.${k},hook.ilike.${k},source_module.ilike.${k},source_subject.ilike.${k})`; }
    return db.get('content_drafts', params, { count: true });
  },
  async counts(db) {
    const rows = await db.get('content_drafts', { select: 'status', limit: 100000 });
    const out = Object.fromEntries(DRAFT_STATES.map((s) => [s, 0]));
    for (const r of rows) out[r.status] = (out[r.status] || 0) + 1;
    return out;
  },
  async get(db, id) {
    const d = await db.get('content_drafts', { select: '*', id: `eq.${id}` }, { single: true });
    if (!d) return null;
    const revisions = await db.get('content_revisions', { select: 'id,revision,kind,actor,status_before,status_after,title,platform,note,created_at,body', draft_id: `eq.${id}`, order: 'revision.desc' });
    return { ...d, revisions };
  },
  /** Land new drafts. Each gets revision 1 and a `generated` revision holding its first text. */
  async create(db, rows, { actor = 'HERALD', note = '' } = {}) {
    const landed = await db.post('content_drafts', rows.map((r) => ({ ...r, revision: 1 })));
    await db.post('content_revisions', landed.map((d) => ({ draft_id: d.id, revision: 1, kind: 'generated', actor, title: d.title, body: d.body, platform: d.platform, status_after: d.status, note })), { returning: false });
    await events.add(db, landed.map((d) => ({ kind: 'draft.generated', actor, subject_type: 'draft', subject_id: d.id, summary: `${d.format} for ${d.platform} from "${d.source_module}"`, data: { run_id: d.run_id, module_id: d.module_id, format: d.format } })));
    return landed;
  },
  /** Change text or platform. Keeps the new text as a revision so nothing edited is lost. */
  async edit(db, id, { title, body, platform, hook, cta, tags, note = '' }, { actor = 'leo', wordCount, complianceNotes } = {}) {
    const cur = await db.get('content_drafts', { select: '*', id: `eq.${id}` }, { single: true });
    if (!cur) throw new DatabaseError(`no draft ${id}`, { status: 404 });
    const patch = {};
    if (title !== undefined) patch.title = String(title).slice(0, 120);
    if (body !== undefined) patch.body = String(body);
    if (platform !== undefined) patch.platform = platform;
    if (hook !== undefined) patch.hook = hook;
    if (cta !== undefined) patch.cta = cta;
    if (tags !== undefined) patch.tags = tags;
    if (wordCount !== undefined) patch.word_count = wordCount;
    if (complianceNotes !== undefined) patch.compliance_notes = complianceNotes;
    if (!Object.keys(patch).length) return cur;
    patch.revision = (cur.revision || 1) + 1;
    const [next] = await db.patch('content_drafts', { id: `eq.${id}` }, patch);
    await db.post('content_revisions', { draft_id: id, revision: patch.revision, kind: 'edit', actor, title: next.title, body: next.body, platform: next.platform, status_before: cur.status, status_after: cur.status, note }, { returning: false });
    await events.add(db, { kind: 'draft.edited', actor, subject_type: 'draft', subject_id: id, summary: `edited ${id} (rev ${patch.revision})`, data: { fields: Object.keys(patch) } });
    return next;
  },
  /** Move a draft's status along a transition the config allows. */
  async setStatus(db, id, status, { actor = 'leo', note = '', scheduledFor, publishedUrl } = {}) {
    if (!DRAFT_STATES.includes(status)) throw new DatabaseError(`"${status}" is not a draft state`, { status: 400 });
    const cur = await db.get('content_drafts', { select: '*', id: `eq.${id}` }, { single: true });
    if (!cur) throw new DatabaseError(`no draft ${id}`, { status: 404 });
    if (cur.status === status) return cur;
    if (!(DRAFT_TRANSITIONS[cur.status] || []).includes(status)) throw new DatabaseError(`a ${cur.status} draft cannot go to ${status} (allowed: ${(DRAFT_TRANSITIONS[cur.status] || []).join(', ') || 'nothing'})`, { status: 409 });
    const now = new Date().toISOString();
    // Every change — text or status — is one revision, so the history reads as one line of events per draft.
    const patch = { status, revision: (cur.revision || 1) + 1 };
    if (status === 'approved') patch.approved_at = now;
    if (status === 'killed') patch.rejected_at = now;
    if (status === 'scheduled') patch.scheduled_for = scheduledFor || cur.scheduled_for || null;
    if (status === 'posted') { patch.published_at = now; if (publishedUrl !== undefined) patch.published_url = publishedUrl; }
    if (status === 'draft') { patch.approved_at = null; patch.rejected_at = null; }
    const [next] = await db.patch('content_drafts', { id: `eq.${id}` }, patch);
    await db.post('content_revisions', { draft_id: id, revision: patch.revision, kind: 'status', actor, status_before: cur.status, status_after: status, note, title: cur.title, platform: cur.platform }, { returning: false });
    await events.add(db, { kind: 'draft.status', actor, subject_type: 'draft', subject_id: id, summary: `${id}: ${cur.status} → ${status}${note ? ` — ${note}` : ''}`, data: { from: cur.status, to: status } });
    return next;
  },
};

/* ---------- agents ---------- */

export const runs = {
  async start(db, { id, agent, skill = '', objective = '', model = '', input = {}, sources = [], device = '' }) {
    const now = new Date().toISOString();
    const [row] = await db.post('agent_runs', { id, agent, skill, objective, model, input, sources, device, status: 'running', started_at: now, heartbeat_at: now, current_activity: 'starting' });
    return row;
  },
  async finish(db, id, { status = 'ok', output = {}, usage = {}, error = '' } = {}) {
    const [row] = await db.patch('agent_runs', { id: `eq.${id}` }, { status, output, usage, error, finished_at: new Date().toISOString(), current_activity: '' });
    await events.add(db, { kind: `run.${status}`, actor: row?.agent || '', subject_type: 'run', subject_id: id, summary: `${row?.agent || 'agent'} run ${id}: ${status}${error ? ` — ${error}` : ''}`, data: { output, usage } });
    return row;
  },
  async list(db, { limit = 30, agent = '' } = {}) {
    const params = { select: '*', order: 'started_at.desc', limit: Math.min(200, Number(limit) || 30) };
    if (agent) params.agent = `eq.${agent}`;
    return db.get('agent_runs', params);
  },
  /**
   * A sign of life while a run is in flight. Only the current activity
   * changes on every call — `started_at` never moves, so age is always
   * measured from when the work actually began.
   */
  async heartbeat(db, id, activity = '') {
    const [row] = await db.patch('agent_runs', { id: `eq.${id}`, status: 'eq.running' }, { heartbeat_at: new Date().toISOString(), current_activity: activity }, { returning: true });
    return row || null;
  },
  /**
   * Zombie recovery. A single conditional PATCH — `status=eq.running` in
   * the filter, not read-then-write — so a second caller racing the same
   * reap matches zero rows once the first has already turned it to
   * failed: two processes can never both believe they still own it.
   * Returns the runs it recovered.
   */
  async reap(db, { staleMs = 15 * 60_000, now = new Date() } = {}) {
    const cutoff = new Date(now.getTime() - staleMs).toISOString();
    // Two plain queries rather than one OR-of-AND filter: a run with a
    // heartbeat is stale once it is old; a run from before heartbeats
    // existed (heartbeat_at null) is stale once its start is old. Kept
    // as separate reads so the same filter grammar works against the
    // in-memory twin and real PostgREST without a nested `and()` inside
    // an `or()`, which the twin's parser does not need to grow just for this.
    const withHeartbeat = await db.get('agent_runs', { select: 'id,agent,heartbeat_at,started_at', status: 'eq.running', heartbeat_at: `lt.${cutoff}` });
    const withoutHeartbeat = await db.get('agent_runs', { select: 'id,agent,heartbeat_at,started_at', status: 'eq.running', heartbeat_at: 'is.null', started_at: `lt.${cutoff}` });
    const stale = [...withHeartbeat, ...withoutHeartbeat.filter((r) => !withHeartbeat.some((h) => h.id === r.id))];
    const recovered = [];
    for (const r of stale) {
      const [row] = await db.patch('agent_runs', { id: `eq.${r.id}`, status: 'eq.running' }, { status: 'failed', error: 'stalled — no heartbeat', finished_at: now.toISOString(), current_activity: '' });
      if (row) { recovered.push(row); await events.add(db, { kind: 'agent.stalled', actor: r.agent, subject_type: 'run', subject_id: r.id, summary: `${r.agent} run ${r.id}: no heartbeat since ${r.heartbeat_at || r.started_at} — marked failed`, data: { last_heartbeat: r.heartbeat_at } }); }
    }
    return recovered;
  },
};

/* ---------- records ---------- */

export const events = {
  /**
   * Append one or more rows, each chained to the one before it —
   * `prev_hash`/`row_hash` from `packages/database/src/audit.js`, computed
   * here because this is the one place every write in the system passes
   * through. A batch chains within itself as well as to what came before.
   *
   * This reads the latest hash, then writes: two calls landing in the same
   * instant could both read the same "latest" and fork the chain.
   * `verifyAuditChain()` would show that as a break at whichever row lost
   * the race. At this system's write volume (one operator's actions, a
   * handful of agent runs) that has not happened in practice; a Postgres
   * trigger would close the race properly and is the right fix if it ever
   * does — noted rather than built now, since nothing else in this schema
   * computes anything in SQL beyond `updated_at`.
   */
  async add(db, rows) {
    const at = new Date().toISOString();
    let prev = null, chaining = true;
    try { const [last] = await db.get('system_events', { select: 'row_hash', order: 'id.desc', limit: 1 }); prev = last?.row_hash ?? null; }
    catch { chaining = false; }   // 0012 has not run yet: write the old shape rather than fail every write in the system on it
    const out = [];
    for (const r of (Array.isArray(rows) ? rows : [rows])) {
      const row = { at, ...r };
      if (chaining) { const hash = nextHash(prev, row); row.prev_hash = prev; row.row_hash = hash; prev = hash; }
      out.push(row);
    }
    return db.post('system_events', out, { returning: false });
  },
  async list(db, { limit = 50, kind = '' } = {}) {
    const params = { select: '*', order: 'at.desc', limit: Math.min(500, Number(limit) || 50) };
    if (kind) params.kind = `like.${kind}*`;
    return db.get('system_events', params);
  },
  /** Every row, oldest first, for `verifyAuditChain()`. Bounded: a chain this long is already a lot of history to check in one call. */
  async all(db, { limit = 20000 } = {}) { return db.get('system_events', { select: '*', order: 'id.asc', limit }); },
};
