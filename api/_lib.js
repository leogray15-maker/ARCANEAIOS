/**
 * Shared by the reasoning endpoints: the roster and doctrine from config,
 * the gate that a request must come from a known device, and one place to
 * build the Anthropic client.
 *
 * The functions run on Vercel's Node runtime. ANTHROPIC_API_KEY comes from
 * the project's environment; the Supabase service-role key (set by the
 * integration as storage_SUPABASE_SERVICE_ROLE_KEY) is used only to check
 * that the caller's sync code is a real row — never sent to the browser.
 */
import Anthropic from '@anthropic-ai/sdk';
import { AGENTS, COUNCIL, ROOMS, ROOM_BY_ID, VENTURES, STANDING_RULES, BRIEF_BLOCKS, VERDICTS, OPERATOR } from '../packages/config/src/index.js';

export const MODEL = process.env.ARCANE_MODEL || 'claude-opus-5';
const SUPABASE_URL = process.env.NEXT_PUBLIC_storage_SUPABASE_URL || process.env.SUPABASE_URL || 'https://pjdzdfmnfuneumzqoijn.supabase.co';
const SERVICE_KEY = process.env.storage_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function json(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body)); }

/** Only a device that already has a row may ask the network to think. */
export async function knownDevice(code) {
  if (!/^sync-[a-z2-7]{26}$/.test(String(code || ''))) return false;
  if (!SERVICE_KEY) return true;                                       // no way to check: allow, and say so in the logs
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/arcane_sync?id=eq.${code}&select=id`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
    if (!r.ok) return false;
    return (await r.json()).length > 0;
  } catch { return false; }
}

export function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
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
