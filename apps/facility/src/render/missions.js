/**
 * MISSIONS — work the network does on its own, and where it stopped
 * to ask.
 *
 *   #missions        what is waiting on Leo, what is running, what stands on a schedule, what finished
 *   #missions/<id>   one mission: its steps as a graph, each step's agent and level, its result
 *
 * Missions run on the worker on Leo's machine (tools/worker.mjs), against
 * the local model. This room queues them, cancels them, and answers the
 * approvals they stop at; it never runs a step itself. Everything here is
 * a row in `missions` (0013), read through the store, and refreshed every
 * few seconds while something is moving.
 */
import { MISSION_TEMPLATES, MISSION_TEMPLATE_BY_ID, AGENT_BY_ID, ROOM_BY_ID, RISK_LADDER, AUTONOMY_CEILING, missionView, stepLevel } from '@arcane/config';
import { esc, chip, when, stampFull, empty } from './ui.js';

const STATE_TONE = { standing: 'arcane', queued: 'ash', running: 'cyan', paused: 'flare', done: 'vital', failed: 'deny', cancelled: 'ash' };
const STEP_TONE = { done: 'vital', running: 'cyan', waiting: 'flare', failed: 'deny', skipped: 'ash', todo: 'ash' };
const SCHEDULES = [['', 'once, now'], ['0 9 * * *', 'every day at nine'], ['0 9 * * 1', 'Mondays at nine'], ['0 18 * * 0', 'Sundays at six'], ['0 7 1 * *', 'the first of the month']];

let el = null, go = null, store = null, timer = null, form = { template: 'research' }, flash = '';

export function bindMissions(view, ctx) {
  el = view; go = ctx.go; store = ctx.store;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('change', (e) => { if (e.target.name === 'template') { form = { template: e.target.value }; paint({ keepScroll: true }); } });
}

export function renderMissions(view, ctx, hash = '#missions', { keepScroll = false } = {}) {
  el = view; store = ctx.store;
  paint({ keepScroll, hash });
  watch();
}

/** Refresh just the missions while this room is open: every few seconds while one moves, otherwise every half minute. */
function watch() {
  clearTimeout(timer);
  if (!el || el.classList.contains('hidden')) return;
  const moving = store.missions().some((m) => ['queued', 'running'].includes(m.state));
  timer = setTimeout(async () => { if (el && !el.classList.contains('hidden') && !document.hidden) await store.refreshMissions(); watch(); }, moving ? 4000 : 30000);
}

// A ledger row stays one screen wide: the full text is on hover and one click away.
const cut = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));
const agentName = (id) => AGENT_BY_ID[id]?.name || id || '—';
const dot = (id) => `<span class="dot" style="background:${AGENT_BY_ID[id]?.colour || '#8a889e'}"></span>`;
const ladder = (level) => `<span class="lv lv${level}" title="${esc(RISK_LADDER[level]?.name || '')}: ${esc(RISK_LADDER[level]?.note || '')}">L${level}</span>`;

/** Steps by wave: everything a step waits on sits in a column before it. */
function waves(steps) {
  const by = Object.fromEntries(steps.map((s) => [s.id, s]));
  const depth = {};
  const d = (id, seen = new Set()) => { if (depth[id] !== undefined) return depth[id]; if (seen.has(id)) return 0; seen.add(id); const s = by[id]; depth[id] = s && s.after.length ? 1 + Math.max(...s.after.map((a) => d(a, seen))) : 0; return depth[id]; };
  steps.forEach((s) => d(s.id));
  const cols = [];
  for (const s of steps) (cols[depth[s.id]] || (cols[depth[s.id]] = [])).push(s);
  return cols;
}

