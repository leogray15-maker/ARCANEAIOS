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

/**
 * An order is a unit of routed work. Rooms with open orders attract crew.
 *
 * `proposed` comes before all of it: an agent may find something and say
 * so, but a proposal is not work and pulls nobody. Only the operator moves
 * it into `open`. That is the approval step the whole loop turns on, so it
 * is vocabulary, not a flag — every surface reads the same word.
 */
export const ORDER_STATES = ['proposed', 'open', 'active', 'blocked', 'review', 'done', 'killed'];
export const ORDER_PRIORITY = ['P0', 'P1', 'P2', 'P3'];
/** The states that are work: what counts as open, pulls crew and lands on the Bridge. */
export const ORDER_OPEN_STATES = ['open', 'active', 'blocked', 'review'];
/** The states an order is finished in. */
export const ORDER_CLOSED_STATES = ['done', 'killed'];
/** Where an order came from. `source_id` names the one thing of that kind. */
export const ORDER_SOURCES = ['floor', 'brain', 'counsel', 'council', 'signal', 'agent'];
/**
 * What may follow `proposed`: approve it, or kill it. Nothing else — a
 * proposal cannot be marked done, because nobody did it.
 */
export const ORDER_FROM_PROPOSED = ['open', 'killed'];

/** A content draft's life, from HERALD's hand to the public. Only a human moves it past `draft`. */
export const DRAFT_STATES = ['draft', 'review', 'approved', 'scheduled', 'posted', 'killed'];

/**
 * Which moves a human may make from each state. Every surface — BEACON,
 * the API, vault:sync — reads this one map, so a button that exists on
 * the floor is a move the server accepts, and nothing else is.
 */
export const DRAFT_TRANSITIONS = {
  draft:     ['review', 'approved', 'killed'],
  review:    ['approved', 'draft', 'killed'],
  approved:  ['scheduled', 'posted', 'draft', 'killed'],
  scheduled: ['posted', 'approved', 'killed'],
  posted:    ['approved'],
  killed:    ['draft'],
};

/** How BEACON groups the states into its views. Vocabulary stays the six states above; these are the tabs. */
export const DRAFT_VIEWS = [
  { id: 'drafts',    name: 'Drafts',    states: ['draft', 'review'],  note: 'Waiting for a decision' },
  { id: 'approved',  name: 'Approved',  states: ['approved'],         note: 'Cleared to go out' },
  { id: 'scheduled', name: 'Scheduled', states: ['scheduled'],        note: 'Has a date' },
  { id: 'published', name: 'Published', states: ['posted'],           note: 'Out in public' },
  { id: 'rejected',  name: 'Rejected',  states: ['killed'],           note: 'Not going out; kept for the record' },
];

/** Who performs the action an order resolves to. */
export const ACTORS = ['human', 'agent'];

/** What every Trace entry must carry. */
export const TRACE_FIELDS = ['ts', 'agent', 'skill', 'run', 'action', 'inputs', 'outputs', 'result', 'notes'];
