#!/usr/bin/env node
/**
 * Export the Obsidian vault's link graph for the facility's Brain Graph.
 *
 *   npm run vault:graph     → apps/facility/public/graph.json
 *
 * Reads every note in the vault (ARCANE_VAULT, default ~/Desktop/Arcane),
 * follows [[wikilinks]] and Notion-style [text](page.md) links, groups
 * notes by folder, and lays the whole thing out with a force simulation
 * here — so the browser only draws. The v3 brain is in the vault by
 * symlink, so it lays out beside the Archives it draws from; the twenty
 * rooms are then anchored to the brain folders they own, and the crew are
 * overlaid live in the browser.
 *
 * The vault is local, so the output is committed; Vercel builds ship it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './lib/brain.mjs';
import { ROOMS } from '../packages/config/src/index.js';

const VAULT = process.env.ARCANE_VAULT || '/Users/leogray/Desktop/Arcane';
const OUT = path.join(REPO, 'apps', 'facility', 'public', 'graph.json');
const vaultName = path.basename(VAULT);
if (!fs.existsSync(VAULT)) { console.error(`✗ no vault at ${VAULT} — set ARCANE_VAULT`); process.exit(1); }

/* ---------- groups: folder → colour (most specific match wins) ---------- */
const GROUPS = [
  { id: 'os-agents', name: 'Agents & rooms', match: /^ARCANE-AI-OS-v3\/01-System\/(Agents|Rooms)/, colour: '#3ecf8e' },
  { id: 'os-content', name: 'Content drafts', match: /^ARCANE-AI-OS-v3\/02-Content/, colour: '#f0a05a' },
  { id: 'os-records', name: 'Records & memory', match: /^ARCANE-AI-OS-v3\/0[34]-/, colour: '#d9a441' },
  { id: 'os', name: 'AI OS brain (v3)', match: /^ARCANE-AI-OS-v3/, colour: '#e8b64c' },
  { id: 'os-v2', name: 'AI OS (v2, archived)', match: /^ARCANE-AI-OS\//, colour: '#4e4c64' },
  { id: 'archives', name: 'Arcane Archives', match: /^Arcane ARCHIVES/, colour: '#8b5cf6' },
  { id: 'healing', name: 'Healing Protocols', match: /^Arcane Healing Protocols/, colour: '#4fb8a0' },
  { id: 'lab', name: 'Lab Healing', match: /^Arcane Lab Healing/, colour: '#56c9f0' },
  { id: 'peptide', name: 'Peptide 101', match: /^Pept!de 101/, colour: '#e0609a' },
  { id: 'other', name: 'Other', match: /./, colour: '#8a889e' },
];
const groupOf = (rel) => GROUPS.find((g) => g.match.test(rel));

/* ---------- read notes ---------- */
const notes = [];
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
    let st; try { st = fs.statSync(p); } catch { continue; }           // statSync follows the brain symlink
    if (st.isDirectory()) walk(p, r);
    else if (e.name.endsWith('.md')) notes.push({ rel: r, id: r.replace(/\.md$/, ''), text: fs.readFileSync(p, 'utf8') });
  }
})(VAULT, '');

const byId = new Map(notes.map((n) => [n.id, n]));
const byBase = new Map();
for (const n of notes) { const base = path.basename(n.id); if (!byBase.has(base)) byBase.set(base, []); byBase.get(base).push(n); }
const NOTION_ID = /\s[0-9a-f]{32}$/i;
const titleOf = (n) => {
  const h1 = /^#\s+(.+)$/m.exec(n.text.replace(/^---[\s\S]*?---\n/, ''))?.[1];
  return (h1 || path.basename(n.id)).replace(NOTION_ID, '').trim();
};

