/**
 * Governance — the tool registry's policy, approval tiers, and permission
 * resolution. Pure: nothing here touches the database or the network. The
 * caller (server-side, where the database is reachable) looks up a
 * remembered permission first and hands it in; this module never does IO.
 *
 * See docs/OPENJARVIS_PORT.md for why the hierarchy is short: ARCANE has
 * one agent per room and one ceiling per agent, so a room-level grant has
 * nothing yet to override — the ceiling already is the room's rule. The
 * layer stays in the resolution order in case a second agent ever shares
 * a room; today it is a no-op.
 *
 * Fail closed, always:
 *   - a tool id not in the registry                → deny
 *   - a capability or risk level the registry does not know → deny (malformed policy, refused whole)
 *   - an agent with no capability record            → deny (malformed policy)
 *   - a grade below the tool's floor                → deny (the ceiling)
 *   - an explicit deny on the agent                 → deny, nothing below it is asked
 *   - a high-tier tool                               → never looked up in, or written to, permission memory
 */
import { CAP_IDS, GRADE_RANK } from './permissions.js';
import { MODE_OF_GRADE } from './loop.js';
import { TOOL_BY_ID } from './agents.js';

export const RISK_LEVELS = ['trivial', 'low', 'medium', 'high'];

/**
 * Extra fields every tool in `TOOLS` carries, keyed by tool id.
 *
 *   requiresCap  the capability (from CAPS) a call to this tool draws on
 *   minGrade     the floor an agent's grade on that capability must clear
 *   risk         the tier a call sits at once the ceiling is cleared and
 *                the agent's mode is not pure observation
 *   confirm      whether the UI asks even at a tier that could otherwise
 *                auto-proceed (kept separate from risk: a low-risk but
 *                unfamiliar action can still want a second look)
 *   timeoutMs    the ceiling this pass's callers already use in practice
 *                (api/core/api.js), declared here so a future gate can
 *                enforce it rather than each caller inventing its own
 */
export const TOOL_POLICY = {
  memory:   { requiresCap: 'data',    minGrade: 'read',     risk: 'trivial', confirm: false, timeoutMs: 15_000 },
  notion:   { requiresCap: 'data',    minGrade: 'read',     risk: 'trivial', confirm: false, timeoutMs: 15_000 },
  counsel:  { requiresCap: 'write',   minGrade: 'draft',    risk: 'trivial', confirm: false, timeoutMs: 180_000 },
  archives: { requiresCap: 'data',    minGrade: 'read',     risk: 'trivial', confirm: false, timeoutMs: 15_000 },
  database: { requiresCap: 'data',    minGrade: 'analyse',  risk: 'low',     confirm: false, timeoutMs: 30_000 },
  web:      { requiresCap: 'data',    minGrade: 'analyse',  risk: 'low',     confirm: false, timeoutMs: 300_000 },
  commerce: { requiresCap: 'change',  minGrade: 'approval', risk: 'medium',  confirm: true,  timeoutMs: 30_000 },
  crm:      { requiresCap: 'contact', minGrade: 'approval', risk: 'medium',  confirm: true,  timeoutMs: 30_000 },
  calendar: { requiresCap: 'change',  minGrade: 'approval', risk: 'medium',  confirm: true,  timeoutMs: 30_000 },
  email:    { requiresCap: 'contact', minGrade: 'approval', risk: 'high',    confirm: true,  timeoutMs: 30_000 },
};

/** Every tool in the roster has a policy; nothing is registered without one. `tools/validate-config.mjs` checks this holds. */
export function policyOf(toolId) { return TOOL_POLICY[toolId] || null; }

/**
 * The tier a call to this tool sits at for this agent's grade. Trivial
 * whenever the grade's mode is observe-only — nothing executes, so there
 * is nothing to tier. Otherwise the tool's own declared risk (from its
 * policy, not the roster entry — a tool's name and its policy are two
 * different objects on purpose, so the roster stays a plain list).
 */
export function tierOf(policy, grade) {
  const mode = MODE_OF_GRADE[grade] || 'observe';
  return mode === 'observe' ? 'trivial' : policy.risk;
}

/** A stable fingerprint for permission memory: room:agent:tool:resource, lower-cased so a domain's case never splits a pattern in two. */
export function permissionKey({ room, agent, tool, resource = '' }) {
  return `${room}:${agent}:${tool}:${resource || ''}`.toLowerCase();
}

/**
 * Resolve whether `agent` (a roster entry, with `.caps`) may use `toolId`
 * on `resource` in `room`. `remembered` is the permission_memory row for
 * this exact key if the caller already looked one up, or null/undefined —
 * this function does no IO itself.
 *
 * Returns `{ level: 'deny'|'approval'|'allow', reason, source, tier, key }`.
 * `level: 'approval'` means a human decides now; it is not itself a deny.
 */
export function resolvePermission(agent, toolId, { resource = '', room = '', remembered = null } = {}) {
  const tool = TOOL_BY_ID[toolId];
  if (!tool) return deny(`"${toolId}" is not a registered tool`, 'registry');
  const policy = TOOL_POLICY[toolId];
  if (!policy || !CAP_IDS.includes(policy.requiresCap) || !RISK_LEVELS.includes(policy.risk) || GRADE_RANK[policy.minGrade] === undefined) {
    return deny(`${toolId}'s policy is malformed — the whole resolution is refused rather than partly applied`, 'registry');
  }
  if (!agent || typeof agent.caps !== 'object' || !agent.caps) return deny(`${agent?.id || 'this agent'} has no capability record`, 'registry');
  const grade = agent.caps[policy.requiresCap] ?? 'deny';
  const key = permissionKey({ room: room || agent.room, agent: agent.id, tool: toolId, resource });
  const tier = tierOf(policy, grade);
  if (GRADE_RANK[grade] === undefined || GRADE_RANK[grade] < GRADE_RANK[policy.minGrade]) {
    return { level: 'deny', reason: `${agent.name || agent.id} holds "${grade}" on ${policy.requiresCap} — ${toolId} needs at least "${policy.minGrade}"`, source: 'ceiling', tier, key };
  }
  if ((agent.deny || []).includes(toolId)) return { level: 'deny', reason: `${agent.name || agent.id} is explicitly denied ${toolId}`, source: 'explicit-deny', tier, key };
  if (tier === 'trivial') return { level: 'allow', reason: 'observe mode — nothing executes', source: 'ceiling', tier, key };
  // A remembered decision applies only below the high tier: a high-risk
  // action is asked every time, by design, and can never be short-circuited.
  if (tier !== 'high' && remembered) {
    if (remembered.decision === 'always_deny') return { level: 'deny', reason: `remembered: always deny for ${key}`, source: 'remembered', tier, key };
    if (remembered.decision === 'always_allow') return { level: 'allow', reason: `remembered: always allow for ${key}`, source: 'remembered', tier, key };
  }
  return { level: 'approval', reason: `${tier} tier — the operator decides`, source: 'default', tier, key };
}

function deny(reason, source) { return { level: 'deny', reason, source, tier: null, key: null }; }
