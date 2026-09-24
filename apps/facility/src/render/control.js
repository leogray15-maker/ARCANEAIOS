/**
 * THE CONTROL ROOM — the room that says no, and the room that says what
 * the machine is made of.
 *
 *   #control     the keys the server holds (never their values), the database and its migrations,
 *                the knowledge sources' sync state, the last runs, the permission matrix
 *
 * Reads /api/health and /api/ai (the record); the matrix is the config. Nothing here
 * is edited: agents are configured in packages/config, migrations in
 * supabase/migrations, keys in the environment.
 */
import { AGENTS, AGENT_BY_ID, CAPS, GRADES } from '@arcane/config';
import { api } from '../core/api.js';
import { esc, chip, when, stampFull, loading, failed, handleKeyForm } from './ui.js';
import { STATUS_TONE, STATUS_NAME } from '../core/agents.js';

const st = { health: null, runs: null, bridge: null, error: null, loadedAt: 0 };
let el = null, go = null, store = null;

export function bindControl(view, ctx) { el = view; go = ctx.go; store = ctx.store; el.addEventListener('click', onClick); el.addEventListener('submit', (e) => { if (e.target.dataset.act) { e.preventDefault(); handleKeyForm(e.target, load); } }); }
export function renderControl(view, ctx, hash = '#control', { keepScroll = false } = {}) { el = view; if ((!st.health && !st.error) || Date.now() - st.loadedAt > 60_000) load(); paint({ keepScroll }); }
async function load() {
  st.loadedAt = Date.now();
  try { const [h, r, b] = await Promise.all([api.get('/api/health'), api.runs.list({ limit: 15 }), api.bridge().catch(() => null)]); st.health = h; st.runs = r.runs; st.bridge = b; st.error = null; }
  catch (e) { st.error = e; }
  paint({ keepScroll: true });
}

