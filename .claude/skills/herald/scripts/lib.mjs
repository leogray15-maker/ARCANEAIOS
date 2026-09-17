/**
 * HERALD — shared library.
 *
 * Everything the four scripts agree on lives here: where things are, what
 * a format is, what a platform is, and the compliance patterns. SKILL.md
 * and references/ describe these for the model; this file is the version
 * the scripts actually run, so if they ever disagree, this one is right
 * and the prose needs fixing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(SKILL_DIR, '..', '..', '..');
// HERALD_DATA redirects the index elsewhere, the way HERALD_STAGING does
// for drafts — the tests use it so a run can never overwrite a real index.
export const DATA_DIR = process.env.HERALD_DATA ? path.resolve(process.env.HERALD_DATA) : path.join(REPO, 'data', 'archives');
export const INDEX_FILE = path.join(DATA_DIR, 'index.json');
export const MODULES_DIR = path.join(DATA_DIR, 'modules');
export const STAGING_DIR = path.resolve(REPO, process.env.HERALD_STAGING || '.herald-staging');

export const DEFAULT_EXPORT = '/Users/leogray/Desktop/Arcane Archives/notion-export-clean/The Arcane Archives';
/** The Obsidian vault that holds the Archives as notes (and the brain, by symlink). */
export const DEFAULT_VAULT = '/Users/leogray/Desktop/Arcane';
export const vaultDir = () => process.env.ARCANE_VAULT || DEFAULT_VAULT;

/**
 * The Obsidian note for a module, as a wikilink. Notion names its export
 * files `<title> <notionId>` with punctuation stripped, so the reliable
 * key is the id: scan the Archives folder once and match on it. Without
 * the vault, fall back to the stripped title.
 */
let notesById = null;
export function archivesNote(mod) {
  if (!mod?.notionId) return '';
  if (notesById === null) {
    notesById = {};
    const dir = path.join(vaultDir(), 'Arcane ARCHIVES');
    try { for (const f of fs.readdirSync(dir)) { const m = /\s([0-9a-f]{32})\.md$/i.exec(f); if (m) notesById[m[1]] = f.replace(/\.md$/, ''); } } catch {}
  }
  const name = notesById[mod.notionId] || `${mod.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim()} ${mod.notionId}`;
  return `[[${name}]]`;
}
export const exportDir = () => process.env.ARCANE_ARCHIVES_EXPORT || DEFAULT_EXPORT;

export const AGENT = 'HERALD';
export const SKILL = 'herald';
export const ID_PREFIX = 'HER';

/* ---------- formats ---------- */

/**
 * Five cuts of one idea. `words` is the range lint enforces; `structure`
 * is what lint checks beyond length. The ranges are deliberate: a short
 * that runs long is a medium with a weak edit, and a teaser over 60 words
 * has stopped teasing.
 */
export const FORMATS = {
  short:  { words: [30, 120],  platforms: ['X', 'Threads', 'Instagram', 'TikTok'], structure: 'hook + one turn + close' },
  medium: { words: [120, 350], platforms: ['Instagram', 'LinkedIn', 'X', 'Threads'], structure: 'hook → body → turn → close' },
  thread: { words: [150, 500], platforms: ['X', 'Threads'], structure: '5–9 numbered posts, each ≤ 280 chars, first is the hook, last is the close' },
  email:  { words: [180, 450], platforms: ['Email'], structure: 'Subject: / Preview: lines, blank line, body, one CTA, signed Leo' },
  teaser: { words: [20, 60],   platforms: ['TikTok', 'Instagram', 'YouTube', 'Kick', 'X'], structure: 'one open loop that points at the module or the Archives' },
};
export const FORMAT_IDS = Object.keys(FORMATS);

export const PLATFORMS = ['X', 'Threads', 'Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Email', 'Kick'];
export const STATUSES = ['draft', 'review', 'approved', 'scheduled', 'posted', 'killed'];
export const CTAS = ['none', 'archives', 'reply', 'follow', 'link'];

/* ---------- content lanes ---------- */

/**
 * Subjects fall into lanes. A lane says what the content is *for* and how
 * carefully it must be handled. `sensitive` lanes always trip the
 * compliance gate and are excluded from picks unless asked for by name.
 */
