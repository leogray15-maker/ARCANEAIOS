/**
 * Skill registry. A skill is a packaged procedure an agent runs. It lives
 * in `.claude/skills/<id>/SKILL.md` (so Claude Code can invoke it) and is
 * registered here (so the facility and the brain know it exists).
 *
 * `writes` names the only brain folders the skill may create files in.
 * `reads` names what it may look at. The validator checks both against
 * the owning agent's grades: a skill cannot out-rank its agent.
 */
export const SKILLS = [
  {
    id: 'herald', name: 'HERALD — Content Creator', agent: 'herald', room: 'beacon',
    status: 'production',
    summary: 'Turns Arcane Archives modules into post-ready drafts (short, medium, thread, email, teaser) and lands them in 02-Content/Drafts with complete frontmatter. Zero medical or dosing claims. Logs every run.',
    invoke: '/herald',
    reads: ['archives', 'notion', 'database', '02-Content', '03-Memory', '05-Knowledge/Archives-Map.md', '05-Knowledge/Archives-Sources.md'],
    writes: ['02-Content/Drafts', '02-Content/Sources', '02-Content/Content-Log.md', '04-Records/Trace', '04-Records/Daily-Log', 'database:content_drafts', 'database:agent_runs'],
    formats: ['short', 'medium', 'thread', 'email', 'teaser'],
  },
  // The three readers. Each is an endpoint on the agent contract in
  // api/_agent.js: read the tables, record the run, propose, never act.
  {
    id: 'tally-reading', name: 'TALLY — The Reading', agent: 'tally', room: 'vault',
    status: 'production',
    summary: 'Reads the Vault, the Lab, the funnel, the Trading Floor and the record; answers what changed, why, what it means and what to check. Every figure cited is one it was handed. Proposals land as proposed orders.',
    invoke: 'POST /api/tally',
    reads: ['database', '03-Memory'],
    writes: ['database:agent_runs', 'database:orders (proposed only)'],
  },
  {
    id: 'meridian-chain', name: 'MERIDIAN — The Chain', agent: 'meridian', room: 'apothecary',
    status: 'production',
    summary: 'Reads lots, stock, cover, the dispatch queue and what shipped; names where the chain binds and what to reorder. Never moves a vial.',
    invoke: 'POST /api/meridian',
    reads: ['database', '03-Memory'],
    writes: ['database:agent_runs', 'database:orders (proposed only)'],
  },
  {
    id: 'vector-position', name: 'VECTOR — The Position', agent: 'vector', room: 'warroom',
    status: 'production',
    summary: 'Reads the ranking, the money, the moves, what is blocked, the verdicts and the signals; returns where the ventures stand and what, if anything, to put to the Council — as a proposal the operator convenes or not.',
    invoke: 'POST /api/vector',
    reads: ['database', '03-Memory'],
    writes: ['database:agent_runs', 'database:orders (proposed only)'],
  },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
