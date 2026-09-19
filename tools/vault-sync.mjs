#!/usr/bin/env node
/**
 * Bring the floor's decisions back into the vault.
 *
 *   npm run vault:sync
 *
 * The floor writes to the database (orders, moves, decisions, counsel,
 * the focus, drafts) and, for the parts not yet on tables, to one JSON
 * row per device (stock, protocol, the journal). This reads both with the
 * service-role key — server-side only, from .env, never in the bundle —
 * and lands each part where the vault keeps it:
 *
 *   drafts           ← content_drafts, as generated files in their status folders (hand-emitted files go up first)
 *   orders           ← orders, the two tables in 06-Orders/Orders.md (rows the vault had go up first, by number)
 *   lists, focus     ← list_items, venture_focus, days → 05-Knowledge/Lists.md, Focus.md
 *   the Lab          ← products, stock_lots, settings, dispatch → 05-Knowledge/Lab.md
 *   decisions        ← decisions → 04-Records/Decisions/<id>.md + rows in Decision-Log.md
 *   counsel          ← counsel_turns → 04-Records/Counsel.md
 *   protocol         ← protocol_items, protocol_ticks → 04-Records/Protocol.md
 *   journal trades   ← trades → 04-Records/Journal/<id>.md + Journal-Log.md
 *   money            ← ledger_months, fixed_costs, cash_snapshots, pots → 05-Knowledge/Money.md
 *   (SANCTUM's entries stay in the database; they are never written here)
 *
 * then writes the brief. Needs SUPABASE_SERVICE_ROLE_KEY in .env; without it, says so.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOMS, ROOM_BY_ID, AGENT_BY_ID } from '../packages/config/src/index.js';
import { brainDir, REPO, parseFrontmatter, serializeFrontmatter, writeGenerated, stamp, stampDate } from './lib/brain.mjs';
import { floorState } from './lib/state.mjs';

import { loadEnv } from '../packages/database/src/index.js';
import { openDb } from '../packages/database/src/dev.js';
import { mirrorDrafts, importDrafts } from './lib/content-mirror.mjs';
import { importOrders, mirrorOrders, mirrorLists, mirrorDecisions, mirrorCounsel, mirrorFocus, mirrorLab } from './lib/state-mirror.mjs';

loadEnv();
let db;
try { db = openDb(); } catch (e) { console.log(`· vault:sync skipped — ${e.message}`); process.exit(0); }
// The blob still carries stock, the protocol and the journal; without any rows those parts are skipped, not invented.
const { state, reason } = await floorState().catch((e) => ({ state: null, reason: e.message }));
if (!state) console.log(`· no floor blob (${reason}) — protocol and journal skipped`);
const brain = brainDir();
const now = new Date();
const W = { write: true };
const cell = (s) => String(s ?? '—').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim() || '—';
const wiki = (room) => `[[${ROOM_BY_ID[room]?.name || room}]]`;
const fmt = (ts) => (ts ? stamp(new Date(ts)) : '—');
const fm = (o) => serializeFrontmatter({ created: stamp(now), updated: stamp(now), status: 'active', generated: true, source: 'tools/vault-sync.mjs', ...o });
const report = {};
const note = (k, r) => { report[k] = report[k] || {}; report[k][r] = (report[k][r] || 0) + 1; };

/* ---------- drafts: the database is the truth; the vault is its record ---------- */
let draftsChanged = 0;
{
  try {
    const imported = await importDrafts(db, brain);
    if (imported.length) console.log(`  imported into the database from the vault: ${imported.join(', ')}`);
    const r = await mirrorDrafts(db, brain);
    draftsChanged = r.written + r.moved + imported.length;
    note('drafts', `${r.written} written, ${r.moved} moved, ${r.unchanged} unchanged${r.kept ? `, ${r.kept} hand-kept` : ''}`);
  } catch (e) { console.error(`  ~ drafts not mirrored: ${e.message}`); note('drafts', 'skipped'); }
}
if (draftsChanged) spawnSync('node', [path.join(REPO, 'tools', 'content-board.mjs')], { stdio: 'inherit' });

/* ---------- orders, lists, the focus: from the tables ---------- */
{
  try {
    const made = await importOrders(db, brain);
    if (made.length) console.log(`  imported into the database from 06-Orders/Orders.md: ${made.length} row${made.length === 1 ? '' : 's'}`);
    note('orders', await mirrorOrders(db, brain, now));
    note('lists', await mirrorLists(db, brain, now));
    note('focus', await mirrorFocus(db, brain, now));
  } catch (e) { console.error(`  ~ orders/lists not mirrored: ${e.message}`); note('orders', 'skipped'); }
  try { note('lab', await mirrorLab(db, brain, now)); } catch (e) { console.error(`  ~ the Lab not mirrored: ${e.message}`); note('lab', 'skipped'); }
}

/* ---------- the protocol and the journal: from the tables (SANCTUM's entries are never mirrored) ---------- */
{
  try {
    const { mirrorProtocol, mirrorJournal, mirrorMoney } = await import('./lib/state-mirror.mjs');
    note('protocol', await mirrorProtocol(db, brain, now));
    const j = await mirrorJournal(db, brain, now); note('trades', `${j.written} written, ${j.unchanged} unchanged`);
    note('money', await mirrorMoney(db, brain, now));
  } catch (e) { console.error(`  ~ protocol/journal/money not mirrored: ${e.message}`); note('protocol', 'skipped'); }
}

/* ---------- decisions and counsel: from the tables ---------- */
{
  try {
    const r = await mirrorDecisions(db, brain, now);
    note('decisions', `${r.written} written, ${r.unchanged} unchanged`);
    note('counsel', await mirrorCounsel(db, brain, now));
  } catch (e) { console.error(`  ~ decisions/counsel not mirrored: ${e.message}`); note('decisions', 'skipped'); }
}

/* ---------- the brief, from all of it ---------- */
const b = spawnSync('node', [path.join(REPO, 'tools', 'brief.mjs')], { encoding: 'utf8' }); process.stdout.write(b.stdout); if (b.status !== 0) process.stderr.write(b.stderr);
const line = Object.entries(report).map(([k, v]) => `${k} ${Object.entries(v).map(([r, n]) => `${n} ${r}`).join(', ')}`).join(' · ');
console.log(`✓ vault:sync from the database${state ? ` and ${state.devices} device blob${state.devices === 1 ? '' : 's'}` : ''} — ${draftsChanged} draft${draftsChanged === 1 ? '' : 's'} · ${line}`);
