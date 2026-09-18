/**
 * Per-room dashboard data — ported from LEOOS v2.
 *
 * These are DEMO ROWS: real structure, placeholder numbers, so every room
 * opens as a working dashboard instead of an empty shell. Each set carries
 * a `source` line naming what it will be wired to. The brain export
 * (public/brain.json) overrides what it knows about — orders, drafts,
 * goals, the brief — and the store persists what the operator edits.
 *
 * Nothing in this file is a claim about what any compound does. Stock,
 * batch and COA state only.
 */

/* ---------------- THE LAB ---------------- */

export const INVENTORY = {
  source: 'Placeholder — will read live stock from Arcane Peptides.',
  columns: ['Compound', 'Size', 'Vials', 'Batch', 'COA'],
  rows: [
    { code: 'GHK-Cu',       size: '50mg', vials: 0, batch: '—', coa: 'pending',   tint: 'blue' },
    { code: 'BPC-157',      size: '5mg',  vials: 0, batch: '—', coa: 'published', tint: 'clear' },
    { code: 'TB-500',       size: '5mg',  vials: 0, batch: '—', coa: 'published', tint: 'clear' },
    { code: 'KPV',          size: '10mg', vials: 0, batch: '—', coa: 'pending',   tint: 'clear' },
    { code: 'MOTS-c',       size: '10mg', vials: 0, batch: '—', coa: 'none',      tint: 'clear' },
    { code: 'SS-31',        size: '10mg', vials: 0, batch: '—', coa: 'none',      tint: 'amber' },
    { code: 'VIP',          size: '5mg',  vials: 0, batch: '—', coa: 'none',      tint: 'clear' },
    { code: 'Cerebrolysin', size: '5ml',  vials: 0, batch: '—', coa: 'none',      tint: 'amber' },
  ],
};
export const COA_STATES = ['none', 'pending', 'published'];

export const DISPATCH = {
  source: 'Placeholder — will read the live order queue.',
  note: 'Cutoff is 12:00 Mon–Fri. Free UK delivery over £50.',
  rows: [{ ref: '—', items: 'No orders in the queue', stage: 'idle' }],
  stages: ['packing', 'ready', 'shipped', 'idle'],
};

/* ---------------- VITALS ---------------- */

export const COHORTS = {
  source: 'Placeholder — will read live from Arcane Track.',
  rows: [
    { label: 'Active monthly', count: 0, note: '£11.99 / month' },
    { label: 'Active annual', count: 0, note: '£70 / year' },
    { label: 'Joined this month', count: 0, note: 'New members' },
    { label: 'Lapsed', count: 0, note: 'Win-back list' },
    { label: 'Logging daily', count: 0, note: 'Logged in the last 24h' },
  ],
};

/* ---------------- FORGE ---------------- */

export const BUILD_QUEUE = {
  source: 'The build board. Edit in the brain: 06-Orders.',
  rows: [
    { item: 'Room dashboards + shared store', target: 'Facility', stage: 'building' },
    { item: 'Attention routing from open orders', target: 'Facility', stage: 'building' },
    { item: 'Brain sync: Supabase', target: 'Facility', stage: 'queued' },
    { item: 'Counsel (Leo ↔ ARCANE)', target: 'Facility', stage: 'queued' },
    { item: 'COA lookup by batch number', target: 'Peptides site', stage: 'idea' },
    { item: 'Offline logging + sync', target: 'Arcane Track', stage: 'idea' },
  ],
  stages: ['building', 'queued', 'idea', 'shipped'],
};

/* ---------------- THE MARKET ---------------- */

export const FUNNEL = {
  source: 'Placeholder — will read from the shop analytics.',
  steps: ['visitors', 'leads', 'orders'],
  seed: { visitors: 0, leads: 0, orders: 0, aov: 0 },
};

/* ---------------- SCRIPTORIUM ---------------- */

export const MANUSCRIPTS = {
  source: 'The Codex. Progress is yours to set.',
  rows: [
    { title: 'The Dark Psych Codex', stage: 'proofing', pct: 90, price: 70.99 },
    { title: 'The Arcane Game', stage: 'live', pct: 100, price: 69.99 },
    { title: 'The Quiet Empire', stage: 'drafting', pct: 45, price: null },
    { title: 'The Inner Citadel', stage: 'live', pct: 100, price: null },
    { title: 'The Primal Code', stage: 'live', pct: 100, price: null },
  ],
  stages: ['live', 'proofing', 'drafting'],
};

/* ---------------- SANCTUM ---------------- */

export const PROTOCOL = {
  source: 'The operator is a system component. Maintained like one.',
  rows: [
    { item: 'Train', target: 4, unit: 'per week' },
    { item: 'Sleep floor', target: 7.5, unit: 'hours' },
    { item: 'Deep work block', target: 3, unit: 'hours / day' },
    { item: 'Steps', target: 8000, unit: 'per day' },
    { item: 'Read', target: 20, unit: 'pages / day' },
  ],
};

/* ---------------- THE VAULT ---------------- */

export const BUDGET = {
  source: 'Treasury. Figures are yours to set; nothing here moves money.',
  fixed: [
    { id: 'stock',    name: 'Stock & storage',     amount: 0, room: 'apothecary' },
    { id: 'shipping', name: 'Packaging & postage', amount: 0, room: 'apothecary' },
    { id: 'testing',  name: 'HPLC & COA testing',  amount: 0, room: 'apothecary' },
    { id: 'software', name: 'Software & hosting',  amount: 0, room: 'forge' },
    { id: 'ads',      name: 'Ads & promotion',     amount: 0, room: 'beacon' },
    { id: 'personal', name: 'Personal fixed costs', amount: 0, room: 'sanctum' },
  ],
  split: [
    { id: 'tax',      name: 'Tax set-aside', pct: 25, note: 'VAT and corporation tax. Untouchable.', accent: 'breach' },
    { id: 'reinvest', name: 'Reinvest',      pct: 35, note: 'Stock, build, ads — the compounding half.', accent: 'arcane' },
    { id: 'pay',      name: 'Pay yourself',  pct: 25, note: 'The reason any of this exists.', accent: 'vital' },
    { id: 'reserve',  name: 'War chest',     pct: 15, note: 'Runway. Lets you say no to bad deals.', accent: 'gold' },
  ],
};

/* ---------------- BRIDGE ---------------- */

export const DOCTRINE_FALLBACK = [
  'Revenue before vanity.',
  'Systems over hustle.',
  'No permission needed.',
  'Compounding test.',
  'Contrarian filter.',
];