export const LANES = [
  { id: 'external',   sensitive: true,  match: /^$/ },   // set by the indexer for reposted third-party pieces; never matched by name
  { id: 'meta',       sensitive: false, match: /welcome|^\+ courses/i },
  { id: 'health',     sensitive: true,  match: /biohack|bulking|health|healing|glitched brain|vessel|diet|sleep|skin|gut/i },
  { id: 'lifestyle',  sensitive: false, match: /playboy|ai girl|terminate|premium archive/i },
  { id: 'dark',       sensitive: false, match: /dark psych|hijack|manipulat|red book|silent grind|isolation/i },
  { id: 'sales',      sensitive: false, match: /sales|copywriting|inbound|product|brand|content playbook|business|prints/i },
  { id: 'trading',    sensitive: true,  match: /trading|investing|getting rich/i },
  { id: 'philosophy', sensitive: false, match: /stoic|philosoph|principles|thinking|mental models|reality|rules for life|top 1%/i },
  { id: 'mindset',    sensitive: false, match: /mindset|discipline|procrastinat|leadership|quests|escaping|writing psychology|behavio|^t$/i },
];

export function laneFor(subject) {
  for (const l of LANES) if (l.match.test(subject)) return l;
  return { id: 'mindset', sensitive: false };
}

/* ---------- compliance ---------- */

/**
 * Two tiers. HARD patterns block a draft outright: dosing units, dosing
 * verbs, named compounds, medical-claim verbs next to a condition, and
 * guaranteed-return language. WARN patterns let the draft through but are
 * recorded in `compliance_notes` so a human reads that line twice.
 *
 * The condition list is what makes "heal" a problem: "heal your gut" is a
 * medical claim, "heal your relationship with money" is a metaphor. A verb
 * alone is not enough; a verb and a condition in one sentence is.
 */
const CLAIM_VERBS = /\b(cures?|curing|cured|treats?|treating|treated|treatment|heals?|healing|healed|reverses?|reversing|reversed|prevents?|preventing|prevented|fix(es|ed|ing)?|boosts?|boosting|increases?|raises?|lowers?|reduces?|regulates?|balances?|repairs?|detox\w*|eliminates?|kills?)\b/i;
const CONDITIONS = /\b(gut|microbiome|leaky gut|skin|eczema|tsw|acne|inflammation|inflamed|testosterone|estrogen|cortisol|hormones?|thyroid|insulin|blood sugar|diabetes|cancer|tumou?rs?|disease|illness|infection|virus|bacteria|symptoms?|condition|depression|anxiety|adhd|autism|injury|injuries|pain|arthritis|fertility|sperm|libido|erectile|hair loss|weight loss|fat loss|obesity|immune|immunity|cholesterol|blood pressure|liver|kidney|heart|brain fog|sleep apnea|insomnia|fluoride|toxins?|parasites?)\b/i;

