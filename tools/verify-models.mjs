#!/usr/bin/env node
// @ts-check
/**
 * Does every model in packages/ai/src/models.js exist?
 *
 *   npm run models:verify
 *
 * OpenRouter's catalogue is public, so its ids are always checked. Gemini,
 * Groq, xAI and DeepSeek list their models only to a key-holder, so those
 * are checked when the key is in the environment (or .env) and reported
 * as "unchecked" otherwise. Beyond existence it flags a model we call free
 * that the catalogue prices, a price that has drifted by more than 10%,
 * and a capability we rely on (tools, structured output) that has gone.
 *
 * Exit 1 when a configured id does not exist or a "free" model is priced:
 * either would fail or cost money at run time.
 */
import { MODEL_LIST } from '../packages/ai/src/models.js';
import { PROVIDERS } from '../packages/ai/src/providers.js';
import { loadEnv } from '../packages/database/src/index.js';
import { z } from 'zod';

loadEnv();
const env = process.env;

const OpenRouterModels = z.object({ data: z.array(z.object({ id: z.string(), pricing: z.object({ prompt: z.string(), completion: z.string() }).loose(), context_length: z.number().nullable().optional(), supported_parameters: z.array(z.string()).optional() }).loose()) });
const IdList = z.object({ data: z.array(z.object({ id: z.string() }).loose()) });
const GeminiList = z.object({ models: z.array(z.object({ name: z.string() }).loose()), nextPageToken: z.string().optional() });

/** @type {string[]} */ const problems = [];
/** @type {string[]} */ const warnings = [];
/** @param {string} line */ const say = (line) => console.log(line);

/** @param {string} url @param {Record<string, string>} [headers] */
async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url.replace(/key=[^&]+/, 'key=…')} → ${r.status}`);
  return /** @type {unknown} */ (await r.json());
}

// ---- OpenRouter
say('OpenRouter (public catalogue)');
const orModels = MODEL_LIST.filter((m) => m.provider === 'openrouter');
try {
  const cat = OpenRouterModels.parse(await getJson('https://openrouter.ai/api/v1/models'));
  const byId = new Map(cat.data.map((x) => [x.id, x]));
  for (const m of orModels) {
    const x = byId.get(m.id);
    if (!x) { problems.push(`${m.key}: ${m.id} is not in OpenRouter's catalogue`); say(`  ✗ ${m.id} — not found`); continue; }
    const pin = Number(x.pricing.prompt) * 1e6, pout = Number(x.pricing.completion) * 1e6;
    const catalogueFree = pin === 0 && pout === 0;
    const params = x.supported_parameters || [];
    const notes = [catalogueFree ? 'free' : `$${+pin.toFixed(4)}/$${+pout.toFixed(4)} per M`];
    if (m.free && !catalogueFree) problems.push(`${m.key}: configured free but priced $${pin}/$${pout} per M`);
    if (!m.free && catalogueFree && m.id !== 'openrouter/free') warnings.push(`${m.key}: configured paid but the catalogue lists it free`);
    if (!m.free) {
      const drift = (/** @type {number} */ a, /** @type {number} */ b) => (b === 0 ? a !== 0 : Math.abs(a - b) / b > 0.1);
      if (drift(pin, m.price.in) || drift(pout, m.price.out)) warnings.push(`${m.key}: price drift — configured $${m.price.in}/$${m.price.out}, catalogue $${+pin.toFixed(4)}/$${+pout.toFixed(4)} per M`);
    }
    if (m.tools && params.length && !params.includes('tools')) warnings.push(`${m.key}: configured with tools, the catalogue does not list tools`);
    if (m.json === 'schema' && params.length && !params.includes('structured_outputs')) warnings.push(`${m.key}: configured json=schema, the catalogue does not list structured_outputs`);
    say(`  ✓ ${m.id} — ${notes.join(', ')}`);
  }
} catch (e) { problems.push(`could not read OpenRouter's catalogue: ${e instanceof Error ? e.message : String(e)}`); }

// ---- Gemini (needs a key)
const gem = MODEL_LIST.filter((m) => m.provider === 'gemini');
say('\nGemini (Google AI Studio)');
if (!env.GEMINI_API_KEY) { for (const m of gem) say(`  ? ${m.id} — unchecked (no GEMINI_API_KEY)`); warnings.push('Gemini ids unchecked: set GEMINI_API_KEY to verify them'); }
else {
  try {
    /** @type {Set<string>} */ const names = new Set(); let token = '';
    do {
      const page = GeminiList.parse(await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${token ? `&pageToken=${token}` : ''}`, { 'x-goog-api-key': env.GEMINI_API_KEY }));
      for (const x of page.models) names.add(x.name.replace(/^models\//, ''));
      token = page.nextPageToken || '';
    } while (token);
    for (const m of gem) { if (names.has(m.id)) say(`  ✓ ${m.id}`); else { problems.push(`${m.key}: ${m.id} is not in the Gemini model list`); say(`  ✗ ${m.id} — not found`); } }
  } catch (e) { problems.push(`could not list Gemini models: ${e instanceof Error ? e.message : String(e)}`); }
}

// ---- the optional providers: list what the key can see, check any configured ids
for (const pid of /** @type {const} */ (['groq', 'xai', 'deepseek'])) {
  const p = PROVIDERS[pid]; const mine = MODEL_LIST.filter((m) => m.provider === pid);
  const key = env[p.keyEnv];
  if (!key) { if (mine.length) warnings.push(`${p.name} ids unchecked: set ${p.keyEnv}`); continue; }
  say(`\n${p.name}`);
  try {
    const list = IdList.parse(await getJson(`${p.baseUrl}/models`, { Authorization: `Bearer ${key}` }));
    const ids = new Set(list.data.map((x) => x.id));
    for (const m of mine) { if (ids.has(m.id)) say(`  ✓ ${m.id}`); else { problems.push(`${m.key}: ${m.id} is not in ${p.name}'s list`); say(`  ✗ ${m.id}`); } }
    if (!mine.length) say(`  (none configured; the key can see ${ids.size}: ${[...ids].slice(0, 12).join(', ')}${ids.size > 12 ? ', …' : ''})`);
  } catch (e) { warnings.push(`could not list ${p.name} models: ${e instanceof Error ? e.message : String(e)}`); }
}

if (warnings.length) { say('\nWarnings'); for (const w of warnings) say(`  · ${w}`); }
if (problems.length) { say('\nProblems'); for (const x of problems) say(`  ✗ ${x}`); }
say(problems.length ? `\n✗ ${problems.length} problem${problems.length === 1 ? '' : 's'} — fix packages/ai/src/models.js` : `\n✓ every configured model checked exists (${MODEL_LIST.length} configured)`);
process.exit(problems.length ? 1 : 0);
