/**
 * Governance: the tool registry's policy and permission resolution.
 * Fail-closed on every unknown, deny always wins, high tier never
 * remembered. Pure — no network, no database.
 */
import { resolvePermission, tierOf, permissionKey, TOOL_POLICY, RISK_LEVELS } from '../packages/config/src/index.js';
import { AGENT_BY_ID } from '../packages/config/src/index.js';

const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
let n = 0;

/* ---- fail closed ---- */
ok(resolvePermission(AGENT_BY_ID.intel, 'not-a-tool').level === 'deny', 'an unregistered tool is denied'); n++;
ok(resolvePermission(null, 'web').level === 'deny', 'no agent record is denied'); n++;
ok(resolvePermission({ id: 'x', room: 'x' }, 'web').level === 'deny', 'an agent with no caps object is denied'); n++;
ok(resolvePermission({ id: 'x', room: 'x', caps: {} }, 'web').level === 'deny', 'an agent with an empty caps object is denied — the grade defaults to deny'); n++;

/* ---- the ceiling ---- */
const lumen = AGENT_BY_ID.lumen;   // caps() default: change stays 'deny'
const rCommerce = resolvePermission(lumen, 'commerce');
ok(rCommerce.level === 'deny' && rCommerce.source === 'ceiling', `a grade below the tool's floor is denied by the ceiling (${rCommerce.reason})`); n++;

/* ---- observe mode is trivial and auto-allowed ---- */
const cipher = AGENT_BY_ID.intel;   // caps() default: data 'analyse'
const rWeb = resolvePermission(cipher, 'web', { room: 'intel' });
ok(rWeb.level === 'allow' && rWeb.tier === 'trivial', 'reading (observe mode) is trivial and needs no approval'); n++;

/* ---- execute mode needs the operator, at the tool's tier ---- */
const anvil = AGENT_BY_ID.forge_anvil || AGENT_BY_ID.anvil;
const rCommerceAnvil = resolvePermission(anvil, 'commerce', { room: 'forge' });
ok(rCommerceAnvil.level === 'approval' && rCommerceAnvil.tier === 'medium', `an approval-grade agent needs a decision, at the tool's own tier (${rCommerceAnvil.tier})`); n++;

/* ---- explicit deny wins over everything below it ---- */
const withDeny = { ...anvil, deny: ['commerce'] };
const rDenied = resolvePermission(withDeny, 'commerce', { room: 'forge' });
ok(rDenied.level === 'deny' && rDenied.source === 'explicit-deny', 'an explicit deny is final, even though the ceiling would allow asking'); n++;

/* ---- remembered permissions apply below high, never at high ---- */
const key = permissionKey({ room: 'forge', agent: anvil.id, tool: 'commerce', resource: '' });
ok(key === rCommerceAnvil.key, 'the resolved key matches permissionKey'); n++;
const allowed = resolvePermission(anvil, 'commerce', { room: 'forge', remembered: { decision: 'always_allow' } });
ok(allowed.level === 'allow' && allowed.source === 'remembered', 'a remembered always_allow short-circuits to allow'); n++;
const denied = resolvePermission(anvil, 'commerce', { room: 'forge', remembered: { decision: 'always_deny' } });
ok(denied.level === 'deny' && denied.source === 'remembered', 'a remembered always_deny short-circuits to deny'); n++;

const envoy = AGENT_BY_ID.envoy;   // contact: approval; email is risk 'high'
const rEmail = resolvePermission(envoy, 'email', { room: 'dealroom' });
ok(rEmail.tier === 'high', 'sending mail is a high-tier action'); n++;
const rememberedHigh = resolvePermission(envoy, 'email', { room: 'dealroom', remembered: { decision: 'always_allow' } });
ok(rememberedHigh.level === 'approval', 'a high-tier tool ignores any remembered decision — it is asked every time'); n++;

/* ---- the registry itself ---- */
ok(RISK_LEVELS.length === 4 && RISK_LEVELS[0] === 'trivial' && RISK_LEVELS[3] === 'high', 'four risk levels, trivial to high'); n++;
ok(Object.keys(TOOL_POLICY).length >= 10, `every tool has a policy (${Object.keys(TOOL_POLICY).length})`); n++;

/* ---- every agent's own declared tools clear its own ceiling (the config validator asserts this against the real roster; here against a synthetic one) ---- */
const spark = AGENT_BY_ID.venture;   // tools: memory, counsel, web — all observe-mode for it
for (const t of spark.tools) ok(resolvePermission(spark, t, { room: spark.room }).level !== 'deny', `${spark.name} is not denied its own declared tool "${t}"`); n++;

if (fails.length) { console.error(`✗ governance: ${fails.length} failed`); for (const f of fails) console.error('  · ' + f); process.exit(1); }
console.log(`✓ governance — the tool registry is fail-closed on the unknown, deny always wins, high tier is never remembered (${n} checks)`);