/** Resolve a link target the way Obsidian does: exact path, else relative, else unique basename. */
function resolve(target, fromDir) {
  let t;
  try { t = decodeURIComponent(target); } catch { t = target; }
  t = t.replace(/#.*$|\|.*$|\^.*$/g, '').replace(/\.md$/, '').trim();
  if (!t) return null;
  if (byId.has(t)) return t;
  const rel = path.posix.normalize(path.posix.join(fromDir, t));
  if (byId.has(rel)) return rel;
  const cands = byBase.get(path.basename(t));
  if (cands?.length) return cands[0].id;
  return null;
}

/* ---------- edges ---------- */
const edgeSet = new Set();
const edges = [];
for (const n of notes) {
  const dir = path.posix.dirname(n.rel);
  const targets = [];
  for (const m of n.text.matchAll(/\[\[([^\]]+)\]\]/g)) targets.push(m[1]);
  for (const m of n.text.matchAll(/\]\(([^)\s]+\.md)\)/g)) targets.push(m[1]);
  for (const t of targets) {
    const to = resolve(t, dir);
    if (!to || to === n.id) continue;
    const key = n.id < to ? `${n.id}|${to}` : `${to}|${n.id}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key); edges.push([n.id, to]);
  }
}

/* ---------- nodes ---------- */
const degree = new Map();
for (const [a, b] of edges) { degree.set(a, (degree.get(a) || 0) + 1); degree.set(b, (degree.get(b) || 0) + 1); }
const nodes = notes.map((n) => ({ id: n.id, t: titleOf(n), g: groupOf(n.rel).id, d: degree.get(n.id) || 0 }));
const index = new Map(nodes.map((n, i) => [n.id, i]));
const E = edges.map(([a, b]) => [index.get(a), index.get(b)]);

/* ---------- layout ----------
 * Connected notes get a Fruchterman–Reingold run with grid-binned
 * repulsion. Isolated notes (no links either way) do not join it — a
 * simulation turns them into a lattice — they ring the graph as dust,
 * grouped by folder so the colours stay coherent, the way Obsidian
 * draws them.
 */
const N = nodes.length;
const live = nodes.map((n, i) => (n.d ? i : -1)).filter((i) => i >= 0);
const iso = nodes.map((n, i) => (n.d ? -1 : i)).filter((i) => i >= 0);
const px = new Float64Array(N), py = new Float64Array(N), dx = new Float64Array(N), dy = new Float64Array(N);
const gIndex = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]));
for (const i of live) { const a = (gIndex[nodes[i].g] / GROUPS.length) * Math.PI * 2 + ((i * 0.618) % 1) * 0.8; const r = 200 + (i % 150); px[i] = Math.cos(a) * r; py[i] = Math.sin(a) * r; }
const M = live.length;
const k = Math.sqrt((1500 * 1500) / Math.max(1, M));
const ITER = 300;
let temp = 200;
const cell = k * 1.3;
for (let it = 0; it < ITER; it++) {
  dx.fill(0); dy.fill(0);
  const grid = new Map();
  for (const i of live) { const key = `${Math.floor(px[i] / cell)},${Math.floor(py[i] / cell)}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i); }
  for (const [key, cellNodes] of grid) {
    const [cx, cy] = key.split(',').map(Number);
    for (let ox = -2; ox <= 2; ox++) for (let oy = -2; oy <= 2; oy++) {
      const other = grid.get(`${cx + ox},${cy + oy}`); if (!other) continue;
      for (const i of cellNodes) for (const j of other) {
        if (i >= j) continue;
        let ddx = px[i] - px[j], ddy = py[i] - py[j]; let d2 = ddx * ddx + ddy * ddy; if (d2 < 0.01) { ddx = Math.random() - 0.5; ddy = Math.random() - 0.5; d2 = 0.25; }
        const d = Math.sqrt(d2); if (d > cell * 2.5) continue; const f = (k * k) / d / d;
        dx[i] += ddx * f; dy[i] += ddy * f; dx[j] -= ddx * f; dy[j] -= ddy * f;
      }
    }
  }
  for (const [a, b] of E) {
    const ddx = px[a] - px[b], ddy = py[a] - py[b]; const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01; const f = d / k;
    dx[a] -= ddx * f; dy[a] -= ddy * f; dx[b] += ddx * f; dy[b] += ddy * f;
  }
  for (const i of live) {
    dx[i] -= px[i] * 0.015; dy[i] -= py[i] * 0.015;
    const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01; const step = Math.min(d, temp);
    px[i] += (dx[i] / d) * step; py[i] += (dy[i] / d) * step;
  }
  temp = Math.max(3, temp * 0.985);
}
// Flowers: a hub's leaves (its neighbours with no other link) sit on a ring
// around it, radius by count. That is the shape a course and its modules
// make in Obsidian, and it removes the lattice a binned simulation leaves.
const neigh = nodes.map(() => []);
for (const [a, b] of E) { neigh[a].push(b); neigh[b].push(a); }
for (let h = 0; h < N; h++) {
  const leaves = neigh[h].filter((j) => nodes[j].d === 1);
  if (leaves.length < 4) continue;
  const rad = k * 0.35 + Math.sqrt(leaves.length) * k * 0.22;
  const a0 = Math.atan2(py[h], px[h]) + (h % 7) * 0.4;
  leaves.forEach((j, n) => { const a = a0 + (n / leaves.length) * Math.PI * 2; px[j] = px[h] + Math.cos(a) * rad; py[j] = py[h] + Math.sin(a) * rad; });
}
// The dust ring: isolated notes on arcs outside the connected graph, one arc per group.
let R = 0; for (const i of live) R = Math.max(R, Math.hypot(px[i], py[i]));
const isoByGroup = {}; for (const i of iso) (isoByGroup[nodes[i].g] ||= []).push(i);
let arc0 = 0; const totalIso = iso.length || 1;
for (const [gid, list] of Object.entries(isoByGroup)) {
  const arc = (list.length / totalIso) * Math.PI * 2;
  list.forEach((i, j) => { const a = arc0 + (j / list.length) * arc; const r = R + 90 + ((i * 7919) % 160); px[i] = Math.cos(a) * r; py[i] = Math.sin(a) * r; });
  arc0 += arc;
}
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let i = 0; i < N; i++) { minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]); minY = Math.min(minY, py[i]); maxY = Math.max(maxY, py[i]); }
const span = Math.max(maxX - minX, maxY - minY) || 1;
nodes.forEach((n, i) => { n.x = Math.round(((px[i] - minX) / span) * 2000 - 1000); n.y = Math.round(((py[i] - minY) / span) * 2000 - 1000); });

