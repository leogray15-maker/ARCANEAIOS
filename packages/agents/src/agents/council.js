// @ts-check
/**
 * THE COUNCIL, multi-model — THE COUNCIL, owned by ARCANE.
 *
 * Leo puts a question. One seat per lab answers it independently and in
 * parallel — Anthropic, OpenAI, xAI, Google, DeepSeek, NVIDIA, Thinking
 * Machines, Qwen, Nous — each seat filled by whichever of its models may
 * be called (free ones always; paid ones only with ALLOW_PAID_MODELS and
 * budget). A judge from the thinker tier, preferring a model that did not
 * sit, then reads every answer and returns one verdict: where the seats
 * agreed, where they split and who said what, and the call.
 *
 * This sits beside the original Council (api/council.js: nine roster
 * seats, one Claude call). That one asks "what would each of my agents
 * say"; this one asks "what do different models actually think".
 */
import { z } from 'zod';
import { COUNCIL_PANEL, TIERS, MODELS, AiError } from '../../../ai/src/index.js';
import { VERDICTS } from '../../../config/src/index.js';

/** @type {string[]} */
const VERDICT_LIST = VERDICTS;

const CALLS = /** @type {[string, ...string[]]} */ (['ANSWER', ...VERDICT_LIST]);
const Verdict = z.object({
  call: z.enum(CALLS),
  headline: z.string().min(3).max(300),
  agreed: z.array(z.string().max(400)).max(8),
  disagreed: z.array(z.object({ point: z.string().max(300), positions: z.array(z.object({ seat: z.string().max(60), stance: z.string().max(400) })).max(10) })).max(8),
  reasoning: z.string().min(10).max(3000),
  conditions: z.array(z.string().max(300)).max(8),
  confidence: z.enum(['low', 'medium', 'high']),
});

/** @type {import('../registry.js').AgentDef} */
export const council = {
  id: 'council', name: 'THE COUNCIL', room: 'council', owner: 'arcane',
  description: 'Puts one question to several different models in parallel, then a judge compares their answers and gives a verdict with where they agreed and disagreed.',
  tier: 'thinker', schedule: '', budgetGbpPerRun: 0.25, maxSteps: COUNCIL_PANEL.length + 2, maxDurationMs: 200_000,
  tools: ['outputs.save'], outputType: 'verdict', runPrefix: 'CNL-R',
  input: z.object({ question: z.string().trim().min(5, 'ask a real question').max(2_000), context: z.string().max(4_000).optional() }),
  instructions: 'Answer the question directly, from your own judgement. Take a position. Give the strongest reason for it and the strongest reason against. Under 250 words. No preamble.',
  run: async (ctx) => {
    const question = String(ctx.input.question);
    const context = ctx.input.context ? `\n\nContext from Leo:\n${String(ctx.input.context)}` : '';
    await ctx.heartbeat(`seating ${COUNCIL_PANEL.length} seats`);
    const seated = await Promise.allSettled(COUNCIL_PANEL.map(async (seat) => {
      const r = await ctx.model({ chain: seat.chain, messages: [{ role: 'system', content: ctx.system }, { role: 'user', content: question + context }], maxTokens: 700, temperature: 0.6 });
      return { seat: seat.seat, model: r.model, modelId: r.servedModel || r.modelId, label: MODELS[r.model]?.label || r.model, free: r.free, text: r.text.trim(), costGbp: r.costGbp, latencyMs: r.latencyMs };
    }));
    const answers = [], absent = [];
    for (const [i, s] of seated.entries()) {
      if (s.status === 'fulfilled' && s.value.text) answers.push(s.value);
      else absent.push({ seat: COUNCIL_PANEL[i].seat, reason: s.status === 'rejected' ? (s.reason instanceof AiError ? s.reason.attempts.map((a) => `${a.model}: ${a.reason}`).join('; ') || s.reason.message : String(s.reason?.message || s.reason)) : 'empty answer' });
    }
    if (answers.length < 2) throw new Error(`only ${answers.length} seat${answers.length === 1 ? '' : 's'} could sit — the Council needs two. ${absent.map((a) => `${a.seat}: ${a.reason}`).join(' | ').slice(0, 600)}`);

    // The judge: the thinker tier, preferring a model that did not answer.
    const used = new Set(answers.map((a) => a.model));
    const judgeChain = TIERS.thinker.filter((k) => !used.has(k));
    const transcript = answers.map((a, i) => `### Seat ${i + 1}: ${a.seat} (${a.label})\n${a.text}`).join('\n\n');
    await ctx.heartbeat(`judging ${answers.length} answers`);
    const j = await ctx.model({
      ...(judgeChain.length ? { chain: [...judgeChain, ...TIERS.thinker.filter((k) => used.has(k))] } : { tier: 'thinker' }),
      messages: [
        { role: 'system', content: `${ctx.system}\n\nYou are the judge. Several models answered the same question independently. Compare them; do not add a view of your own beyond weighing theirs. Say plainly where they agreed and where they split, naming the seats on each side. Then make the call: ${VERDICT_LIST.join(', ')} for a decision about what to do (BUILD go, DELAY not yet, WATCH keep an eye, KILL stop), or ANSWER when the question is not a decision. Conditions: what must be true first, concrete and checkable.` },
        { role: 'user', content: `Question: ${question}${context}\n\n${transcript}` },
      ],
      schema: Verdict, schemaName: 'verdict', maxTokens: 1_800, temperature: 0.2,
    });
    const verdict = Verdict.parse(j.data);
    const data = { question, answers, absent, verdict, judge: { model: j.model, modelId: j.servedModel || j.modelId, label: MODELS[j.model]?.label || j.model } };
    await ctx.tool('outputs.save', { type: 'verdict', title: question.slice(0, 200), content: `${verdict.call}: ${verdict.headline}\n\n${verdict.reasoning}`, data });
    return { summary: `${verdict.call}: ${verdict.headline} (${answers.length} seats, judged by ${data.judge.label})`, data };
  },
};