function paint({ keepScroll = false } = {}) {
  if (!el || !store) return;
  const scroll = keepScroll ? el.scrollTop : 0;
  const h = st.health; const sv = store.serverStatus();
  const yes = (b, good = 'set', bad = 'missing') => (b ? chip(good, 'vital') : chip(bad, 'deny'));
  const missing = h ? h.tables.filter((t) => !t.ok) : [];
  const migrations = [...new Set(missing.map((t) => t.migration))];
  el.innerHTML = `<div class="wrap app control">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>THE CONTROL ROOM</h1>
      <span class="sub">permissions · keys · the database · the sources</span>
      <span class="spacer"></span>
      <span class="${sv.tone}" title="${esc(sv.text)}">● ${esc(sv.tone === 'vital' ? 'state on the server' : sv.text)}</span>
      <button class="tiny ghost" data-act="reload">refresh</button>
    </div>
    ${st.error ? failed(st.error, { retry: 'reload' }) : !h ? loading('the machine') : `
    ${readyBlock(h.ready)}
    <div class="bridge-grid">
      <div class="bridge-main">
        <section>
          <h2>The server</h2>
          <table class="grid kv-table">
            <tr><td>Anthropic key</td><td>${yes(h.env.anthropic)}</td><td class="ash">HERALD, Counsel, the Council · model ${esc(h.env.model)}${h.env.mock ? ' · <span class="flare">MOCK writer on</span>' : ''}</td></tr>
            <tr><td>Supabase service key</td><td>${yes(h.env.service_key)}</td><td class="ash">the only key that reaches the tables</td></tr>
            <tr><td>Operator key</td><td>${yes(h.env.operator_key)}</td><td class="ash">what this browser sends; set once in the Vercel project</td></tr>
            <tr><td>Database</td><td>${h.db.ok ? chip(h.db.kind === 'dev' ? 'dev database' : h.db.kind, h.db.kind === 'dev' ? 'flare' : 'vital') : chip('unreachable', 'deny')}</td><td class="ash">${esc(h.db.error || (h.db.kind === 'dev' ? 'data/dev-db.json on this machine — not Supabase' : 'Supabase Postgres through the service key'))}</td></tr>
            <tr><td>Runtime</td><td>${chip(h.runtime.vercel ? 'Vercel' : 'local', h.runtime.vercel ? 'vital' : 'flare')}</td><td class="ash">${esc(h.runtime.region || '')} node ${esc(h.runtime.node)} · ${when(h.runtime.at)}</td></tr>
          </table>
        </section>
        <section>
          <h2>Migrations ${missing.length ? `<span class="breach">${migrations.length} to run</span>` : '<span class="vital">all applied</span>'}</h2>
          ${missing.length ? `<p class="flash breach">Run in the Supabase SQL editor, in order: ${migrations.map((m) => `<code>supabase/migrations/${esc(m)}</code>`).join(', ')}. Every table they create is listed below.</p>` : ''}
          <table class="grid"><thead><tr><th>Table</th><th>State</th><th>Migration</th></tr></thead><tbody>${h.tables.map((t) => `<tr><td><code>${esc(t.table)}</code></td><td>${t.ok ? chip('ok', 'vital') : chip('missing', 'deny')}</td><td class="ash">${esc(t.migration)}</td></tr>`).join('')}</tbody></table>
        </section>
        <section>
          <h2>Knowledge sources</h2>
          ${h.sources.length ? `<table class="grid"><thead><tr><th>Source</th><th>Kind</th><th>State</th><th class="r">Modules</th><th>Last sync</th><th>Error</th></tr></thead><tbody>${h.sources.map((s) => `<tr><td><b>${esc(s.id)}</b></td><td class="ash">${esc(s.kind)}</td><td>${chip(s.status, s.status === 'ok' ? 'vital' : s.status === 'error' ? 'deny' : 'ash')}</td><td class="r">${s.module_count}</td><td class="ash">${s.last_synced_at ? esc(stampFull(s.last_synced_at)) : '—'}</td><td class="breach">${esc(s.last_error || '')}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No sources recorded — run npm run archives:sync.</p>'}
          <p class="src">The Archives come from the Obsidian vault on the Mac (npm run herald:index && npm run archives:sync). A Notion source would appear here the same way.</p>
        </section>
        <section>
          <h2>Agent runtime <span class="faint">status, level, streak — derived, never typed</span></h2>
          ${st.bridge ? `<table class="grid"><thead><tr><th>Agent</th><th>Status</th><th class="r">Level</th><th class="r">Streak</th><th>Job</th></tr></thead><tbody>${st.bridge.agents.list.map((a) => `<tr><td><span class="dot" style="background:${AGENT_BY_ID[a.id]?.colour || '#8a889e'}"></span>${esc(a.name)}</td><td>${chip(STATUS_NAME[a.status] || a.status, STATUS_TONE[a.status] || 'ash')}</td><td class="r">${a.level}</td><td class="r">${a.streak ? `${a.streak}d` : '—'}</td><td class="ash">${a.job ? esc(a.job.text || '') : ''}</td></tr>`).join('')}</tbody></table>
          <p><a class="button-link" href="#room/garage">THE AGENT GARAGE →</a></p>` : loading('agent runtime')}
        </section>
        <section>
          <h2>Audit chain <span class="faint">system_events, hash-chained</span></h2>
          ${st.bridge?.audit ? `<p class="${st.bridge.audit.ok ? 'vital' : 'breach'}">${st.bridge.audit.ok ? `✓ verified — ${st.bridge.audit.checked} chained events` : `✗ broken at record #${st.bridge.audit.brokenAt}`}</p>` : ''}
          <p class="src">Every write leaves a system event; each carries the hash of the one before it (packages/database/src/audit.js). Rows written before this pass have no hash — that is a genesis boundary, not a break.</p>
        </section>
        <section>
          <h2>Room budgets</h2>
          ${st.bridge?.room_budgets?.length ? `<table class="grid"><thead><tr><th>Room</th><th class="r">Budget</th><th>Period</th><th>Goal</th></tr></thead><tbody>${st.bridge.room_budgets.map((b) => `<tr><td>${esc(b.room)}</td><td class="r">${b.budget_gbp === null ? '—' : `£${b.budget_gbp}`}</td><td class="ash">${esc(b.period)}</td><td class="ash">${b.goal_metric ? `${esc(b.goal_metric)} → ${b.goal_target ?? '—'}` : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No room has a budget set yet.</p>'}
        </section>
        <section>
          <h2>Last runs</h2>
          ${st.runs?.length ? st.runs.map((r) => `<div class="order-row"><span>${chip(r.agent, 'arcane')}${chip(r.status, r.status === 'ok' ? 'vital' : r.status === 'running' ? 'cyan' : 'deny')}</span><span class="text">${esc(r.objective)}</span>${r.error ? `<span class="breach">${esc(r.error).slice(0, 100)}</span>` : ''}<span class="faint nowrap">${when(r.started_at)}</span></div>`).join('') : '<p class="empty">No runs yet.</p>'}
          <p><a class="button-link" href="#records/runs">Every run, in THE RECORDS →</a></p>
        </section>
      </div>
      <aside class="bridge-side">
        <h2>The permission matrix</h2>
        <table class="grid matrix"><thead><tr><th>Agent</th>${CAPS.map((c) => `<th title="${esc(c.note)}">${esc(c.name.split(' ')[0])}</th>`).join('')}</tr></thead><tbody>${AGENTS.map((a) => `<tr><td><span class="dot" style="background:${a.colour}"></span>${esc(a.name)}</td>${CAPS.map((c) => `<td>${chip(a.caps[c.id], a.caps[c.id])}</td>`).join('')}</tr>`).join('')}</tbody></table>
        <p class="src">Grades: ${GRADES.join(' · ')}. No agent holds allow; spend is deny for everyone. Enforced by npm run check on every push; the runtime checks again before an act.</p>
      </aside>
    </div>`}
  </div>`;
  el.scrollTop = scroll;
}
/**
 * What the machine says is wrong with it, in the order it matters, each
 * line carrying the evidence it was judged on and the exact thing to do.
 * The same judgement the bar shows — computed once, server-side.
 */
function readyBlock(r) {
  if (!r) return '';
  const tone = { blocked: 'deny', degraded: 'flare', ok: 'vital' };
  const rank = { blocked: 0, degraded: 1, ok: 2 };
  const items = [...r.items].sort((a, b) => rank[a.level] - rank[b.level]);
  return `<section class="ready">
    <h2>Readiness ${r.level === 'ok' ? '<span class="vital">everything the machine needs is here</span>' : `<span class="${r.level === 'blocked' ? 'breach' : 'flare'}">${r.blocked ? `${r.blocked} blocking` : ''}${r.blocked && r.degraded ? ' · ' : ''}${r.degraded ? `${r.degraded} degraded` : ''}</span>`}</h2>
    <table class="grid"><tbody>${items.map((i) => `<tr class="ready-${i.level}">
      <td>${chip(i.level === 'ok' ? 'ok' : i.level, tone[i.level])}</td>
      <td><b>${esc(i.title)}</b><br><span class="ash">${esc(i.detail)}</span>${i.fix ? `<br><span class="flare">→ ${esc(i.fix)}</span>` : ''}</td>
      <td class="nowrap"><a href="#${i.room === 'control' ? 'control' : `room/${i.room}`}" class="faint">${esc(i.room)}</a></td>
    </tr>`).join('')}</tbody></table>
    <p class="src">Computed from the tables themselves (packages/database/src/readiness.js), not from a setting. A check that cannot be made is never reported as ok.</p>
  </section>`;
}

function onClick(e) { const b = e.target.closest('[data-act]'); if (!b) return; if (b.dataset.act === 'back') go('#'); else if (b.dataset.act === 'reload') load(); }