/* ---------- rooms anchored to the brain folders they own ---------- */
const centroid = (pred) => { const xs = nodes.filter(pred); if (!xs.length) return null; return { x: xs.reduce((a, n) => a + n.x, 0) / xs.length, y: xs.reduce((a, n) => a + n.y, 0) / xs.length }; };
const osC = centroid((n) => n.g.startsWith('os') && n.g !== 'os-v2') || { x: 0, y: 0 };
const rooms = ROOMS.map((r, i) => {
  const folder = r.brain ? `ARCANE-AI-OS-v3/${r.brain.split('/')[0]}` : null;
  const c = folder ? centroid((n) => n.id.startsWith(folder)) : null;
  const a = (i / ROOMS.length) * Math.PI * 2;
  const ring = 240 + (i % 3) * 70;
  const pos = c ? { x: Math.round(c.x + Math.cos(a) * 30), y: Math.round(c.y + Math.sin(a) * 30) } : { x: Math.round(osC.x + Math.cos(a) * ring), y: Math.round(osC.y + Math.sin(a) * ring) };
  const links = folder ? nodes.map((n, j) => [n, j]).filter(([n]) => n.id.startsWith(folder)).map(([, j]) => j).slice(0, 40) : [];
  return { id: r.id, name: r.name, accent: r.accent, ...pos, links };
});

/* ---------- write ---------- */
const counts = {}; for (const n of nodes) counts[n.g] = (counts[n.g] || 0) + 1;
const out = { built: new Date().toISOString(), vault: vaultName, groups: GROUPS.filter((g) => counts[g.id]).map((g) => ({ id: g.id, name: g.name, colour: g.colour, n: counts[g.id] })), nodes, edges: E, rooms };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`✓ vault graph → ${path.relative(REPO, OUT)} — ${nodes.length} notes, ${E.length} links, ${out.groups.length} groups (${Math.round(fs.statSync(OUT).size / 1024)} KB)`);
for (const g of out.groups) console.log(`  ${String(g.n).padStart(5)}  ${g.name}`);
