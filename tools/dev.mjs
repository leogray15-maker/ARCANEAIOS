#!/usr/bin/env node
/**
 * The facility and its API together, on a laptop.
 *
 *   npm run dev          # tools/dev-api.mjs on 8787 + Vite on 5173, /api proxied
 *   npm run dev:local    # the same with ARCANE_DB=memory and HERALD_MOCK=1 — no keys needed
 *
 * One process to start, one Ctrl-C to stop both. The brain export runs
 * first so the floor has its brief and orders.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env };
if (process.argv.includes('--local')) { env.ARCANE_DB = 'memory'; env.HERALD_MOCK = '1'; if (!env.ARCANE_OPERATOR_KEY) { env.ARCANE_OPERATOR_KEY = 'local-operator-key-for-dev-only'; console.log('[dev] no ARCANE_OPERATOR_KEY in .env — using "local-operator-key-for-dev-only" for this session; paste that into the DEVICE control'); } }

spawnSync('node', ['tools/vault-export.mjs'], { cwd: REPO, stdio: 'inherit' });
const api = spawn('node', ['tools/dev-api.mjs'], { cwd: REPO, stdio: 'inherit', env });
const vite = spawn('npm', ['--workspace', 'apps/facility', 'run', 'dev'], { cwd: REPO, stdio: 'inherit', env });
const stop = () => { api.kill(); vite.kill(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
api.on('exit', (c) => { if (c) { console.error(`[dev] api exited ${c}`); stop(); } });
vite.on('exit', stop);
