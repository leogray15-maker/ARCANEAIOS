#!/usr/bin/env node
/**
 * Refuse a config that breaks the standing rules.
 *
 * Runs in `npm test` and should run in CI before any deploy or vault write.
 * Every rule here is one the operator stated; if a rule is not here it is
 * not enforced, and if it is here it cannot be argued with by prose.
 */
import {
  AGENTS, ARCANE, CREW, COUNCIL, TOOLS, TOOL_BY_ID,
  ROOMS, WINGS, roomsInWing,
  GRADES, CAPS, CAP_IDS, SKILLS, AGENT_BY_ID, ROOM_BY_ID, VENTURES,
  DRAFT_STATES, DRAFT_TRANSITIONS, DRAFT_VIEWS,
  TOOL_POLICY, RISK_LEVELS, resolvePermission,
} from '../packages/config/src/index.js';

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* ---- roster shape ---- */
ok(AGENTS.length === 19, `expected 19 agents, found ${AGENTS.length}`);
ok(AGENTS.filter((a) => a.kind === 'arcane').length === 1, 'exactly one Commander');
ok(CREW.length === 18, `expected 18 crew, found ${CREW.length}`);
ok(new Set(AGENTS.map((a) => a.id)).size === AGENTS.length, 'agent ids unique');
ok(new Set(AGENTS.map((a) => a.name)).size === AGENTS.length, 'agent names unique');
ok(new Set(AGENTS.map((a) => a.colour.toLowerCase())).size === AGENTS.length, 'agent colours unique (colour is identity on the floor)');
ok(COUNCIL.length === 9, `expected 9 council seats, found ${COUNCIL.length}`);
ok(COUNCIL[0]?.id === 'arcane', 'ARCANE speaks last but is weighted first');

/* ---- floor shape ---- */
const MAIN = ROOMS.filter((r) => !r.annex);
ok(MAIN.length === 20, `expected 20 rooms in the wings, found ${MAIN.length}`);
ok(ROOMS.length === 21, `expected 21 rooms with the annex, found ${ROOMS.length}`);
ok(WINGS.length === 4, `expected 4 wings, found ${WINGS.length}`);
for (const w of WINGS) {
  const rs = roomsInWing(w.id);
  ok(rs.length === 5, `wing ${w.name} has ${rs.length} rooms, expected 5`);
  ok(rs.map((r) => r.row).join() === '0,1,2,3,4', `wing ${w.name} rows must be 0..4`);
}
ok(new Set(ROOMS.map((r) => r.id)).size === ROOMS.length, 'room ids unique');

/* ---- agents ↔ rooms ---- */
for (const a of AGENTS) {
  ok(ROOM_BY_ID[a.room], `${a.name} is stationed in unknown room "${a.room}"`);
  for (const t of a.tools) ok(TOOL_BY_ID[t], `${a.name} lists unknown tool "${t}"`);
}
const residents = ROOMS.filter((r) => r.agent).map((r) => r.agent);
ok(new Set(residents).size === residents.length, 'no two rooms share a resident agent');
for (const r of ROOMS) {
  if (r.agent) ok(AGENT_BY_ID[r.agent]?.room === r.id, `${r.name} names ${r.agent} as resident but that agent is stationed elsewhere`);
  if (r.venture) ok(VENTURES.some((v) => v.id === r.venture), `${r.name} names unknown venture "${r.venture}"`);
}
ok(ROOMS.filter((r) => !r.agent).every((r) => r.id === 'council' || r.annex),
  'only THE COUNCIL and the annexes have no resident');

/* ---- permissions: the standing rules ---- */
for (const a of AGENTS) {
  for (const cap of CAP_IDS) {
    const g = a.caps[cap];
    ok(GRADES.includes(g), `${a.name}.${cap} has invalid grade "${g}"`);
    ok(g !== 'allow', `${a.name} holds "allow" on ${cap} — no agent may`);
  }
  ok(a.caps.spend === 'deny', `${a.name} holds "${a.caps.spend}" on spend — spend is deny for the entire network`);
}
ok(TOOL_BY_ID.notion?.state === 'read-only', 'Notion must be read-only for the entire network');