export const HARD = [
  { id: 'dose-unit',   why: 'dosage with a unit',        re: /\b\d+([.,]\d+)?\s?(mg|mcg|µg|ug|iu|i\.u\.|ml|mls|cc|units?|grams?|g)\b(?![a-z])/i },
  { id: 'dose-word',   why: 'dosing language',           re: /\b(dos(e|es|ed|ing|age|ages)|microdos\w*|titrat\w*|reconstitut\w*|inject\w*|subcutaneous|subq|intramuscular|pin(ning|ned)?|cycle (it|on|off)|(on|off)[- ]cycle|stack (it|them|with)|stacked with|per (day|week) for \d)\b/i },
  { id: 'compound',    why: 'named compound',            re: /\b(bpc[- ]?157|tb[- ]?500|ghk[- ]?cu|semaglutide|tirzepatide|retatrutide|cagrilintide|ipamorelin|cjc[- ]?1295|tesamorelin|sermorelin|ss[- ]?31|mots[- ]?c|nad\+|nmn|cerebrolysin|selank|semax|epitalon|epithalon|melanotan|pt[- ]?141|kisspeptin|dsip|thymosin|thymalin|hgh|growth hormone|testosterone (enanthate|cypionate|propionate)|\btrt\b|sarms?|ostarine|rad[- ]?140|lgd[- ]?4033|clenbuterol|anavar|oxandrolone|dianabol|trenbolone|peptides?|nootropics?|modafinil|adderall|ritalin|ssris?|benzos?|ketamine|psilocybin|lsd|dmt|ibogaine|ivermectin|metformin|rapamycin|finasteride|minoxidil|retinol|tretinoin|accutane|isotretinoin|steroids?)\b/i },
  { id: 'medical',     why: 'medical/clinical framing',  re: /\b(diagnos\w*|prescri\w*|contraindicat\w*|side[- ]effects?|clinical(ly)?|pharmac\w*|therapeutic|medically|medicat\w*|supplement(ed|ing|s)? with|protocol for (your|the) (gut|skin|hormones?|testosterone))\b/i },
  { id: 'claim',       why: 'medical claim: verb + condition in one sentence', test: (s) => sentences(s).some((x) => CLAIM_VERBS.test(x) && CONDITIONS.test(x)) },
  { id: 'returns',     why: 'guaranteed financial return', re: /\b(guaranteed? (returns?|profits?|wins?|income|money)|risk[- ]free|can'?t lose|never lose|100% win|sure thing|(\d+|double|triple) your (money|account|capital) in)\b/i },
];

export const WARN = [
  { id: 'health-noun', why: 'health-adjacent — keep to principle, not physiology', re: CONDITIONS },
  { id: 'absolute',    why: 'absolute claim',            re: /\b(always works|never fails|works for everyone|every time|scientifically proven|studies show|proven to)\b/i },
  { id: 'income',      why: 'income claim',              re: /(£|\$|€)\s?\d[\d,]*(k|m)?\s*(a|per|\/|in)\s*(day|week|month|year|\d+ days)/i },
  { id: 'signals',     why: 'trading-signal language',   re: /\b(signals? (group|service|channel)|copy (my|our) trades|join (my|the) (vip|group))\b/i },
  { id: 'doctor',      why: 'medical authority reference', re: /\b(doctor|physician|gp|nurse|pharmacist|dermatologist|endocrinologist)s?\b/i },
  { id: 'hashtag',     why: 'hashtag — Leo does not use them', re: /(^|\s)#[\w]+/ },
  { id: 'emoji',       why: 'emoji — Leo does not use them', re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u },
  { id: 'corporate',   why: 'corporate/creator tone',    re: /\b(hey guys|in today'?s (post|video|episode)|let'?s dive in|game[- ]changer|unlock your|level up your|synerg\w*|leverage your|thought leader|content creator|don'?t forget to (like|subscribe|follow)|link in bio|drop a|smash that)\b/i },
  { id: 'preamble',    why: 'preamble — start on the hook', re: /^(so|okay|ok|alright|today|hi|hello|hey)\b[,!]?\s/i, hookOnly: true },
];

export function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** Run every pattern over `text`. Returns { hard: [...], warn: [...] } with the offending line. */
export function scan(text) {
  const lines = text.split('\n');
  const hits = { hard: [], warn: [] };
  const run = (tier, rules) => {
    for (const r of rules) {
      if (r.test) { if (r.test(text)) hits[tier].push({ id: r.id, why: r.why, where: firstSentence(text, (s) => CLAIM_VERBS.test(s) && CONDITIONS.test(s)) }); continue; }
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const m = r.re.exec(lines[i]);
        if (m) { hits[tier].push({ id: r.id, why: r.why, where: `line ${i + 1}: "${m[0]}"` }); break; }
        if (r.hookOnly) break; // only the first non-empty line is the hook
      }
    }
  };
  run('hard', HARD);
  run('warn', WARN);
  return hits;
}

const firstSentence = (text, pred) => { const s = sentences(text).find(pred); return s ? `"${s.slice(0, 80)}${s.length > 80 ? '…' : ''}"` : ''; };

/* ---------- text helpers ---------- */

export const countWords = (s) => (s.trim().match(/\S+/g) || []).length;

export function slugify(s, max = 40) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

/** The body's first non-empty, non-comment line — the hook. */
export function firstLine(body) {
  for (const l of body.split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('<!--')) continue;
    return t;
  }
  return '';
}

/* ---------- the index ---------- */

export function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error(`No Archives index at ${path.relative(REPO, INDEX_FILE)}. Run: npm run herald:index`);
  }
  return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
}

export function moduleText(mod) {
  const f = path.join(MODULES_DIR, `${mod.id}.txt`);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

/* ---------- ids ---------- */

/** Next `PREFIX-YYYYMMDD-NNN` given the ids already taken today. */
export function nextId(prefix, day, taken) {
  const re = new RegExp(`^${prefix}-${day}-(\\d{3})$`);
  let max = 0;
  for (const id of taken) { const m = re.exec(id); if (m) max = Math.max(max, Number(m[1])); }
  return `${prefix}-${day}-${String(max + 1).padStart(3, '0')}`;
}

/* ---------- the operator's source gate ---------- */

/** Allowed / Never subject lists from brain/05-Knowledge/Archives-Sources.md. */
export function sourceGate(brainDir_) {
  const out = { allowed: [], never: [] };
  try {
    const md = fs.readFileSync(path.join(brainDir_, '05-Knowledge', 'Archives-Sources.md'), 'utf8');
    let cur = null;
    for (const line of md.split('\n')) {
      if (/^## Allowed/i.test(line)) cur = 'allowed'; else if (/^## Never/i.test(line)) cur = 'never'; else if (/^## /.test(line)) cur = null;
      else if (cur && /^- /.test(line)) out[cur].push(line.replace(/^- /, '').trim().toLowerCase());
    }
  } catch {}
  return out;
}
export const subjectAllowed = (subject, gate, any = false) => {
  const s = String(subject).toLowerCase();
  if (gate.never.some((n) => n && s.includes(n))) return false;
  if (any || !gate.allowed.length) return true;
  return gate.allowed.some((a) => a && s.includes(a));
};
