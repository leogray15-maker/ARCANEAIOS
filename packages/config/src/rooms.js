/**
 * Twenty rooms, four wings, one facility.
 *
 * This is the *meaning* of each room — its name, domain, resident agent,
 * venture, and the folder of the brain it owns. Pixel geometry (rects,
 * doors, props) belongs to the facility app, not here: a room's purpose
 * does not change when its furniture does.
 *
 * `brain` is the vault folder the room reads and writes. Every top-level
 * folder in the brain is owned by exactly one room, so when a dashboard
 * opens it knows where its files live and no two agents fight over a file.
 *
 * `dashboard` lists the sections every room's panel renders, in order.
 * Rooms share the same four-section frame so the operator never has to
 * relearn a screen: State, Orders, Crew, Files.
 */

export const ROOMS = [
  /* ============ C1 · PRODUCTION ============ */
  {
    id: 'apothecary', name: 'THE LAB', sub: 'Arcane Peptides · Stock · COA · Dispatch',
    wing: 'production', row: 0, agent: 'meridian', venture: 'peptides', accent: 'arcane',
    domain: 'Cold storage, vial racks, batch records, lab reports, the dispatch cutoff.',
    brain: null,
    widgets: ['stock-by-compound', 'coa-state', 'dispatch-queue'],
  },
  {
    id: 'vitals', name: 'VITALS', sub: 'Arcane Track · Members',
    wing: 'production', row: 1, agent: 'lumen', venture: 'track', accent: 'vital',
    domain: 'Arcane Track members, retention, who has stopped logging.',
    brain: null,
    widgets: ['member-cohorts', 'churn-watch'],
  },
  {
    id: 'forge', name: 'FORGE', sub: 'Build · Site · App · Ops',
    wing: 'production', row: 2, agent: 'anvil', venture: null, accent: 'cyan',
    domain: 'The site, the app, automation, the order pipeline. Where a workflow is repaired.',
    brain: null,
    widgets: ['build-queue'],
  },
  {
    id: 'market', name: 'THE MARKET', sub: 'Visitors → Leads → Orders',
    wing: 'production', row: 3, agent: 'ledger', venture: 'peptides', accent: 'rose',
    domain: 'The shop front. The funnel from a visitor to a paid order.',
    brain: null,
    widgets: ['funnel'],
  },
  {
    id: 'beacon', name: 'BEACON', sub: 'Signal · Content · Email',
    wing: 'production', row: 4, agent: 'herald', venture: 'archives', accent: 'flare',
    domain: 'Content, email, launches, the attention funnel. Drafts wait here for approval.',
    brain: '02-Content',
    widgets: ['draft-queue', 'post-calendar'],
  },

  /* ============ C2 · COMMAND ============ */
  {
    id: 'bridge', name: 'BRIDGE', sub: 'Command · Targets · Doctrine',
    wing: 'command', row: 0, agent: 'arcane', venture: null, accent: 'arcane',
    domain: 'Command. The shared memory, the four-block brief, standing doctrine, the goals.',
    brain: '03-Memory',
    widgets: ['brief', 'doctrine', 'goals'],
  },
  {
    id: 'warroom', name: 'THE WAR ROOM', sub: 'Strategy · The next move',
    wing: 'command', row: 1, agent: 'vector', venture: null, accent: 'arcane',
    domain: 'Which venture gets the next hour, the next pound, the next quarter.',
    brain: null,
    widgets: ['top-three-moves', 'stop-doing'],
  },
  {
    id: 'council', name: 'THE COUNCIL', sub: 'Deliberation · Verdicts',
    wing: 'command', row: 2, agent: null, venture: null, accent: 'gold',
    domain: 'Nine seated agents put a decision to the test and the Commander returns one verdict.',
    brain: '04-Records/Decisions',
    widgets: ['council-session'],
  },
  {
    id: 'vault', name: 'THE VAULT', sub: 'Treasury · Cash · VAT · The split',
    wing: 'command', row: 3, agent: 'tally', venture: null, accent: 'gold',
    domain: 'Cash, burn, runway, the tax reserve, the split. Nobody in here moves a penny.',
    brain: null,
    widgets: ['month-summary', 'allocations'],
  },
  {
    id: 'scriptorium', name: 'SCRIPTORIUM', sub: 'The Codex · Writing',
    wing: 'command', row: 4, agent: 'scribe', venture: 'codex', accent: 'breach',
    domain: 'Books, masterclasses, the long-form work and its launches.',
    brain: null,
    widgets: ['manuscript-progress'],
  },

  /* ============ ANNEX · below COMMAND, opening onto the atrium ============ */
  {
    id: 'trading', name: 'THE TRADING FLOOR', sub: 'XAUUSD · ICT · The Journal',
    wing: 'command', row: 5, annex: true, agent: null, venture: null, accent: 'gold',
    domain: 'Leo\'s own desk. Gold on the monitors, the sessions on the wall, every trade in the Journal.',
    brain: '05-Knowledge/Trading-Journal.md',
    widgets: ['journal'],
    opens: '#journal',
  },

  /* ============ C3 · KNOWLEDGE ============ */
  {
    id: 'intel', name: 'INTELLIGENCE', sub: 'Competitors · Markets · Signals',
    wing: 'knowledge', row: 0, agent: 'intel', venture: null, accent: 'arcane',
    domain: 'Competitors, markets, pricing, suppliers, regulation. Opportunity, threat, signal, action.',
    brain: null,
    widgets: ['daily-intel'],
  },
  {
    id: 'observatory', name: 'THE OBSERVATORY', sub: 'Continuous watch',
    wing: 'knowledge', row: 1, agent: 'watch', venture: null, accent: 'cyan',
    domain: 'Everything that changes while the operator is not looking.',
    brain: '03-Memory/Signals.md',
    widgets: ['signal-feed'],
  },
  {
    id: 'dealroom', name: 'THE DEAL ROOM', sub: 'People · Pipeline · Outreach',
    wing: 'knowledge', row: 2, agent: 'envoy', venture: null, accent: 'flare',
    domain: 'Leads, prospects, customers, partners, suppliers. Outreach drafted, never sent unasked.',
    brain: null,
    widgets: ['pipeline'],
  },
  {
    id: 'archives', name: 'THE LIBRARY', sub: 'Archives · Content · PDF products',
    wing: 'knowledge', row: 3, agent: 'oracle', venture: 'archives', accent: 'cyan',
    domain: 'The map of the Archives — every subject and module — and the products cut from them.',
    brain: '05-Knowledge',
    widgets: ['archives-map', 'pdf-catalogue'],
  },
  {
    id: 'lounge', name: 'THE LOUNGE', sub: 'Off the clock',
    wing: 'knowledge', row: 4, agent: 'host', venture: null, accent: 'vital',
    domain: 'Downtime, and noticing when there has not been any.',
    brain: null,
    widgets: ['time-since-stopped'],
  },

  /* ============ C4 · NETWORK & LIFE ============ */
  {
    id: 'garage', name: 'THE AGENT GARAGE', sub: 'Build · Configure · Deploy',
    wing: 'network', row: 0, agent: 'forge', venture: null, accent: 'arcane',
    domain: 'Where an agent is configured: name, role, domain, tools, grades, and what it must ask before doing.',
    brain: '01-System/Agents',
    widgets: ['roster'],
  },
  {
    id: 'control', name: 'THE CONTROL ROOM', sub: 'Permissions · Approvals · Audit',
    wing: 'network', row: 1, agent: 'guard', venture: null, accent: 'breach',
    domain: 'The permission matrix, the approval queue, the audit trail. The room that says no.',
    brain: '01-System',
    widgets: ['permission-matrix', 'approval-queue'],
  },
  {
    id: 'inventor', name: "THE INVENTOR'S ROOM", sub: 'Ideas · Verdicts',
    wing: 'network', row: 2, agent: 'venture', venture: null, accent: 'vital',
    domain: 'New ideas, before they get lost. Market, competition, economics, MVP, cost, risk → BUILD, WATCH or KILL.',
    brain: '00-Inbox',
    widgets: ['idea-queue'],
  },
  {
    id: 'records', name: 'THE RECORDS', sub: 'Contracts · SOPs · Memory',
    wing: 'network', row: 3, agent: 'steward', venture: null, accent: 'gold',
    domain: 'The institutional memory. The Trace, the daily log, every decision and why it was made.',
    brain: '04-Records',
    widgets: ['trace', 'decision-log'],
  },
  {
    id: 'sanctum', name: 'SANCTUM', sub: 'Leo · Body · Sleep · Focus',
    wing: 'network', row: 4, agent: 'keeper', venture: null, accent: 'vital',
    domain: 'The operator. Sleep, training, focus, and whether the life is actually moving where it was pointed.',
    brain: null,
    widgets: ['daily-protocol'],
  },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

/** The four sections every room dashboard renders, in order. */
export const DASHBOARD_FRAME = [
  { id: 'state',  name: 'State',  note: 'What is true in this room right now — its widgets and numbers' },
  { id: 'orders', name: 'Orders', note: 'Open work routed to this room, by priority' },
  { id: 'crew',   name: 'Crew',   note: 'Who is stationed here, who is visiting, what each is doing' },
  { id: 'files',  name: 'Files',  note: 'The brain folder this room owns, newest first' },
];

/** The five rooms of a wing, in row order. Annexes hang off a wing but are not one of its five. */
export const roomsInWing = (wingId) =>
  ROOMS.filter((r) => r.wing === wingId && !r.annex).sort((a, b) => a.row - b.row);
export const ANNEXES = ROOMS.filter((r) => r.annex);
