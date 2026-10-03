/**
 * MISSIONS — work the network does on its own, inside the standing rules.
 *
 * A mission is a small graph of steps run by the worker (tools/worker.mjs)
 * on the operator's machine, against the local model when it is free. A
 * template here is pure data: the steps, what each one does, who does it,
 * what it waits on. The worker snapshots the template onto the mission
 * row when it is queued, so editing a template never changes a mission
 * already in flight.
 *
 * Autonomy has one ceiling and it is the standing rules: a step may run
 * unattended only while its level is at or below AUTONOMY_CEILING (read,
 * analyse, draft). Anything above it — changing a system, publishing,
 * contacting anyone — must sit downstream of an approval step, and spend
 * is never reachable at all. `tools/validate-config.mjs` refuses a
 * template that breaks this; the worker checks it again before every step.
 *
 * A step is done by the template's agent unless it names another
 * (`agent`): CIPHER researches, but ORACLE is the one who reads the
 * Archives. Each step is permitted against its own agent's grades.
 *
 * Step kinds:
 *   action     { action, args }         one of ACTIONS below
 *   think      { prompt, schema }       the agent reasons over what the steps before it returned
 *   condition  { test: { path, lt|gt|eq|truthy } }   false skips everything downstream
 *   approval   { describe }             the mission pauses as a proposed order until Leo answers
 *
 * Arguments and prompts refer to earlier results with `$input.x` and
 * `$<step>.x` — resolved by the worker, never evaluated as code.
 */

/**
 * The risk ladder, as levels the operator can read at a glance. Each is a
 * name for a capability the grades already govern; there is one system
 * of permission, and this is its scale.
 */
export const RISK_LADDER = [
  { level: 0, id: 'read',    cap: 'data',    name: 'Read',    note: 'Look at the tables, the brain, the Archives' },
  { level: 1, id: 'analyse', cap: 'analyse', name: 'Analyse', note: 'Reason over it; search and read the open web' },
  { level: 2, id: 'draft',   cap: 'write',   name: 'Draft',   note: 'Write a draft or a proposal that waits for Leo' },
  { level: 3, id: 'change',  cap: 'change',  name: 'Change',  note: 'Edit a live system: pricing, stock, the site' },
  { level: 4, id: 'outward', cap: 'publish', name: 'Outward', note: 'Publish, or contact anyone outside' },
  { level: 5, id: 'spend',   cap: 'spend',   name: 'Spend',   note: 'Move money — never, for any agent' },
];
export const LEVEL_OF_CAP = { data: 0, analyse: 1, write: 2, change: 3, publish: 4, contact: 4, spend: 5 };

/** The highest level a step may reach without an approval upstream of it. */
export const AUTONOMY_CEILING = 2;

/**
 * What a step can do. `tool` is the roster tool the call goes through (so
 * `resolvePermission` decides it, and the agent must list it); `think`
 * goes through the model, which every agent that reasons uses. `cap` and
 * `minGrade` are what the acting agent must hold. Each has an executor in
 * packages/runtime/src/tools.js; the runtime test checks none is missing.
 */
export const ACTIONS = [
  { id: 'memory.search',   tool: 'memory',   cap: 'data',    minGrade: 'read',    level: 0, note: 'Search the brain for notes that bear on a question' },
  { id: 'archives.search', tool: 'archives', cap: 'data',    minGrade: 'read',    level: 0, note: 'Search the Archives modules' },
  { id: 'archives.pick',   tool: 'archives', cap: 'data',    minGrade: 'read',    level: 0, note: 'Choose one module to write from' },
  { id: 'database.read',   tool: 'database', cap: 'data',    minGrade: 'analyse', level: 0, note: 'Read a summary of the floor: missions, runs, orders' },
  { id: 'web.search',      tool: 'web',      cap: 'data',    minGrade: 'analyse', level: 1, note: 'Search the open web (SearXNG when set, otherwise DuckDuckGo)' },
  { id: 'web.fetch',       tool: 'web',      cap: 'data',    minGrade: 'analyse', level: 1, note: 'Read pages as plain text' },
  { id: 'think',           tool: 'counsel',  cap: 'write',   minGrade: 'draft',   level: 1, note: 'Reason with the model' },
  { id: 'orders.propose',  tool: null,       cap: 'write',   minGrade: 'draft',   level: 2, note: 'Write proposals down as proposed orders' },
  { id: 'drafts.generate', tool: 'archives', cap: 'write',   minGrade: 'draft',   level: 2, note: 'HERALD writes drafts from a module, through the lint gate' },
];
export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export const MISSION_STATES = ['standing', 'queued', 'running', 'paused', 'done', 'failed', 'cancelled'];
/** What the operator may set a mission to by hand: cancel it, or queue it again. Everything else is the worker's. */
export const MISSION_OPERATOR_STATES = ['queued', 'cancelled'];
export const MISSION_SOURCES = ['floor', 'schedule', 'agent', 'counsel'];
/** A step that runs longer than this without a heartbeat is the worker's crash, not the step's slowness. */
export const MISSION_STALE_MS = 20 * 60_000;
/** A mission that has taken this many steps is stopped, whatever its graph says. */
export const MISSION_MAX_STEPS = 24;

