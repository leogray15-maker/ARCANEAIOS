/**
 * Permission grades.
 *
 * Every agent carries one grade per capability. The grade is the contract:
 * it is what the Control Room renders, what the vault prints, and what the
 * runtime checks before an agent is allowed to do anything.
 *
 * Weakest to strongest:
 *   deny      — cannot touch it at all
 *   read      — may look
 *   analyse   — may look and reason over it
 *   draft     — may produce something for the operator to review
 *   recommend — may put a recommendation to the operator or the Council
 *   approval  — may execute, but only after the operator says yes
 *   allow     — may execute unattended
 *
 * `allow` exists in the vocabulary so the matrix can say, explicitly, that
 * nobody holds it. The validator refuses a config where anyone does.
 */

export const GRADES = ['deny', 'read', 'analyse', 'draft', 'recommend', 'approval', 'allow'];

export const GRADE_RANK = Object.fromEntries(GRADES.map((g, i) => [g, i]));

export const GRADE_TONE = {
  deny: 'breach', read: 'ash', analyse: 'cyan', draft: 'flare',
  recommend: 'arcane', approval: 'flare', allow: 'vital',
};

/** The capabilities every agent is graded against. */
export const CAPS = [
  { id: 'data',    name: 'Read data',      note: 'See the numbers behind its own room' },
  { id: 'analyse', name: 'Analyse',        note: 'Reason over what it can see' },
  { id: 'write',   name: 'Draft',          note: 'Produce copy, plans, documents, recommendations' },
  { id: 'spend',   name: 'Spend money',    note: 'Move or commit funds' },
  { id: 'publish', name: 'Publish',        note: 'Put something in front of the public' },
  { id: 'contact', name: 'Contact people', note: 'Email, message or call anyone outside' },
  { id: 'change',  name: 'Change systems', note: 'Edit live pricing, stock, site, app or the brain\'s system files' },
];

export const CAP_IDS = CAPS.map((c) => c.id);

/**
 * Standing rules. These are not prose — the validator enforces each one
 * against the roster, and the runtime enforces them again before any act.
 */
export const STANDING_RULES = [
  { id: 'no-allow',        text: 'No agent holds `allow` on any capability. Nothing executes unattended.' },
  { id: 'no-spend',        text: 'No agent spends money. `spend` is `deny` for the entire network, commander included. Money moves by the operator\'s hand.' },
  { id: 'notion-readonly', text: 'Notion is read-only for the entire network. The Archives are a source, never a target.' },
  { id: 'no-medical',      text: 'No agent makes a medical, dosing or treatment claim about any compound, protocol or condition — to the operator, a member or the public.' },
  { id: 'drafts-wait',     text: 'Nothing publishes unattended. Every draft waits in 02-Content/Drafts until a human moves its status.' },
  { id: 'trace-everything',text: 'Every run writes a Trace entry into THE RECORDS before it reports success.' },
];

/** True when `agent` holds at least `grade` on capability `cap`. */
export function holds(agent, cap, grade) {
  const have = agent.caps?.[cap] ?? 'deny';
  return GRADE_RANK[have] >= GRADE_RANK[grade];
}

/** Every grade an agent holds, as `[cap, grade]` pairs in CAPS order. */
export function gradesOf(agent) {
  return CAPS.map((c) => [c.id, agent.caps?.[c.id] ?? 'deny']);
}
