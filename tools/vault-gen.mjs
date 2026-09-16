#!/usr/bin/env node
/**
 * Generate 01-System and the knowledge cards from `packages/config`.
 *
 * The roster is not prose. Nineteen agents exist in config with a domain,
 * a toolset and a grade per capability. Hand-writing `01-System/Agents/
 * HERALD.md` would fork that: change a grade in config and the note
 * quietly becomes a lie. So the vault is an OUTPUT. Regenerate it and it
 * is correct again.
 *
 *   npm run vault          # dry run — prints the plan
 *   npm run vault:write    # writes
 *
 * Two rules, because this writes into real notes:
 *   1. Nothing is written without --write.
 *   2. A file is only replaced if it carries `generated: true`. Anything
 *      hand-written is kept and reported. Nothing is ever deleted.
 */
import path from 'node:path';
import {
  AGENTS, COUNCIL, TOOLS, ROOMS, WINGS, roomsInWing, VENTURES, SKILLS,
  CAPS, GRADES, STANDING_RULES, BRIEF_BLOCKS, VERDICTS, DRAFT_STATES, ORDER_STATES,
  AGENT_BY_ID, ROOM_BY_ID, WING_BY_ID, VENTURE_BY_ID, DASHBOARD_FRAME,
} from '../packages/config/src/index.js';
import { brainDir, writeGenerated, serializeFrontmatter, stamp } from './lib/brain.mjs';

const write = process.argv.includes('--write');
const brain = brainDir();
const now = stamp();

const fm = (extra) => serializeFrontmatter({
  type: 'system-card', created: now, updated: now, status: 'active', agent: 'FOUNDRY',
  generated: true, ...extra,
});

const link = (name) => `[[${name}]]`;
const agentLink = (id) => (id ? link(AGENT_BY_ID[id].name) : '—');
const roomLink = (id) => (id ? link(ROOM_BY_ID[id].name) : '—');

const plan = [];
const emit = (rel, content) => plan.push([rel, writeGenerated(path.join(brain, rel), content, { write })]);

/* ---------- agents ---------- */
for (const a of AGENTS) {
  const room = ROOM_BY_ID[a.room];
  const lines = [
    fm({ agent: a.name, card: 'agent', agent_id: a.id, call: a.call, room: room.name, council: a.council, tags: ['system', 'agent'] }),
    `# ${a.name} — ${a.role}`,
    '',
    `\`${a.call}\` · station ${link(room.name)} · wing ${WING_BY_ID[room.wing].name}${a.kind === 'arcane' ? ' · **Commander**' : ''}`,
    '',
    `> ${a.brief}`,
    '',
    `**Domain.** ${a.domain}`,
    '',
    a.council ? `Seated on ${link('The Council')}, voice weight ${a.weight}.` : 'Not seated on the Council.',
    '',
    '## Tools',
    '',
    ...a.tools.map((t) => { const tool = TOOLS.find((x) => x.id === t); return `- ${tool.name} — \`${tool.state}\``; }),
    '',
    '## Permissions',
    '',
    '| Capability | Grade |', '| --- | --- |',
    ...CAPS.map((c) => `| ${c.name} | \`${a.caps[c.id]}\` |`),
    '',
    `Full network in ${link('Permission Matrix')}. No agent holds \`allow\`; spend is \`deny\` for everyone.`,
    '',
    '## Must ask before',
    '',
    ...(a.asks.length ? a.asks.map((s) => `- ${s}`) : ['- Nothing beyond the standing rules.']),
    '',
    '## Skills',
    '',
    ...(a.skills.length ? a.skills.map((s) => { const sk = SKILLS.find((x) => x.id === s); return `- **${sk.name}** — \`${sk.invoke}\` · ${sk.status}`; }) : ['- None registered yet.']),
    '',
    '## Sprite',
    '',
    `Main colour \`${a.colour}\`. Palette id \`${a.sprite}\`. See \`docs/SPRITES.md\`.`,
    '',
  ];
  emit(`01-System/Agents/${a.name}.md`, lines.join('\n'));
}

/* ---------- rooms ---------- */
for (const r of ROOMS) {
  const wing = WING_BY_ID[r.wing];
  const visitors = AGENTS.filter((a) => a.room !== r.id && a.tools.includes('memory')).length;
  const lines = [
    fm({ agent: r.agent ? AGENT_BY_ID[r.agent].name : 'ARCANE', card: 'room', room_id: r.id, wing: wing.name, tags: ['system', 'room'] }),
    `# ${r.name}`,
    '',
    `${r.sub} · wing **${wing.name}** (${wing.no}) · row ${r.row + 1}`,
    '',
    `> ${r.domain}`,
    '',
    `**Resident.** ${agentLink(r.agent)}${r.agent ? ` (${AGENT_BY_ID[r.agent].role})` : ' — the chamber has no resident; nine seats convene here.'}`,
    '',
    `**Venture.** ${r.venture ? VENTURE_BY_ID[r.venture].name : '—'}`,
    '',
    `**Brain folder.** ${r.brain ? `\`${r.brain}\`` : '— (reads shared memory only)'}`,
    '',
    '## Dashboard',
    '',
    ...DASHBOARD_FRAME.map((s) => `- **${s.name}** — ${s.note}`),
    '',
    `Widgets: ${r.widgets.map((w) => `\`${w}\``).join(', ')}`,
    '',
  ];
  emit(`01-System/Rooms/${r.name}.md`, lines.join('\n'));
}

/* ---------- council ---------- */
emit('01-System/The Council.md', [
  fm({ agent: 'ARCANE', card: 'council', tags: ['system', 'council'] }),
  '# The Council',
  '',
  `Nine seats. A real decision goes to all of them in one structured session; each answers from its own domain, and ${link('ARCANE')} returns one verdict — ${VERDICTS.map((v) => `**${v}**`).join(', ')} — with the conditions that must be true first.`,
  '',
  'Disagreement is recorded, not smoothed over. A council where everyone agrees is worthless.',
  '',
  '| Weight | Seat | Role | Speaks for |', '| --- | --- | --- | --- |',
  ...COUNCIL.map((a) => `| ${a.weight} | ${link(a.name)} | ${a.role} | ${a.domain} |`),
  '',
  `Sessions are recorded in \`04-Records/Decisions/\` using \`99-Templates/Decision.md\` and indexed in ${link('Decision Log')}.`,
  '',
].join('\n'));