const PACKET = {
  type: 'object', additionalProperties: false,
  properties: {
    question: { type: 'string' },
    summary: { type: 'string', description: 'Three to six plain sentences answering the question from the evidence.' },
    findings: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, properties: {
      claim: { type: 'string' },
      source: { type: 'string', description: 'The URL or note it came from, exactly as given in the evidence; empty when there is none.' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    }, required: ['claim', 'source', 'confidence'] } },
    gaps: { type: 'array', maxItems: 5, items: { type: 'string' }, description: 'What the evidence could not say.' },
    proposals: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, properties: {
      room: { type: 'string' }, text: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, why: { type: 'string' },
    }, required: ['room', 'text', 'priority', 'why'] } },
  },
  required: ['question', 'summary', 'findings', 'gaps', 'proposals'],
};

export const MISSION_TEMPLATES = [
  {
    id: 'research', name: 'Research', agent: 'intel', room: 'intel',
    note: 'Answer a question from the web, the brain and the Archives, with a source for every claim. Ends in a research packet and at most three proposals.',
    input: { question: { required: true, note: 'What to find out' } },
    steps: [
      { id: 'plan', kind: 'think', after: [],
        prompt: 'Plan the research for this question: $input.question\n\nGive up to four web search queries that would find current, primary sources. Prefer specific queries over broad ones.',
        schema: { type: 'object', additionalProperties: false, properties: { queries: { type: 'array', maxItems: 4, items: { type: 'string' } }, angle: { type: 'string' } }, required: ['queries', 'angle'] } },
      { id: 'recall', kind: 'action', action: 'memory.search', after: [], args: { q: '$input.question', limit: 6 } },
      { id: 'archives', kind: 'action', action: 'archives.search', agent: 'oracle', after: [], args: { q: '$input.question', limit: 5 } },
      { id: 'search', kind: 'action', action: 'web.search', after: ['plan'], args: { queries: '$plan.queries', per: 4 } },
      { id: 'read', kind: 'action', action: 'web.fetch', after: ['search'], args: { urls: '$search.urls', max: 5 } },
      { id: 'synthesise', kind: 'think', after: ['recall', 'archives', 'read'],
        prompt: 'The question: $input.question\n\nWhat the brain holds:\n$recall\n\nWhat the Archives hold:\n$archives\n\nWhat the web says:\n$read\n\nWrite the research packet. Every finding names its source exactly as it appears above; a claim with no source is marked low and left with an empty source. Say what the evidence could not answer. Propose at most three smallest next actions, each routed to one room.',
        schema: PACKET },
      { id: 'propose', kind: 'action', action: 'orders.propose', after: ['synthesise'], args: { items: '$synthesise.proposals' } },
    ],
    output: 'synthesise',
  },
  {
    id: 'content', name: 'Content run', agent: 'herald', room: 'beacon',
    note: 'Pick a module, write the drafts through the lint gate, critique them, and rewrite once if they are weak. Every draft waits in BEACON; nothing publishes.',
    input: { lane: { note: 'mindset, trading, business… (optional)' }, subject: { note: 'part of a course name (optional)' }, module: { note: 'a module id, to skip the pick (optional)' } },
    steps: [
      { id: 'pick', kind: 'action', action: 'archives.pick', after: [], args: { lane: '$input.lane', subject: '$input.subject', module: '$input.module' } },
      { id: 'draft', kind: 'action', action: 'drafts.generate', after: ['pick'], args: { module: '$pick.id' } },
      { id: 'critique', kind: 'think', after: ['draft'],
        prompt: 'You are the critic, not the writer. These drafts were written from the module "$pick.title":\n\n$draft.drafts\n\nScore each from 1 to 10 for: a hook that stops the scroll, one idea per piece, plain language, and a call to action that follows from the piece. Be hard: most first drafts are a 6. Name the weakest draft by its id and say in one sentence what would fix it.',
        schema: { type: 'object', additionalProperties: false, properties: {
          scores: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, score: { type: 'number' }, weakness: { type: 'string' } }, required: ['id', 'score', 'weakness'] } },
          average: { type: 'number' }, weakest: { type: 'string' }, advice: { type: 'string' },
        }, required: ['scores', 'average', 'weakest', 'advice'] } },
      { id: 'weak', kind: 'condition', after: ['critique'], test: { path: '$critique.average', lt: 7 } },
      { id: 'revise', kind: 'action', action: 'drafts.generate', after: ['weak'], args: { module: '$pick.id', parent: '$critique.weakest', note: '$critique.advice' } },
    ],
    output: 'critique',
  },
  {
    id: 'review', name: 'Weekly review', agent: 'arcane', room: 'bridge',
    note: 'Look back over the week of missions and runs: what worked, what failed, what to change. The lessons it writes are read by every mission after it.',
    input: { days: { note: 'how far back (default 7)' } },
    steps: [
      { id: 'week', kind: 'action', action: 'database.read', agent: 'vector', after: [], args: { source: 'week', days: '$input.days' } },
      { id: 'judge', kind: 'think', after: ['week'],
        prompt: 'The network\'s week, from the tables:\n\n$week\n\nJudge it. What worked and should be kept, what failed and why, and what one change to how missions run would help most. Lessons are short instructions a future mission can follow. Propose at most three orders.',
        schema: { type: 'object', additionalProperties: false, properties: {
          worked: { type: 'array', maxItems: 5, items: { type: 'string' } },
          failed: { type: 'array', maxItems: 5, items: { type: 'string' } },
          lessons: { type: 'array', maxItems: 5, items: { type: 'string' } },
          proposals: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, properties: { room: { type: 'string' }, text: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, why: { type: 'string' } }, required: ['room', 'text', 'priority', 'why'] } },
        }, required: ['worked', 'failed', 'lessons', 'proposals'] } },
      { id: 'propose', kind: 'action', action: 'orders.propose', after: ['judge'], args: { items: '$judge.proposals' } },
    ],
    output: 'judge',
  },
];
export const MISSION_TEMPLATE_BY_ID = Object.fromEntries(MISSION_TEMPLATES.map((t) => [t.id, t]));

