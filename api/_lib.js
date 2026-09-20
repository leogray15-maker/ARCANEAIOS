/**
 * Shared by every API function: the roster and doctrine from config, the
 * operator gate (`_auth.js`), one database client and one Anthropic client.
 *
 * The functions run on Vercel's Node runtime. ANTHROPIC_API_KEY,
 * ARCANE_OPERATOR_KEY and the Supabase service-role key (set by the
 * integration as storage_SUPABASE_SERVICE_ROLE_KEY) come from the
 * project's environment and never reach the browser.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AGENTS, COUNCIL, ROOMS, ROOM_BY_ID, VENTURES, STANDING_RULES, BRIEF_BLOCKS, VERDICTS, OPERATOR } from '../packages/config/src/index.js';
import { openDb } from '../packages/database/src/dev.js';
import { classify, withRetry } from '../packages/database/src/resilience.js';
export { classify, withRetry };
export { json, guard, operator } from './_auth.js';

export const MODEL = process.env.ARCANE_MODEL || 'claude-opus-5';

/**
 * One database client per process. Throws a DatabaseError (503) when the
 * service key is missing, which `guard` turns into a plain answer. On a
 * laptop, ARCANE_DB=memory gives the dev database instead (the real index
 * from disk, content kept in data/dev-db.json); Vercel never builds that.
 */
let DB = null;
export function db() { return DB || (DB = openDb()); }

export function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

/**
 * What to tell Leo when a call to the model fails. The credit case is the
 * one that gets confused with something else: API credits are bought at
 * console.anthropic.com and are not the same thing as a Claude
 * subscription, so a subscription whose limit has just reset still leaves
 * the API unfunded. Say that, rather than "502".
 */
export function modelFailure(e) {
  const msg = e?.message || String(e);
  const { kind, suggestion } = classify(e?.status, msg);
  if (/credit balance/i.test(msg)) return { status: 402, error: 'the Anthropic account has no API credits — top up at console.anthropic.com → Plans & Billing. API credits are bought separately from a Claude subscription, so a subscription limit resetting does not fund this.', kind: 'ESCALATE', suggestion };
  if (e?.status === 401) return { status: 503, error: 'the ANTHROPIC_API_KEY is not valid — check it in the Vercel project settings', kind: 'ESCALATE', suggestion };
  if (e?.status === 429) return { status: 429, error: 'the Anthropic account is rate limited — try again in a moment', kind: 'RETRYABLE', suggestion };
  if (e?.status === 529 || /overloaded/i.test(msg)) return { status: 503, error: 'the model is overloaded — try again in a moment', kind: 'RETRYABLE', suggestion };
  return { status: 502, error: msg, kind, suggestion };
}

/** What every agent knows about the empire before it speaks. */
export function systemContext(ctx = {}) {
  const roster = AGENTS.map((a) => `- ${a.name} (${a.role}, ${ROOM_BY_ID[a.room].name}): ${a.domain}. ${a.brief}`).join('\n');
  const rules = STANDING_RULES.map((r) => `- ${r.text}`).join('\n');
  const ventures = VENTURES.map((v) => `- ${v.name}: ${v.kind}, ${v.model}. ${v.facts.join('; ')}`).join('\n');
  const brief = ctx.brief?.blocks ? BRIEF_BLOCKS.map((b) => `### ${b.name}\n${(ctx.brief.blocks[b.id] || []).map((row) => '- ' + Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' · ')).join('\n') || '(empty)'}`).join('\n\n') : '(no brief supplied)';
  const orders = (ctx.orders || []).map((o) => `- [${o.priority || 'P2'}] ${o.room}: ${o.text}${o.holder ? ` (${o.holder})` : ''}`).join('\n') || '(none)';
  const memory = ctx.memory ? Object.entries(ctx.memory).filter(([k]) => k !== 'ventures').map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`).join('\n') : '';
  const extra = ctx.extra ? `\n\n## LIVE NUMBERS\n${ctx.extra}` : '';
  return `You are inside THE ARCANE, the operating system of ${OPERATOR.name}'s ventures. ${OPERATOR.note}
Brief date: ${ctx.brief?.date || 'unknown'}. Doctrine this week: ${ctx.doctrine || '(none stated)'}.

## STANDING RULES (enforced in code; you cannot bend them)
${rules}

## VENTURES
${ventures}

## THE NETWORK
${roster}

## THE BRIEF
${brief}

## OPEN ORDERS
${orders}

## SHARED MEMORY
${memory}${extra}

Never invent a figure. If a number is not in the brief or memory, say it is unknown and what would supply it. Never make a medical, dosing or treatment claim about any compound. Never promise a return. Speak plainly: short sentences, numbers where they exist, no corporate tone.`;
}

export const SEATS = COUNCIL;
export const VERDICT_LIST = VERDICTS;
export const ROOM_LIST = ROOMS;