/* ---- skills cannot out-rank their agent ---- */
for (const s of SKILLS) {
  const a = AGENT_BY_ID[s.agent];
  ok(a, `skill ${s.id} names unknown agent "${s.agent}"`);
  ok(ROOM_BY_ID[s.room], `skill ${s.id} names unknown room "${s.room}"`);
  if (a) {
    ok(a.skills.includes(s.id), `${a.name} does not list skill "${s.id}" — register it on the agent`);
    ok(a.caps.write !== 'deny' && a.caps.write !== 'read', `skill ${s.id} writes drafts but ${a.name} cannot draft`);
    for (const w of s.writes) {
      ok(!w.startsWith('01-System'), `skill ${s.id} may not write to 01-System (that is the change capability, graded ${a.caps.change})`);
    }
    for (const t of s.reads) {
      if (TOOL_BY_ID[t]) ok(a.tools.includes(t), `skill ${s.id} reads tool "${t}" its agent does not carry`);
    }
  }
}

/* ---- governance: every tool is policed, no agent exceeds its ceiling, deny always wins ---- */
for (const t of TOOLS) {
  const p = TOOL_POLICY[t.id];
  ok(p, `tool "${t.id}" has no entry in TOOL_POLICY — an unregistered policy must fail closed, and cannot if it does not exist`);
  if (p) {
    ok(CAP_IDS.includes(p.requiresCap), `${t.id}'s policy requires unknown capability "${p.requiresCap}"`);
    ok(GRADES.includes(p.minGrade), `${t.id}'s policy floor "${p.minGrade}" is not a grade`);
    ok(RISK_LEVELS.includes(p.risk), `${t.id}'s policy risk "${p.risk}" is not a risk level`);
  }
}
// Every tool an agent lists is one its brief says it uses, so its own
// ceiling denying that tool outright is always a config mistake, not a
// legitimate "not yet" — resolvePermission is the single place that
// decides this, so the validator asks it rather than re-deriving the rule.
for (const a of AGENTS) {
  for (const t of a.tools) {
    const r = resolvePermission(a, t, { room: a.room });
    ok(r.level !== 'deny', `${a.name} carries the tool "${t}" but its own ceiling denies it: ${r.reason}`);
  }
}

/* ---- the draft lifecycle is closed: every move lands on a known state, every state has a view, only humans move past draft ---- */
for (const [from, tos] of Object.entries(DRAFT_TRANSITIONS)) {
  ok(DRAFT_STATES.includes(from), `draft transition from unknown state "${from}"`);
  for (const to of tos) ok(DRAFT_STATES.includes(to), `draft transition ${from} → unknown state "${to}"`);
}
for (const st of DRAFT_STATES) ok(DRAFT_TRANSITIONS[st], `draft state "${st}" has no transitions (dead end must be explicit: [])`);
const viewed = DRAFT_VIEWS.flatMap((v) => v.states);
for (const st of DRAFT_STATES) ok(viewed.includes(st), `draft state "${st}" appears in no BEACON view`);
ok(new Set(viewed).size === viewed.length, 'a draft state appears in two BEACON views');

/* ---- report ---- */
if (fails.length) {
  console.error(`\n✗ config invalid — ${fails.length} problem${fails.length > 1 ? 's' : ''}:\n`);
  for (const f of fails) console.error('  · ' + f);
  console.error();
  process.exit(1);
}
console.log(`✓ config valid — ${AGENTS.length} agents (${COUNCIL.length} seated), ${MAIN.length} rooms in ${WINGS.length} wings + ${ROOMS.length - MAIN.length} annex, ${SKILLS.length} skill${SKILLS.length === 1 ? '' : 's'}, ${TOOLS.filter((t) => t.state !== 'not wired').length}/${TOOLS.length} tools wired. No agent holds allow. Spend is deny everywhere. Notion is read-only.`);
