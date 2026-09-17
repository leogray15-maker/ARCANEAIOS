/**
 * Counsel — Leo ↔ ARCANE.
 *
 * POST { code, question, context, history? } → { answer, order? }
 * ARCANE answers from the brief and shared memory, may pull one specialist
 * in by name, and may propose exactly one order for a room. It never acts;
 * the operator adds the order if he wants it.
 */
import { json, knownDevice, client, systemContext, MODEL, ROOM_LIST } from './_lib.js';

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    answer: { type: 'string', description: 'ARCANE speaking to Leo. Direct. Short lines. Numbers only if known.' },
    specialist: { type: 'string', description: 'The one crew member whose domain this touches most, by NAME in capitals, or empty.' },
    order: { type: ['object', 'null'], additionalProperties: false, properties: { room: { type: 'string', enum: ROOM_LIST.map((r) => r.id) }, text: { type: 'string' }, priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] }, actor: { type: 'string', enum: ['human', 'agent'] } }, required: ['room', 'text', 'priority', 'actor'] },
  }, required: ['answer', 'specialist', 'order'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST' });
  const { code, question, context = {}, history = [] } = req.body || {};
  if (!question?.trim()) return json(res, 400, { error: 'no question' });
  if (!(await knownDevice(code))) return json(res, 403, { error: 'unknown device — open the floor once with sync on' });
  const c = client();
  if (!c) return json(res, 503, { error: 'the reasoning layer is not wired: set ANTHROPIC_API_KEY in the Vercel project' });
  try {
    const system = [
      { type: 'text', text: systemContext(context), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'You are ARCANE, the Commander. You hold the state of everything and decide which specialist works next. Counsel is a conversation: answer the operator from the brief, name the one specialist it concerns if any, and propose at most one order — the smallest next action, routed to the right room, with a priority — or null if nothing should change. You do not execute anything.' },
    ];
    const messages = [...history.slice(-8).map((h) => ({ role: h.who === 'leo' ? 'user' : 'assistant', content: h.text })), { role: 'user', content: question }];
    const r = await c.messages.create({ model: MODEL, max_tokens: 4000, system, messages, thinking: { type: 'adaptive' }, output_config: { effort: 'medium', format: { type: 'json_schema', schema } } });
    if (r.stop_reason === 'refusal') return json(res, 200, { answer: 'I will not answer that one.', specialist: '', order: null });
    const out = JSON.parse(r.content.find((b) => b.type === 'text')?.text || '{}');
    return json(res, 200, { ...out, usage: { in: r.usage.input_tokens, out: r.usage.output_tokens, cached: r.usage.cache_read_input_tokens || 0 } });
  } catch (e) {
    const status = e.status === 429 ? 429 : e.status === 401 ? 503 : 502;
    return json(res, status, { error: /credit balance/i.test(e.message) ? 'the Anthropic account has no credits' : e.message });
  }
}
