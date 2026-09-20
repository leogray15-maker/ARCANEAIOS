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

/* ============================================================
   THE OPERATING SYSTEM — goals, projects, reviews, bottlenecks
   ============================================================ */

/**
 * The goal hierarchy, longest first. Every goal sits at one horizon and
 * may name a parent one horizon up (a quarter's objective serves a year's
 * goal). `days` is the span a horizon covers, for time-remaining arithmetic
 * when a goal has no explicit end.
 */
export const GOAL_HORIZONS = [
  { id: 'decade',  name: '10 YEAR',   note: 'Long-term direction', days: 3650 },
  { id: 'three',   name: '3 YEAR',    note: 'Major outcomes',      days: 1095 },
  { id: 'year',    name: '1 YEAR',    note: 'Annual outcomes',     days: 365 },
  { id: 'quarter', name: 'QUARTER',   note: '90-day objectives',   days: 91 },
  { id: 'month',   name: 'MONTH',     note: 'Monthly targets',     days: 30 },
  { id: 'week',    name: 'WEEK',      note: 'Weekly targets',      days: 7 },
  { id: 'day',     name: 'DAY',       note: 'What must happen today', days: 1 },
];
export const HORIZON_IDS = GOAL_HORIZONS.map((h) => h.id);
export const HORIZON_BY_ID = Object.fromEntries(GOAL_HORIZONS.map((h) => [h.id, h]));
export const GOAL_STATES = ['active', 'done', 'dropped', 'paused'];
export const GOAL_CATEGORIES = ['money', 'work', 'venture', 'life', 'trading', 'knowledge'];

/** A project's life. `blocked` and `done` are also what its health says; the status is what Leo says. */
export const PROJECT_STATES = ['idea', 'ready', 'active', 'blocked', 'done', 'dropped'];
/** Health is computed from the project's orders, never typed. */
export const PROJECT_HEALTH = ['on_track', 'at_risk', 'blocked', 'complete'];

/**
 * The spec's task vocabulary, mapped onto the order states the whole floor
 * already speaks. One vocabulary in the tables; this is the translation
 * a task view shows beside it.
 */
export const TASK_STATE_NAMES = { proposed: 'BACKLOG', open: 'READY', active: 'IN PROGRESS', review: 'WAITING', blocked: 'BLOCKED', done: 'DONE', killed: 'CANCELLED' };
export const RECURRENCES = ['', 'day', 'week', 'month'];

/**
 * The review cycles. Each asks its own questions; the facts beside them are
 * computed from the state for the period, so the review is written over
 * what actually happened rather than from memory.
 */
export const REVIEW_KINDS = [
  { id: 'day', name: 'DAILY', questions: [
    ['completed', 'What was completed?'], ['missed', 'What was not?'], ['why', 'Why?'], ['changed', 'What changed?'], ['tomorrow', 'What matters tomorrow?'], ['escalate', 'What needs escalation?'], ['lessons', 'Lessons'],
  ] },
  { id: 'week', name: 'WEEKLY', questions: [
    ['goals', 'Goals — what moved, what did not'], ['money', 'Money'], ['ventures', 'Ventures'], ['projects', 'Projects'], ['habits', 'Habits'], ['agents', 'Agents'], ['bottlenecks', 'Bottlenecks'], ['decisions', 'Decisions'], ['lessons', 'Lessons'],
  ] },
  { id: 'month', name: 'MONTHLY', questions: [
    ['pnl', 'P&L'], ['cash', 'Cash'], ['targets', 'Target performance'], ['ventures', 'Venture performance'], ['capital', 'Capital allocation'], ['strategy', 'Strategic changes'], ['lessons', 'Lessons'],
  ] },
  { id: 'quarter', name: 'QUARTERLY', questions: [
    ['objectives', 'Objectives'], ['outcomes', 'Outcomes'], ['strategy', 'Strategy'], ['portfolio', 'Venture portfolio'], ['capital', 'Capital allocation'], ['decisions', 'Major decisions'], ['next', 'Next quarter'],
  ] },
];
export const REVIEW_BY_ID = Object.fromEntries(REVIEW_KINDS.map((r) => [r.id, r]));

/** Where a constraint can bind. */
export const BOTTLENECK_AREAS = ['cash', 'time', 'sales', 'production', 'supply', 'people', 'technology', 'marketing', 'decision latency', 'attention', 'agent capacity'];
export const BOTTLENECK_STATES = ['open', 'easing', 'cleared'];

/**
 * An agent's status, derived — never typed — from its runs and its orders:
 * a running run is WORKING; a failed last run is ERROR; a proposed order
 * is NEEDS APPROVAL; a blocked or review order in its hands is WAITING;
 * an agent with no endpoint is OFFLINE; otherwise IDLE.
 */
export const AGENT_STATUSES = ['idle', 'working', 'waiting', 'blocked', 'needs_approval', 'error', 'offline'];

/**
 * The three modes every sensitive capability declares. Read against the
 * grades: deny/read/analyse are OBSERVE, draft/recommend are PROPOSE,
 * approval is EXECUTE (after the operator says yes). `allow` would be
 * unattended execution and nobody holds it.
 */
export const MODE_OF_GRADE = { deny: 'observe', read: 'observe', analyse: 'observe', draft: 'propose', recommend: 'propose', approval: 'execute', allow: 'execute' };
