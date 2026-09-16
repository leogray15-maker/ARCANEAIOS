/**
 * THE AGENT NETWORK — nineteen agents, one facility.
 *
 * Every agent is a specialist with a domain, a home station, a toolset, a
 * grade per capability, and a list of the things it must ask before doing.
 * Nothing executes on its own. The grades are the contract; the Control
 * Room is where you read them; `tools/validate-config.mjs` is what refuses
 * a roster that breaks the standing rules.
 *
 * `kind: 'arcane'` marks the Commander. Everyone else is crew.
 * `council` seats an agent on the Council; `weight` orders its voice.
 * `sprite` is the palette the sprite baker uses — colour is identity on
 * the floor, so no two agents share a main colour.
 */

import { CAP_IDS } from './permissions.js';

/** Tools the network can reach. `state` is honest, never aspirational. */
export const TOOLS = [
  { id: 'memory',   name: 'Shared memory', state: 'live',      note: 'The brain (Obsidian vault) plus Firestore for live state. One state the whole network reads before acting.' },
  { id: 'notion',   name: 'Notion',        state: 'read-only', note: 'The Arcane Archives. Read only, by the operator\'s instruction. No agent may create, update or move a page.' },
  { id: 'counsel',  name: 'Claude',        state: 'live',      note: 'Reasoning for Counsel and the Council.' },
  { id: 'archives', name: 'Archives index',state: 'live',      note: 'Local index of the Archives export, built by HERALD. Offline, deterministic, regenerable.' },
  { id: 'calendar', name: 'Calendar',      state: 'not wired', note: 'Not connected yet.' },
  { id: 'email',    name: 'Email',         state: 'not wired', note: 'Not connected yet.' },
  { id: 'commerce', name: 'Store',         state: 'not wired', note: 'Arcane Peptides orders and stock.' },
  { id: 'crm',      name: 'CRM',           state: 'not wired', note: 'People, deals, follow-ups.' },
  { id: 'web',      name: 'Web research',  state: 'not wired', note: 'Competitor and market monitoring.' },
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/** The floor every agent starts from. Spend is deny for the whole network. */
const base = Object.freeze({
  data: 'analyse', analyse: 'analyse', write: 'draft',
  spend: 'deny', publish: 'deny', contact: 'deny', change: 'deny',
});

const caps = (over = {}) => ({ ...base, ...over });

export const AGENTS = [
  {
    id: 'arcane', call: 'ARCANEBOT', name: 'ARCANE', role: 'Commander', kind: 'arcane',
    room: 'bridge', colour: '#a98bff', sprite: 'arcane',
    domain: 'The whole empire',
    brief: 'Holds the state of everything and decides which specialist works next. Writes the four-block brief. Synthesises the Council into one verdict.',
    tools: ['memory', 'counsel', 'notion', 'archives'],
    caps: caps({ write: 'recommend', publish: 'approval', contact: 'approval', change: 'approval' }),
    asks: ['Before routing an order to a crew member outside its domain', 'Before any act graded `approval`'],
    skills: [],
    council: true, weight: 0,
  },
  {
    id: 'meridian', call: 'ARCA-LAB', name: 'MERIDIAN', role: 'Quartermaster',
    room: 'apothecary', colour: '#c68bff', sprite: 'meridian',
    domain: 'Arcane Peptides — stock, batches, COA, dispatch',
    brief: 'Watches stock cover, batch records and whether every live compound has a lab report against it. Flags a dispatch cutoff at risk.',
    tools: ['memory', 'commerce', 'notion'],
    caps: caps({ change: 'approval' }),
    asks: ['Before changing a stock figure, batch record or COA state'],
    skills: [],
    council: true, weight: 3,
  },
  {
    id: 'tally', call: 'ARCA-TREASURER', name: 'TALLY', role: 'Treasurer',
    room: 'vault', colour: '#d9a441', sprite: 'tally',
    domain: 'Cash, burn, runway, tax reserve, the split',
    brief: 'Answers what you can afford and where the money is leaking. Audits subscriptions and unusual spend. Recommends; never moves a penny.',
    tools: ['memory'],
    caps: caps({ write: 'recommend' }),
    asks: ['Never asks to spend — recommends, and the operator moves it'],
    skills: [],
    council: true, weight: 1,
  },
  {
    id: 'vector', call: 'ARCA-STRATEGIST', name: 'VECTOR', role: 'Strategist',
    room: 'warroom', colour: '#b79cff', sprite: 'vector',
    domain: 'Which venture gets the next hour, the next pound, the next quarter',
    brief: 'Ranks the ventures by what is actually compounding and names what to stop doing. Produces the top three moves.',
    tools: ['memory', 'counsel'],
    caps: caps({ write: 'recommend' }),
    asks: ['Before recommending that a venture be paused or killed'],
    skills: [],
    council: true, weight: 2,
  },
  {
    id: 'herald', call: 'ARCA-MEDIA', name: 'HERALD', role: 'Signalman',
    room: 'beacon', colour: '#e8b64c', sprite: 'herald',
    domain: 'Content, email, launches, the attention funnel',
    brief: 'Turns Archives modules into post-ready drafts and watches which of them actually produce leads. Drafts only — nothing goes out unapproved.',
    tools: ['memory', 'notion', 'archives'],
    caps: caps({ publish: 'approval', contact: 'draft' }),
    asks: ['Before touching a health, compound or trading subject (compliance gate runs regardless)', 'Before emitting more than 10 drafts in one run'],
    skills: ['herald'],
    council: true, weight: 4,
  },
  {
    id: 'oracle', call: 'ARCA-SCRIBE', name: 'ORACLE', role: 'Archivist',
    room: 'archives', colour: '#6bd6ff', sprite: 'oracle',
    domain: 'The Archives, the knowledge base, PDF products',
    brief: 'Keeps the map of the Archives and cuts them into things worth selling. Runs idea → research → draft → review → publish.',
    tools: ['memory', 'notion', 'archives'],
    caps: caps(),
    asks: ['Before proposing a paid product cut from member-only content'],
    skills: [],
    council: false, weight: 6,
  },
  {
    id: 'lumen', call: 'ARCA-VITALS', name: 'LUMEN', role: 'Physician',
    room: 'vitals', colour: '#3ecf8e', sprite: 'lumen',
    domain: 'Arcane Track — members, retention, logging',
    brief: 'Watches churn and who has stopped logging. Never gives medical advice, to you or to a member.',
    tools: ['memory'],
    caps: caps({ contact: 'draft' }),
    asks: ['Before drafting any message to a member'],
    skills: [],
    council: false, weight: 7,
  },
  {
    id: 'anvil', call: 'ARCA-OPS', name: 'ANVIL', role: 'Engineer',
    room: 'forge', colour: '#56c9f0', sprite: 'anvil',
    domain: 'Site, app, automation, the order pipeline',
    brief: 'Owns the machine that turns an order into a delivered parcel and a reconciled line. Flags where a workflow breaks.',
    tools: ['memory', 'commerce'],
    caps: caps({ change: 'approval' }),
    asks: ['Before any change to a live site, app or automation'],
    skills: [],
    council: true, weight: 5,
  },
  {
    id: 'scribe', call: 'ARCA-CODEX', name: 'SCRIBE', role: 'Scrivener',
    room: 'scriptorium', colour: '#e5484d', sprite: 'scribe',
    domain: 'The Codex — books, masterclasses, launches',
    brief: 'Drafts and proofs the long-form work and runs a launch sequence when a title is ready.',
    tools: ['memory', 'notion', 'archives'],
    caps: caps({ publish: 'approval' }),
    asks: ['Before scheduling any launch step'],
    skills: [],
    council: false, weight: 8,
  },
  {
    id: 'keeper', call: 'ARCA-MENTOR', name: 'KEEPER', role: 'Steward',
    room: 'sanctum', colour: '#7ee0a8', sprite: 'keeper',
    domain: 'Sleep, training, focus, the long-term goals',
    brief: 'Answers one question honestly: are you actually moving toward the life you said you wanted, or just busy.',
    tools: ['memory'],
    caps: caps(),
    asks: [],
    skills: [],
    council: true, weight: 9,
  },
  {
    id: 'intel', call: 'ARCA-INTEL', name: 'CIPHER', role: 'Intelligence',
    room: 'intel', colour: '#8b5cf6', sprite: 'cipher',
    domain: 'Competitors, markets, pricing, suppliers, regulation',
    brief: 'Produces the daily intelligence: opportunity, threat, signal, action. Needs web research wired before it can do its job.',
    tools: ['memory', 'web'],
    caps: caps(),
    asks: [],
    skills: [],
    council: true, weight: 4,
  },
  {
    id: 'ledger', call: 'ARCA-COMMERCE', name: 'ABACUS', role: 'Commerce',
    room: 'market', colour: '#e0609a', sprite: 'abacus',
    domain: 'Visitors → leads → orders → revenue',
    brief: 'Watches the funnel and names the biggest drop-off. Suggests the one change most likely to move conversion.',
    tools: ['memory', 'commerce'],
    caps: caps({ change: 'approval' }),
    asks: ['Before any change to pricing or the shop front'],
    skills: [],
    council: false, weight: 6,
  },
  {
    id: 'envoy', call: 'ARCA-SALES', name: 'ENVOY', role: 'Deals',
    room: 'dealroom', colour: '#f0a05a', sprite: 'envoy',
    domain: 'Leads, prospects, customers, partners, suppliers',
    brief: 'Researches a company, drafts the outreach, prepares the meeting brief. Sends nothing without your word.',
    tools: ['memory', 'crm', 'web'],
    caps: caps({ contact: 'approval' }),
    asks: ['Before every send — no batch approvals'],
    skills: [],
    council: false, weight: 7,
  },
  {
    id: 'watch', call: 'ARCA-WATCH', name: 'VIGIL', role: 'Observer',
    room: 'observatory', colour: '#4fb8e0', sprite: 'vigil',
    domain: 'Everything that changes while you are not looking',
    brief: 'Does not wait to be asked. Raises a signal when stock, revenue, a competitor or a deadline moves.',
    tools: ['memory', 'web'],
    caps: caps(),
    asks: [],
    skills: [],
    council: false, weight: 5,
  },
  {
    id: 'guard', call: 'ARCA-GUARD', name: 'WARDEN', role: 'Risk & Control',
    room: 'control', colour: '#f26d6d', sprite: 'warden',
    domain: 'Permissions, approvals, compliance, the audit trail',
    brief: 'Holds the permission grades and says no. Flags regulatory exposure before it becomes a problem, not after.',
    tools: ['memory'],
    caps: caps({ write: 'recommend' }),
    asks: [],
    skills: [],
    council: true, weight: 2,
  },
  {
    id: 'venture', call: 'ARCA-VENTURE', name: 'SPARK', role: 'Inventor',
    room: 'inventor', colour: '#5fe0a0', sprite: 'spark',
    domain: 'New ideas, before they get lost',
    brief: 'Takes an idea through market, competition, economics, MVP, cost and risk, then returns BUILD, WATCH or KILL.',
    tools: ['memory', 'counsel', 'web'],
    caps: caps({ write: 'recommend' }),
    asks: [],
    skills: [],
    council: false, weight: 8,
  },
  {
    id: 'forge', call: 'ARCA-SMITH', name: 'FOUNDRY', role: 'Agent-wright',
    room: 'garage', colour: '#9d7cff', sprite: 'foundry',
    domain: 'The agents themselves',
    brief: 'Where an agent is configured: name, role, domain, tools, permissions, and what it must ask before doing.',
    tools: ['memory'],
    caps: caps({ change: 'approval' }),
    asks: ['Before changing any grade on any agent — and never to `allow`'],
    skills: [],
    council: false, weight: 9,
  },
  {
    id: 'steward', call: 'ARCA-KEEPER', name: 'RELIC', role: 'Records',
    room: 'records', colour: '#c9963a', sprite: 'relic',
    domain: 'Contracts, receipts, SOPs, and why a decision was made',
    brief: 'The institutional memory. Holds the Trace and the reasoning behind past decisions so no agent starts a task from scratch.',
    tools: ['memory', 'notion'],
    caps: caps(),
    asks: [],
    skills: [],
    council: false, weight: 9,
  },
  {
    id: 'host', call: 'ARCA-HOST', name: 'EMBER', role: 'Steward of the Lounge',
    room: 'lounge', colour: '#8fe6b6', sprite: 'ember',
    domain: 'Downtime, and noticing when you have not had any',
    brief: 'Watches how long you have gone without stopping. The only agent whose job is to tell you to leave the building.',
    tools: ['memory'],
    caps: caps({ write: 'recommend' }),
    asks: [],
    skills: [],
    council: false, weight: 10,
  },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
export const AGENT_BY_NAME = Object.fromEntries(AGENTS.map((a) => [a.name, a]));
export const CREW = AGENTS.filter((a) => a.kind !== 'arcane');
export const ARCANE = AGENTS.find((a) => a.kind === 'arcane');
export const COUNCIL = AGENTS.filter((a) => a.council).sort((a, b) => a.weight - b.weight);

/** Sanity: every cap key an agent carries is a real capability. */
for (const a of AGENTS) {
  for (const k of Object.keys(a.caps)) {
    if (!CAP_IDS.includes(k)) throw new Error(`${a.name} carries unknown capability "${k}"`);
  }
}