/** The level a step reaches: its action's, or a think's, or nothing for a gate. */
export function stepLevel(step) {
  if (step.kind === 'action') return ACTION_BY_ID[step.action]?.level ?? 5;
  if (step.kind === 'think') return ACTION_BY_ID.think.level;
  return 0;
}

/** Every step upstream of `id`, through `after`. */
export function upstreamOf(steps, id) {
  const by = Object.fromEntries(steps.map((s) => [s.id, s]));
  const seen = new Set(); const queue = [...(by[id]?.after || [])];
  while (queue.length) { const a = queue.shift(); if (seen.has(a) || !by[a]) continue; seen.add(a); queue.push(...(by[a].after || [])); }
  return seen;
}

/**
 * The problems with a plan, as sentences; empty when it may run. Shared by
 * the validator (over every template) and the worker (over each mission's
 * snapshot, before it runs a step), so the rule is written once.
 */
export function planProblems(steps, { agentOf = () => null } = {}) {
  const out = [];
  const ids = new Set(steps.map((s) => s.id));
  if (ids.size !== steps.length) out.push('two steps share an id');
  if (steps.length > MISSION_MAX_STEPS) out.push(`more than ${MISSION_MAX_STEPS} steps`);
  for (const s of steps) {
    for (const a of s.after || []) if (!ids.has(a)) out.push(`${s.id} waits on unknown step "${a}"`);
    if (!['action', 'think', 'condition', 'approval'].includes(s.kind)) { out.push(`${s.id}: unknown kind "${s.kind}"`); continue; }
    if (s.kind === 'action' && !ACTION_BY_ID[s.action]) out.push(`${s.id}: unknown action "${s.action}"`);
    if (s.kind === 'think' && (!s.prompt || !s.schema)) out.push(`${s.id}: a think step needs a prompt and a schema`);
    if (s.kind === 'condition' && !s.test?.path) out.push(`${s.id}: a condition needs a test path`);
    const level = stepLevel(s);
    if (level >= 5) out.push(`${s.id}: spend is never reachable`);
    else if (level > AUTONOMY_CEILING) {
      const gated = [...upstreamOf(steps, s.id)].some((u) => steps.find((x) => x.id === u)?.kind === 'approval');
      if (!gated) out.push(`${s.id}: level ${level} is above the autonomy ceiling (${AUTONOMY_CEILING}) and has no approval upstream`);
    }
    const agent = agentOf(s);
    if (agent && (s.kind === 'action' || s.kind === 'think')) {
      const a = s.kind === 'think' ? ACTION_BY_ID.think : ACTION_BY_ID[s.action];
      if (a) {
        const have = agent.caps?.[a.cap] ?? 'deny';
        if (GRADE_ORDER.indexOf(have) < GRADE_ORDER.indexOf(a.minGrade)) out.push(`${s.id}: ${agent.name} holds "${have}" on ${a.cap}; ${a.id} needs "${a.minGrade}"`);
        if (a.tool && a.tool !== 'counsel' && !(agent.tools || []).includes(a.tool)) out.push(`${s.id}: ${agent.name} does not use the ${a.tool} tool`);
      }
    }
  }
  return out;
}
// Kept local rather than imported so this file stays importable on its own; the validator checks it matches GRADES.
export const GRADE_ORDER = ['deny', 'read', 'analyse', 'draft', 'recommend', 'approval', 'allow'];
