#!/usr/bin/env node
/**
 * The API, locally.
 *
 *   node tools/dev-api.mjs                # serves api/*.js on http://127.0.0.1:8787
 *   ARCANE_DB=memory HERALD_MOCK=1 node tools/dev-api.mjs
 *
 * Vercel runs each file in api/ as a function with Node's req/res plus
 * `req.query` and a parsed JSON `req.body`. This does the same on a port
 * so `npm run facility` can proxy /api to it and the floor works end to
 * end on a laptop. Reads .env at the repo root for the keys. Handlers are
 * imported once and reloaded when their file changes.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv, REPO } from '../packages/database/src/index.js';

loadEnv();
const PORT = Number(process.env.ARCANE_API_PORT || 8787);
const API = path.join(REPO, 'api');
const handlers = new Map();

async function handlerFor(name) {
  const file = path.join(API, `${name}.js`);
  if (!fs.existsSync(file) || name.startsWith('_')) return null;
  const mtime = fs.statSync(file).mtimeMs;
  const cached = handlers.get(name);
  if (cached && cached.mtime === mtime) return cached.fn;
  const mod = await import(`${pathToFileURL(file).href}?t=${mtime}`);
  handlers.set(name, { mtime, fn: mod.default });
  return mod.default;
}

function shim(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  req.query = Object.fromEntries(url.searchParams.entries());
  res.status = (n) => { res.statusCode = n; return res; };
  res.send = (b) => { res.end(b); return res; };
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  return url;
}

const server = http.createServer(async (req, res) => {
  const url = shim(req, res);
  const m = /^\/api\/([a-z-]+)\/?$/.exec(url.pathname);
  if (!m) return res.status(404).json({ error: `no route ${url.pathname}` });
  let raw = ''; for await (const chunk of req) raw += chunk;
  try { req.body = raw ? JSON.parse(raw) : {}; } catch { return res.status(400).json({ error: 'body is not JSON' }); }
  try {
    const fn = await handlerFor(m[1]);
    if (!fn) return res.status(404).json({ error: `no function api/${m[1]}.js` });
    await fn(req, res);
  } catch (e) {
    console.error(`[api] ${req.method} ${url.pathname} → ${e.stack || e.message}`);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
  console.log(`[api] ${req.method} ${url.pathname}${url.search} → ${res.statusCode}`);
});

server.listen(PORT, '127.0.0.1', () => {
  const mode = process.env.ARCANE_DB === 'memory' ? 'dev database (data/dev-db.json, modules from data/archives)' : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.storage_SUPABASE_SERVICE_ROLE_KEY ? 'Supabase (service key from .env)' : 'no database — set SUPABASE_SERVICE_ROLE_KEY in .env or ARCANE_DB=memory';
  console.log(`[api] http://127.0.0.1:${PORT}/api/*  ·  ${mode}  ·  HERALD ${process.env.HERALD_MOCK === '1' ? 'MOCK' : process.env.ANTHROPIC_API_KEY ? 'live' : 'no key'}  ·  operator key ${process.env.ARCANE_OPERATOR_KEY ? 'set' : 'NOT SET — every call will be refused'}`);
});