function graph(m) {
  const v = missionView(m);
  return `<div class="mgraph">${waves(v.steps).map((col) => `<div class="mcol">${col.map((s) => `<div class="mstep ${s.status}" title="${esc(`${s.id} · ${s.action} · ${agentName(s.agent)} · ${s.status}`)}">
    <span class="mstep-lamp ${STEP_TONE[s.status]}"></span>
    <span class="mstep-id">${esc(s.id)}</span>
    <span class="mstep-meta">${s.kind === 'approval' ? 'approval' : s.kind === 'condition' ? 'condition' : esc(s.action)} · ${esc(agentName(s.agent))}</span>
    ${s.kind === 'action' || s.kind === 'think' ? ladder(s.level) : ''}
  </div>`).join('')}</div>`).join('')}</div>`;
}

function progressBar(m) {
  const v = missionView(m);
  const pct = v.total ? Math.round((v.settled / v.total) * 100) : 0;
  return `<span class="bar"><span class="bar-fill ${m.state === 'failed' ? 'breach' : m.state === 'done' ? 'vital' : ''}" style="width:${m.state === 'done' ? 100 : pct}%"></span></span> <span class="faint">${v.settled}/${v.total}</span>`;
}

function card(m, { open = false } = {}) {
  const tpl = MISSION_TEMPLATE_BY_ID[m.template];
  return `<div class="card mission ${m.state}">
    <div class="card-head">
      ${chip(m.state, STATE_TONE[m.state])}
      <a href="#missions/${esc(m.id)}"><b>${esc(m.title || tpl?.name || m.template)}</b></a>
      <span class="faint">${esc(m.id)} · ${dot(m.agent)}${esc(agentName(m.agent))} · ${esc(ROOM_BY_ID[m.room]?.name || m.room || '')}</span>
      <span class="spacer"></span>
      ${progressBar(m)}
    </div>
    ${graph(m)}
    ${m.state === 'running' && m.current_step ? `<p class="small cyan">now: ${esc(m.current_step)} · heartbeat ${when(m.heartbeat_at)}</p>` : ''}
    ${m.error ? `<p class="small breach">${esc(m.error)}</p>` : ''}
    <p class="acts">
      ${!['done', 'cancelled'].includes(m.state) ? `<button class="tiny ghost" data-act="mission-state" data-id="${esc(m.id)}" data-state="cancelled">cancel</button>` : ''}
      ${['failed', 'cancelled', 'done'].includes(m.state) && !m.schedule ? `<button class="tiny" data-act="mission-state" data-id="${esc(m.id)}" data-state="queued">run again</button>` : ''}
      ${!open ? `<a class="small" href="#missions/${esc(m.id)}">open →</a>` : ''}
    </p>
  </div>`;
}

