#!/usr/bin/env node
// @ts-check
/**
 * Import a curated set of personas from msitarzewski/agency-agents (MIT)
 * as the persona library THE AGENT GARAGE crafts agents from.
 *
 *   git clone --depth 1 https://github.com/msitarzewski/agency-agents.git /tmp/agency-agents
 *   npm run personas:import -- /tmp/agency-agents
 *
 * Writes packages/agents/src/personas.generated.js — a generated file:
 * change the list below and re-run, never edit the output. Emojis are
 * stripped on the way in (the repo carries none), the MIT notice is kept
 * as the licence requires, and personas whose job would bend a standing
 * rule are not on the list: nothing from healthcare (no medical claims),
 * nothing that pays or moves money (spend is deny), nothing that publishes
 * on its own (nothing publishes unattended).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'packages', 'agents', 'src', 'personas.generated.js');

/** [file in the clone, the room it suits, the tier it needs] */
const PICKS = /** @type {const} */ ([
  ['marketing/marketing-x-twitter-intelligence-analyst.md', 'beacon', 'thinker'],
  ['marketing/marketing-twitter-engager.md', 'beacon', 'writer'],
  ['marketing/marketing-tiktok-strategist.md', 'beacon', 'writer'],
  ['marketing/marketing-instagram-curator.md', 'beacon', 'writer'],
  ['marketing/marketing-social-media-strategist.md', 'beacon', 'thinker'],
  ['marketing/marketing-reddit-community-builder.md', 'beacon', 'writer'],
  ['paid-media/paid-media-creative-strategist.md', 'beacon', 'writer'],
  ['marketing/marketing-content-creator.md', 'scriptorium', 'writer'],
  ['marketing/marketing-email-strategist.md', 'scriptorium', 'writer'],
  ['marketing/marketing-linkedin-content-creator.md', 'scriptorium', 'writer'],
  ['marketing/marketing-book-co-author.md', 'scriptorium', 'writer'],
  ['research/research-synthesist.md', 'archives', 'thinker'],
  ['specialized/zk-steward.md', 'archives', 'grunt'],
  ['product/product-trend-researcher.md', 'observatory', 'thinker'],
  ['support/support-analytics-reporter.md', 'observatory', 'thinker'],
  ['product/product-feedback-synthesizer.md', 'market', 'grunt'],
  ['specialized/specialized-pricing-analyst.md', 'market', 'thinker'],
  ['finance/finance-financial-analyst.md', 'vault', 'thinker'],
  ['support/support-finance-tracker.md', 'vault', 'thinker'],
  ['marketing/marketing-growth-hacker.md', 'warroom', 'thinker'],
  ['specialized/business-strategist.md', 'warroom', 'thinker'],
  ['sales/sales-offer-lead-gen-strategist.md', 'dealroom', 'thinker'],
  ['specialized/specialized-chief-of-staff.md', 'bridge', 'thinker'],
  ['support/support-executive-summary-generator.md', 'bridge', 'grunt'],
  ['specialized/specialized-strategy-duel-agent.md', 'council', 'thinker'],
  ['specialized/personal-growth-mentor.md', 'sanctum', 'thinker'],
]);

/** Emoji and their joiners and variation selectors, then the double spaces they leave. @param {string} s */
const noEmoji = (s) => s.replace(/\p{Extended_Pictographic}|‍|️|⃣|[\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/[ \t]{2,}/g, ' ').replace(/^(#+) +/gm, '$1 ').replace(/[ \t]+$/gm, '');

/** @param {string} text */
function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  /** @type {Record<string, string>} */
  const data = {};
  if (m) for (const line of m[1].split('\n')) { const kv = /^([a-z_]+):\s*(.*)$/i.exec(line); if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim(); }
  return { data, body: m ? text.slice(m[0].length) : text };
}

const clone = process.argv[2];
if (!clone || !fs.existsSync(path.join(clone, 'LICENSE'))) { console.error('usage: npm run personas:import -- <path to a clone of msitarzewski/agency-agents>'); process.exit(1); }
const license = fs.readFileSync(path.join(clone, 'LICENSE'), 'utf8').trim();
let commit = '';
try { commit = fs.readFileSync(path.join(clone, '.git', 'HEAD'), 'utf8').trim(); if (commit.startsWith('ref:')) commit = fs.readFileSync(path.join(clone, '.git', commit.slice(5).trim()), 'utf8').trim(); } catch { /* not a git checkout */ }

const personas = PICKS.map(([file, room, tier]) => {
  const raw = fs.readFileSync(path.join(clone, file), 'utf8');
  const { data, body } = frontmatter(raw);
  const id = path.basename(file, '.md').replace(/^(marketing|product|research|specialized|finance|support|sales|paid-media)-/, '');
  const text = noEmoji(body).trim().slice(0, 16_000);
  if (/\p{Extended_Pictographic}/u.test(text)) throw new Error(`${file}: an emoji survived the strip`);
  return { id, name: noEmoji(data.name || id).trim(), description: noEmoji(data.description || '').trim(), room, tier, source: `agency-agents/${file}`, words: (text.match(/\S+/g) || []).length, text };
});

const header = `// @ts-check
// generated: true — by tools/personas-import.mjs from msitarzewski/agency-agents${commit ? ` @ ${commit.slice(0, 12)}` : ''}.
// Do not edit. Change the list in tools/personas-import.mjs and re-run it.
//
// The persona texts below are from The Agency (https://github.com/msitarzewski/agency-agents),
// used under its MIT licence, with emojis removed:
//
${license.split('\n').map((l) => `// ${l}`.trimEnd()).join('\n')}

/** @typedef {{ id: string, name: string, description: string, room: string, tier: 'grunt' | 'writer' | 'thinker', source: string, words: number, text: string }} Persona */

/** @type {Persona[]} */
export const PERSONAS = ${JSON.stringify(personas, null, 2)};
`;
fs.writeFileSync(OUT, header);
console.log(`✓ ${personas.length} personas → ${path.relative(REPO, OUT)} (${personas.reduce((n, p) => n + p.words, 0)} words)`);
