/**
 * The Council — nine seats, one verdict.
 *
 * POST { code, question, context } → { positions: [{seat, position, concern}], verdict, conditions, dissent, summary }
 * One structured call, not one per seat: every position is grounded in the
 * same brief, and the prompt asks for disagreement — a council where
 * everyone agrees is worthless. The verdict is ARCANE's synthesis.
 */
import { json, knownDevice, client, systemContext, MODEL, SEATS, VERDICT_LIST } from './_lib.js';

const schema = {
  type: 'object', additionalProperties: false,
  properties: {
    positions: { type: 'array', minItems: SEATS.length, maxItems: SEATS.length, items: { type: 'object', additionalProperties: false, properties: {
      seat: { type: 'string', enum: SEATS.map((s) => s.name) }, position: { type: 'string', description: 'This seat speaking from its own domain, in its own voice. Three or four sentences.' }, concern: { type: 'string', description: 'The one thing this seat wants true before it says yes, or empty.' }, leans: { type: 'string', enum: VERDICT_LIST } },
      required: ['seat', 'position', 'concern', 'leans'] } },
    verdict: { type: 'string', enum: VERDICT_LIST },
    conditions: { type: 'array', items: { type: 'string' }, description: 'What must be true first. Concrete, checkable.' },
    dissent: { type: 'string', description: 'Who disagreed with the verdict and why, recorded not smoothed over. Empty only if no seat leaned differently.' },
    summary: { type: 'string', description: 'ARCANE returning the verdict to Leo in five lines or fewer.' },
  }, required: ['positions', 'verdict', 'conditions', 'dissent', 'summary'],
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST' });
  const { code, question, context = {} } = req.body || {};
  if (!question?.trim()) return json(res, 400, { error: 'no question' });
  if (!(await knownDevice(code))) return json(res, 403, { error: 'unknown device — open the floor once with sync on' });
  const c = client();
  if (!c) return json(res, 503, { error: 'the reasoning layer is not wired: set ANTHROPIC_API_KEY in the Vercel project' });
  try {
    const seats = SEATS.map((s) => `- ${s.name}, ${s.role}, weight ${s.weight}: ${s.domain}. ${s.brief}`).join('\n');
    const system = [
      { type: 'text', text: systemContext(context), cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `A real decision is being put to the Council. The seats, in speaking order (lowest weight speaks last and synthesises):\n${seats}\n\nEach seat answers only from its own domain and in its own voice; they must not all agree — where the domains pull different ways, say so. ARCANE weighs them and returns ONE verdict from ${VERDICT_LIST.join(', ')} with the conditions that must be true first, and records the dissent. Apply the decision principles in order: revenue before vanity; systems over hustle; no permission needed; the compounding test; the contrarian filter.` },
    ];
    const r = await c.messages.create({ model: MODEL, max_tokens: 8000, system, messages: [{ role: 'user', content: `The decision: ${question}` }], thinking: { type: 'adaptive' }, output_config: { effort: 'high', format: { type: 'json_schema', schema } } });
    if (r.stop_reason === 'refusal') return json(res, 200, { positions: [], verdict: 'WATCH', conditions: [], dissent: '', summary: 'The Council will not sit on that one.' });
    const out = JSON.parse(r.content.find((b) => b.type === 'text')?.text || '{}');
    return json(res, 200, { ...out, usage: { in: r.usage.input_tokens, out: r.usage.output_tokens, cached: r.usage.cache_read_input_tokens || 0 } });
  } catch (e) {
    const status = e.status === 429 ? 429 : e.status === 401 ? 503 : 502;
    return json(res, status, { error: /credit balance/i.test(e.message) ? 'the Anthropic account has no credits' : e.message });
  }
}
