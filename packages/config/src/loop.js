/**
 * The core loop, as vocabulary.
 *
 *   shared memory → four-block brief → Counsel / Council → order → action → trace
 *
 * Every layer (brain, facility, skills) speaks these words, so a status in
 * a draft's frontmatter means the same thing on the floor and in the vault.
 */

/**
 * The four-block brief. ARCANE writes it from shared memory before any
 * deliberation; every agent reads it before acting. Four blocks, always
 * in this order, so a reader can find the same thing in the same place:
 * VENTURES, MONEY, GOALS, ROOMS. Signals and doctrine live beside it in
 * 03-Memory, not inside it.
 */
export const BRIEF_BLOCKS = [
  { id: 'ventures', name: 'VENTURES', note: 'Each venture in one line: what moved, what is stuck, the number that matters. No opinion.' },
  { id: 'money',    name: 'MONEY',    note: 'Cash, month revenue by venture, fixed costs, the split, runway. TALLY\'s block.' },
  { id: 'goals',    name: 'GOALS',    note: 'Every goal with its progress and whether it moved since the last brief.' },
  { id: 'rooms',    name: 'ROOMS',    note: 'Open orders by room, who holds them, what is blocked, where the crew are pulled.' },
];

/**
 * Counsel is a conversation: the operator speaks to ARCANE, ARCANE answers
 * from the brief and may pull one specialist in. Council is a deliberation:
 * a real decision goes to the nine seated agents, each answers from its
 * domain, and ARCANE returns one verdict with the conditions attached.
 */
export const DELIBERATION = [
  { id: 'counsel', name: 'Counsel', note: 'Operator ↔ Commander, optionally one specialist. Fast. Produces an answer or an order.' },
  { id: 'council', name: 'Council', note: 'Nine seats, one structured session, one verdict. Produces a Decision record.' },
];

export const VERDICTS = ['BUILD', 'DELAY', 'WATCH', 'KILL'];

/** An order is a unit of routed work. Rooms with open orders attract crew. */
export const ORDER_STATES = ['open', 'active', 'blocked', 'review', 'done', 'killed'];
export const ORDER_PRIORITY = ['P0', 'P1', 'P2', 'P3'];

/** A content draft's life, from HERALD's hand to the public. Only a human moves it past `draft`. */
export const DRAFT_STATES = ['draft', 'review', 'approved', 'scheduled', 'posted', 'killed'];

/** Who performs the action an order resolves to. */
export const ACTORS = ['human', 'agent'];

/** What every Trace entry must carry. */
export const TRACE_FIELDS = ['ts', 'agent', 'skill', 'run', 'action', 'inputs', 'outputs', 'result', 'notes'];