/* ---------- permission matrix ---------- */
emit('01-System/Permission-Matrix.md', [
  fm({ agent: 'WARDEN', card: 'matrix', tags: ['system', 'permissions'] }),
  '# Permission Matrix',
  '',
  `Grades weakest to strongest: ${GRADES.map((g) => `\`${g}\``).join(' · ')}`,
  '',
  `| Agent | ${CAPS.map((c) => c.name).join(' | ')} |`,
  `| --- | ${CAPS.map(() => '---').join(' | ')} |`,
  ...AGENTS.map((a) => `| ${link(a.name)} | ${CAPS.map((c) => a.caps[c.id]).join(' | ')} |`),
  '',
  '## Standing rules (enforced by `tools/validate-config.mjs`)',
  '',
  ...STANDING_RULES.map((r) => `- **${r.id}** — ${r.text}`),
  '',
  '## What each capability means',
  '',
  ...CAPS.map((c) => `- **${c.name}** — ${c.note}`),
  '',
].join('\n'));

/* ---------- tools ---------- */
emit('01-System/Tools.md', [
  fm({ agent: 'FOUNDRY', card: 'tools', tags: ['system', 'tools'] }),
  '# Tools',
  '',
  'What the network can reach. State is honest, never aspirational.',
  '',
  '| Tool | State | Note | Carried by |', '| --- | --- | --- | --- |',
  ...TOOLS.map((t) => `| ${t.name} | \`${t.state}\` | ${t.note} | ${AGENTS.filter((a) => a.tools.includes(t.id)).map((a) => link(a.name)).join(', ') || '—'} |`),
  '',
].join('\n'));

/* ---------- skills ---------- */
emit('01-System/Skills.md', [
  fm({ agent: 'FOUNDRY', card: 'skills', tags: ['system', 'skills'] }),
  '# Skills',
  '',
  'A skill is a packaged procedure an agent runs. It lives in `.claude/skills/<id>/SKILL.md` and is registered in `packages/config/src/skills.js`. A skill can never out-rank its agent.',
  '',
  ...SKILLS.flatMap((s) => [
    `## ${s.name}`,
    '',
    `\`${s.invoke}\` · agent ${agentLink(s.agent)} · room ${roomLink(s.room)} · status **${s.status}**`,
    '',
    s.summary,
    '',
    `- **Reads:** ${s.reads.map((x) => `\`${x}\``).join(', ')}`,
    `- **Writes:** ${s.writes.map((x) => `\`${x}\``).join(', ')}`,
    s.formats ? `- **Formats:** ${s.formats.join(', ')}` : '',
    '',
  ]),
].join('\n'));

/* ---------- knowledge: facility ---------- */
emit('05-Knowledge/Facility.md', [
  fm({ agent: 'ORACLE', card: 'facility', tags: ['knowledge', 'facility'] }),
  '# The Facility',
  '',
  'Twenty rooms in four wings around two service corridors and a central hall. Every room is a real domain; every agent has a home station; crew walk toward rooms with open orders.',
  '',
  `| | ${WINGS.map((w) => w.name).join(' | ')} |`,
  `| --- | ${WINGS.map(() => '---').join(' | ')} |`,
  ...[0, 1, 2, 3, 4].map((row) => `| ${row + 1} | ${WINGS.map((w) => { const r = roomsInWing(w.id)[row]; return `${link(r.name)}${r.agent ? ` · ${agentLink(r.agent)}` : ''}`; }).join(' | ')} |`),
  '',
  '## Wings',
  '',
  ...WINGS.map((w) => `- **${w.no} ${w.name}** — ${w.sub}`),
  '',
  '## Vocabulary',
  '',
  `- Brief blocks: ${BRIEF_BLOCKS.map((b) => `**${b.name}**`).join(' → ')}`,
  `- Verdicts: ${VERDICTS.join(' · ')}`,
  `- Order states: ${ORDER_STATES.join(' → ')}`,
  `- Draft states: ${DRAFT_STATES.join(' → ')}`,
  '',
].join('\n'));

/* ---------- knowledge: ventures ---------- */
emit('05-Knowledge/Ventures.md', [
  fm({ agent: 'ORACLE', card: 'ventures', tags: ['knowledge', 'ventures'] }),
  '# The Ventures',
  '',
  '| Venture | Kind | Model | Room | Answers for it | Facts |', '| --- | --- | --- | --- | --- | --- |',
  ...VENTURES.map((v) => `| **${v.name}** | ${v.kind} | ${v.model} | ${roomLink(v.room)} | ${agentLink(ROOM_BY_ID[v.room].agent)} | ${v.facts.join(' · ')} |`),
  '',
].join('\n'));

/* ---------- report ---------- */
const counts = {};
for (const [, s] of plan) counts[s] = (counts[s] || 0) + 1;
console.log(`${write ? 'Wrote' : 'Dry run'} → ${brain}`);
for (const [rel, s] of plan) if (s !== 'unchanged' || !write) console.log(`  ${s.padEnd(9)} ${rel}`);
console.log(`\n${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}${write ? '' : '  (add --write to apply)'}`);