/** What a finished mission produced, in the shape its template returns. */
function result(m) {
  const o = m.output || {};
  if (m.template === 'research' && o.summary) return `
    <h2>Research packet</h2>
    <p>${esc(o.summary)}</p>
    ${(o.findings || []).length ? `<table class="grid"><thead><tr><th>Finding</th><th>Confidence</th><th>Source</th></tr></thead><tbody>${o.findings.map((f) => `<tr><td>${esc(f.claim)}</td><td>${chip(f.confidence, f.confidence === 'high' ? 'vital' : f.confidence === 'medium' ? 'cyan' : 'flare')}</td><td class="small">${/^https?:\/\//.test(f.source) ? `<a href="${esc(f.source)}" target="_blank" rel="noopener noreferrer">${esc(f.source.replace(/^https?:\/\//, '').slice(0, 60))}</a>` : esc(f.source || 'no source')}</td></tr>`).join('')}</tbody></table>` : ''}
    ${(o.gaps || []).length ? `<h3>What the evidence could not say</h3><ul>${o.gaps.map((g) => `<li class="ash">${esc(g)}</li>`).join('')}</ul>` : ''}`;
  if (m.template === 'content' && o.scores) return `
    <h2>The critic</h2>
    <p>Average <b>${esc(o.average)}</b> of 10 · weakest <code>${esc(o.weakest)}</code> — ${esc(o.advice)}</p>
    <table class="grid"><thead><tr><th>Draft</th><th class="r">Score</th><th>Weakness</th></tr></thead><tbody>${o.scores.map((s) => `<tr><td><a href="#beacon">${esc(s.id)}</a></td><td class="r">${esc(s.score)}</td><td class="ash">${esc(s.weakness)}</td></tr>`).join('')}</tbody></table>
    <p class="src">Every draft waits in BEACON as a draft. Nothing publishes until you move it.</p>`;
  if (m.template === 'review' && o.lessons) return `
    <h2>The week</h2>
    <div class="two"><div><h3>Worked</h3><ul>${(o.worked || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="faint">—</li>'}</ul></div>
    <div><h3>Failed</h3><ul>${(o.failed || []).map((x) => `<li>${esc(x)}</li>`).join('') || '<li class="faint">—</li>'}</ul></div></div>
    <h3>Lessons <span class="faint">every later mission reads these</span></h3><ul>${o.lessons.map((x) => `<li class="vital">${esc(x)}</li>`).join('')}</ul>`;
  return Object.keys(o).length ? `<h2>Result</h2><pre class="small">${esc(JSON.stringify(o, null, 2).slice(0, 6000))}</pre>` : '';
}

function detail(m) {
  const v = missionView(m);
  const done = m.progress?.done || {};
  const plan = m.plan || [];
  return `<p><a href="#missions">← all missions</a></p>
    ${card(m, { open: true })}
    ${v.pending ? `<div class="flash" style="box-shadow: inset 2px 0 0 var(--amber)">Waiting at <b>${esc(v.pending.id)}</b>: ${esc(v.pending.description || '')} — answer it below, or in ${esc(ROOM_BY_ID[m.room]?.name || 'its room')}.</div>` : ''}
    ${result(m)}
    <h2>Steps</h2>
    <table class="grid"><thead><tr><th>Step</th><th>Does</th><th>Agent</th><th>Level</th><th>State</th><th>What it returned</th></tr></thead><tbody>
    ${v.steps.map((s) => { const out = done[s.id]; const p = plan.find((x) => x.id === s.id) || {}; return `<tr>
      <td><code>${esc(s.id)}</code>${s.after.length ? `<div class="faint small">after ${esc(s.after.join(', '))}</div>` : ''}</td>
      <td class="small">${esc(s.kind === 'think' ? 'reasons' : s.kind === 'action' ? s.action : s.kind)}${p.kind === 'condition' ? ` <span class="faint">${esc(JSON.stringify(p.test))}</span>` : ''}</td>
      <td class="nowrap">${dot(s.agent)}${esc(agentName(s.agent))}</td>
      <td>${s.kind === 'action' || s.kind === 'think' ? ladder(s.level) : ''}</td>
      <td>${chip(s.status, STEP_TONE[s.status])}</td>
      <td class="small ash">${out === undefined ? '' : esc(summarise(out))}</td>
    </tr>`; }).join('')}
    </tbody></table>
    <p class="src">Queued ${esc(stampFull(m.created_at))}${m.started_at ? ` · started ${esc(stampFull(m.started_at))}` : ''}${m.finished_at ? ` · finished ${esc(stampFull(m.finished_at))}` : ''} · ${m.steps_run || 0} steps run · every step is a run in <a href="#records/runs">THE RECORDS</a>.</p>`;
}

/** One line for what a step handed on. */
function summarise(out) {
  if (out === true) return 'yes';
  if (out === false) return 'no';
  if (!out || typeof out !== 'object') return String(out);
  if (out.cut) return 'a long result (kept in part)';
  if (out.notes) return `${out.notes.length} notes from the brain${out.notes[0] ? `: ${out.notes.slice(0, 3).map((n) => n.title).join(', ')}` : ''}`;
  if (out.modules) return `${out.modules.length} Archives modules${out.modules[0] ? `: ${out.modules.slice(0, 2).map((n) => n.title).join(', ')}` : ''}`;
  if (out.results) return `${out.results.length} results (${out.engine})${out.failed?.length ? ` · ${out.failed.length} searches failed` : ''}`;
  if (out.pages) return `${out.pages.length} pages read${out.failed?.length ? ` · ${out.failed.length} could not be` : ''}`;
  if (out.proposed) return `${out.proposed.length} proposed${out.skipped ? ` · ${out.skipped} already on the board` : ''}`;
  if (out.drafts) return `${out.drafts.length} drafts${out.refused?.length ? ` · ${out.refused.length} refused by the gate` : ''}`;
  if (out.queries) return `searches: ${out.queries.join(' · ')}`;
  if (out.summary) return out.summary;
  if (out.brief) return out.brief.split('\n')[0];
  if (out.title) return out.title;
  return Object.keys(out).join(', ');
}

function newForm() {
  const tpl = MISSION_TEMPLATE_BY_ID[form.template] || MISSION_TEMPLATES[0];
  return `<form class="entry-form mission-form" data-form="mission" data-template="${esc(tpl.id)}">
    <h2>New mission</h2>
    <label class="field"><span>Template</span><select name="template">${MISSION_TEMPLATES.map((t) => `<option value="${esc(t.id)}" ${t.id === tpl.id ? 'selected' : ''}>${esc(t.name)} — ${esc(agentName(t.agent))}</option>`).join('')}</select></label>
    <p class="small ash">${esc(tpl.note)}</p>
    ${Object.entries(tpl.input || {}).map(([k, f]) => k === 'question'
      ? `<label class="field"><span>${esc(k)}${f.required ? '' : ' (optional)'}</span><textarea name="in-${esc(k)}" rows="3" placeholder="${esc(f.note)}" ${f.required ? 'required' : ''}></textarea></label>`
      : `<label class="field"><span>${esc(k)}</span><input name="in-${esc(k)}" placeholder="${esc(f.note)}"></label>`).join('')}
    <div class="fields">
      <label class="field"><span>When</span><select name="schedule">${SCHEDULES.map(([c, n]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('')}</select></label>
      <label class="field"><span>Priority</span><select name="priority">${['P0', 'P1', 'P2', 'P3'].map((p, i) => `<option value="${i}" ${i === 2 ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
    </div>
    <p class="small faint">Steps: ${tpl.steps.map((s) => esc(s.id)).join(' → ')}. Highest level L${Math.max(...tpl.steps.map(stepLevel))} — nothing above L${AUTONOMY_CEILING} runs without you.</p>
    <button class="primary" type="submit">Queue it</button>
  </form>`;
}

function workerBlock(list) {
  const lastBeat = list.map((m) => m.heartbeat_at).filter(Boolean).sort().at(-1);
  const stuck = list.filter((m) => m.state === 'queued' && Date.now() - new Date(m.created_at).getTime() > 2 * 60_000);
  return `<section>
    <h2>The worker</h2>
    ${stuck.length ? `<p class="flash breach">${stuck.length} mission${stuck.length === 1 ? ' has' : 's have'} waited over two minutes — no worker is picking up the queue. On your machine: <code>npm run worker</code> (or <code>npm run dev</code>, which runs it).</p>` : ''}
    <p class="small">Last heartbeat: ${lastBeat ? esc(when(lastBeat)) : 'none yet'}.</p>
    <p class="src">Missions run on your machine, not on Vercel. Free: install Ollama, <code>ollama pull qwen3:14b</code>, set <code>ARCANE_PROVIDER=ollama</code> in .env, then <code>npm run worker</code>. Web research uses DuckDuckGo, or your own SearXNG with <code>SEARXNG_URL</code>.</p>
  </section>`;
}

function ladderBlock() {
  return `<section>
    <h2>Autonomy</h2>
    <table class="grid"><tbody>${RISK_LADDER.map((r) => `<tr class="${r.level > AUTONOMY_CEILING ? 'ash' : ''}"><td>${ladder(r.level)}</td><td><b>${esc(r.name)}</b></td><td class="small ash">${esc(r.note)}</td><td>${r.level === 5 ? chip('never', 'deny') : r.level > AUTONOMY_CEILING ? chip('asks you', 'flare') : chip('on its own', 'vital')}</td></tr>`).join('')}</tbody></table>
    <p class="src">The ceiling is the standing rules, enforced in config and again before every step.</p>
  </section>`;
}

function paint({ keepScroll = false, hash = location.hash } = {}) {
  if (!el || !store) return;
  const scroll = keepScroll ? el.scrollTop : 0;
  const list = store.missions();
  const id = /^#missions\/(.+)$/.exec(hash || '')?.[1];
  const one = id ? store.mission(decodeURIComponent(id)) : null;
  const waiting = list.filter((m) => m.state === 'paused');
  const live = list.filter((m) => ['running', 'queued'].includes(m.state));
  const standing = list.filter((m) => m.state === 'standing' || (m.schedule && m.state === 'cancelled' && !m.parent_id));
  const past = list.filter((m) => ['done', 'failed', 'cancelled'].includes(m.state) && !m.schedule).slice(0, 25);
  const sv = store.serverStatus();
  const keptForm = el.querySelector('form[data-form="mission"]');
  const pendingOrder = (m) => store.proposals(m.room).find((o) => o.id === m.pending_order);
  // A refresh repaints in place; only arriving in the room plays the entrance.
  const again = !!el.querySelector('.wrap.missions');
  el.innerHTML = `<div class="wrap app missions${again ? ' still' : ''}">
    <div class="view-head">
      <button class="back ghost" data-act="back">← Floor</button>
      <h1>MISSIONS</h1>
      <span class="sub">work the network does on its own — up to a draft; above that it asks</span>
      <span class="spacer"></span>
      <span class="${sv.tone}">● ${esc(sv.tone === 'vital' ? 'state on the server' : sv.text)}</span>
      <button class="tiny ghost" data-act="reload">refresh</button>
    </div>
    ${flash ? `<p class="flash">${esc(flash)}</p>` : ''}
    ${store.missing?.some((t) => t.table === 'missions') ? '<p class="flash breach">The missions table is not in the database yet — run <code>supabase/migrations/0013_missions.sql</code> in the Supabase SQL editor.</p>' : ''}
    <div class="bridge-grid">
      <div class="bridge-main">
        ${one ? detail(one) : id ? empty(`No mission ${id} — it may still be loading.`) : `
        <section>
          <h2>Waiting on you ${waiting.length ? `<span class="flare">${waiting.length}</span>` : ''}</h2>
          ${waiting.length ? waiting.map((m) => { const o = pendingOrder(m); return `<div class="proposal">
            ${chip('approval', 'flare')} <span class="text"><a href="#missions/${esc(m.id)}"><b>${esc(m.title)}</b></a> — ${esc(m.progress?.pending?.description || o?.t || '')}</span>
            ${o ? `<button class="tiny" data-act="mission-approve" data-room="${esc(m.room)}" data-order="${esc(o.id)}">approve</button><button class="tiny ghost" data-act="mission-reject" data-room="${esc(m.room)}" data-order="${esc(o.id)}">stop it</button>` : '<span class="faint">answered — the worker carries on at its next tick</span>'}
          </div>`; }).join('') : '<p class="empty">Nothing is waiting on you.</p>'}
        </section>
        <section>
          <h2>Running and queued <span class="faint">${live.length}</span></h2>
          ${live.length ? live.map((m) => card(m)).join('') : '<p class="empty">Nothing is running. Queue one under New mission.</p>'}
        </section>
        <section>
          <h2>Finished <span class="faint">the last ${past.length}</span></h2>
          ${past.length ? `<table class="grid"><thead><tr><th>Mission</th><th>Agent</th><th>State</th><th>Steps</th><th>Finished</th><th></th></tr></thead><tbody>${past.map((m) => `<tr>
            <td><a href="#missions/${esc(m.id)}">${esc(m.title || m.template)}</a>${m.error ? `<div class="small breach" title="${esc(m.error)}">${esc(cut(m.error, 84))}</div>` : m.template === 'research' && m.output?.summary ? `<div class="small ash" title="${esc(m.output.summary)}">${esc(cut(m.output.summary, 84))}</div>` : ''}</td>
            <td class="nowrap">${dot(m.agent)}${esc(agentName(m.agent))}</td>
            <td>${chip(m.state, STATE_TONE[m.state])}</td>
            <td class="r">${m.steps_run || 0}</td>
            <td class="ash nowrap">${esc(when(m.finished_at))}</td>
            <td><button class="tiny ghost" data-act="mission-state" data-id="${esc(m.id)}" data-state="queued">run again</button></td>
          </tr>`).join('')}</tbody></table>` : '<p class="empty">No mission has finished yet.</p>'}
        </section>`}
      </div>
      <div class="bridge-side">
        <div data-slot="form"></div>
        <section>
          <h2>Standing <span class="faint">on a schedule</span></h2>
          ${standing.length ? standing.map((m) => `<div class="proposal">
            ${chip(m.state === 'standing' ? 'on' : 'off', m.state === 'standing' ? 'arcane' : 'ash')}
            <span class="text"><b>${esc(m.title)}</b><div class="small faint"><code>${esc(m.schedule)}</code>${m.state === 'standing' && m.next_run_at ? ` · next ${esc(stampFull(m.next_run_at))}` : ''}</div></span>
            ${m.state === 'standing' ? `<button class="tiny ghost" data-act="mission-state" data-id="${esc(m.id)}" data-state="cancelled">stop</button>` : `<button class="tiny" data-act="mission-state" data-id="${esc(m.id)}" data-state="standing">resume</button>`}
          </div>`).join('') : '<p class="empty">Nothing stands on a schedule. Pick a time in “When”.</p>'}
        </section>
        ${workerBlock(list)}
        ${ladderBlock()}
      </div>
    </div>
  </div>`;
  // The form survives a refresh: a half-typed question is not lost because a mission moved.
  const slot = el.querySelector('[data-slot="form"]');
  if (keptForm && keptForm.dataset.template === form.template) slot.replaceWith(keptForm); else slot.outerHTML = newForm();
  el.scrollTop = scroll;
}

async function onSubmit(e) {
  const f = e.target.closest('form[data-form="mission"]');
  if (!f) return;
  e.preventDefault();
  const data = new FormData(f);
  const template = String(data.get('template'));
  const input = {};
  for (const [k, v] of data.entries()) if (k.startsWith('in-') && String(v).trim()) input[k.slice(3)] = String(v).trim();
  const r = await store.queueMission({ template, input, schedule: String(data.get('schedule') || ''), priority: Number(data.get('priority') || 2) });
  flash = r ? (r.state === 'standing' ? `${r.title} stands on its schedule.` : `${r.title} is queued — the worker picks it up on its next tick.`) : '';
  form = { template };
  if (r) f.reset();
  paint({ keepScroll: true });
  watch();
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'back') return go('#');
  if (act === 'reload') { await store.refreshMissions(); return paint({ keepScroll: true }); }
  if (act === 'mission-state') { await store.setMissionState(b.dataset.id, b.dataset.state); flash = ''; paint({ keepScroll: true }); return watch(); }
  if (act === 'mission-approve' || act === 'mission-reject') {
    await (act === 'mission-approve' ? store.approveProposal(b.dataset.room, b.dataset.order) : store.rejectProposal(b.dataset.room, b.dataset.order));
    flash = act === 'mission-approve' ? 'Approved — the worker carries on at its next tick.' : 'Stopped — nothing after that step will run.';
    paint({ keepScroll: true });
    return watch();
  }
}
