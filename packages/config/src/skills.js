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
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
