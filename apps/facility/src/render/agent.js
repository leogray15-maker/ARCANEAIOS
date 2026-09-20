/**
 * A reader in its room — TALLY in THE VAULT, MERIDIAN in THE LAB, VECTOR in
 * THE WAR ROOM. One section, three rooms, so an agent's report looks and
 * behaves the same wherever it appears:
 *
 *   what it read     the facts, the sources, and what the data cannot say
 *   what it thinks   the structured answer, when the model answered
 *   what it proposed the orders now waiting on the Bridge
 *
 * Nothing here acts. The buttons ask; the answer is a report and a set of
 * proposals; the operator approves those elsewhere. A reading with no model
 * ("just the reading") is offered on purpose — on a day the account has no
 * credits, what the agent read is still true and still worth seeing.
 */
import { AGENT_BY_ID, ROOM_BY_ID } from '@arcane/config';
import { api } from '../core/api.js';
import { esc, chip, when, failed } from './ui.js';

const META = new Set(['run', 'agent', 'status', 'evidence', 'problems', 'sources', 'asOf', 'usage', 'proposed', 'summary', 'error']);

/** Per-room state for one reader. Rooms keep one of these across repaints. */
export function agentState() { return { busy: false, result: null, error: null, last: null, loadedAt: 0 }; }

/** Fetch the last recorded run, so a reload still shows the last report. */
export async function loadLastRun(id, st) {
  if (Date.now() - st.loadedAt < 60_000) return;
  st.loadedAt = Date.now();
  try { const r = await api.runs.list({ agent: AGENT_BY_ID[id].name, limit: 1 }); st.last = r.runs?.[0] || null; } catch { st.last = null; }
}

export async function askAgent(id, st, { question = '', dry = false } = {}, repaint) {
  if (st.busy) return;
  st.busy = true; st.error = null; repaint();
  try { st.result = await api.agent(id, { question, dry }); st.last = null; }
  catch (e) { st.error = e; st.result = e.body && e.body.evidence ? e.body : null; }
  st.busy = false; st.loadedAt = 0; repaint();
}

/** True when the click was one of ours; the room calls repaint after. */
export function agentClick(e, id, st, repaint, { onAfter } = {}) {
  const b = e.target.closest('[data-act]'); if (!b) return false;
  if (b.dataset.act === 'agent-run' && b.dataset.agent === id) { const q = b.closest('section')?.querySelector('input[name=q]')?.value || ''; askAgent(id, st, { question: q, dry: b.dataset.dry === '1' }, () => { repaint(); onAfter?.(); }); return true; }
  return false;
}

export function agentSection(id, st, { store } = {}) {
  const a = AGENT_BY_ID[id];
  const r = st.result;
  const canAsk = store ? store.server.ready : true;
  const sys = store?.system?.ready?.items?.find((i) => i.id === 'model');
  return `<section class="reader">
    <h2><span class="dot" style="background:${a.colour}"></span>${esc(a.name)} <span class="faint">${esc(a.role)} · reads the tables, proposes, never acts</span></h2>
    <form class="inline" data-act="agent-ask" data-agent="${id}" onsubmit="return false">
      <input name="q" placeholder="A question for ${esc(a.name)}, or nothing — it reads what is there" autocomplete="off" style="flex:1;min-width:220px" ${st.busy ? 'disabled' : ''}>
      <button type="button" class="primary" data-act="agent-run" data-agent="${id}" ${st.busy || !canAsk ? 'disabled' : ''}>${st.busy ? 'reading…' : 'Read now'}</button>
      <button type="button" class="ghost" data-act="agent-run" data-agent="${id}" data-dry="1" ${st.busy || !canAsk ? 'disabled' : ''} title="What it would read, without the model">just the reading</button>
    </form>
    ${sys && sys.level === 'blocked' ? `<p class="flare">${esc(sys.title)} — "just the reading" still works; "Read now" will record a failed run.</p>` : ''}
    ${st.error && !r ? failed(st.error) : ''}
    ${r ? report(a, r, st.error) : st.last ? lastRun(a, st.last) : `<p class="empty">No reading yet.</p>`}
  </section>`;
}

function report(a, r, error) {
  const fields = Object.entries(r).filter(([k, v]) => !META.has(k) && v !== null && v !== undefined && !(Array.isArray(v) && !v.length));
  return `
    ${error ? `<p class="flash breach">${esc(error.message)}</p>` : ''}
    ${r.status === 'ok' && r.summary ? `<p class="reader-summary">${esc(r.summary)}</p>` : r.status === 'evidence' ? '<p class="ash">The reading only — the model was not asked.</p>' : r.status === 'refused' ? `<p class="flare">${esc(r.summary || 'refused')}</p>` : ''}
    ${r.status === 'ok' ? fields.map(([k, v]) => field(k, v)).join('') : ''}
    ${r.proposed?.length ? `<p class="vital">${r.proposed.length} proposal${r.proposed.length === 1 ? '' : 's'} written — <a href="#bridge">waiting on the Bridge</a> (${esc(r.proposed.join(', '))})</p>` : r.status === 'ok' ? '<p class="faint">No proposals from this reading.</p>' : ''}
    <details class="read" ${r.status !== 'ok' ? 'open' : ''}>
      <summary>What ${esc(a.name)} read <span class="faint">· run ${esc(r.run)} · ${when(r.asOf)}${r.usage ? ` · ${r.usage.in + r.usage.out} tokens` : ''}</span></summary>
      ${r.problems?.length ? `<p class="flare"><b>What the data cannot say:</b> ${r.problems.map(esc).join(' · ')}</p>` : '<p class="vital">The data was complete for this reading.</p>'}
      <p class="faint">Sources: ${(r.sources || []).map((s) => chip(s, 'ash')).join(' ')}</p>
      <pre class="body evidence">${esc(JSON.stringify(r.evidence, null, 1).replace(/^[{}]\n?/gm, '').replace(/^ /gm, ''))}</pre>
    </details>`;
}

function lastRun(a, run) {
  const out = run.output || {};
  return `<p class="ash">Last reading ${when(run.started_at)} · ${chip(run.status, run.status === 'ok' ? 'vital' : run.status === 'evidence' ? 'ash' : 'deny')} <a class="faint" href="#records/runs">${esc(run.id)}</a>${run.error ? ` · <span class="breach">${esc(run.error)}</span>` : ''}</p>
    ${run.status === 'ok' && out.summary ? `<p class="reader-summary">${esc(out.summary)}</p>${out.proposed?.length ? `<p class="faint">${out.proposed.length} proposal(s) written then.</p>` : ''}` : ''}`;
}

/** One structured field of a report, rendered by shape rather than by name. */
function field(k, v) {
  const title = k.replace(/_/g, ' ');
  if (typeof v === 'string') return `<h3>${esc(title)}</h3><p>${esc(v)}</p>`;
  if (Array.isArray(v)) {
    if (!v.length) return '';
    if (typeof v[0] !== 'object') return `<h3>${esc(title)}</h3><ul>${v.map((x) => `<li>${esc(String(x))}</li>`).join('')}</ul>`;
    const cols = Object.keys(v[0]).filter((c) => c !== 'why' && c !== 'detail' && c !== 'evidence' && c !== 'case' && c !== 'effect');
    const long = Object.keys(v[0]).filter((c) => !cols.includes(c));
    return `<h3>${esc(title)}</h3><table class="grid"><thead><tr>${cols.map((c) => `<th>${esc(c.replace(/_/g, ' '))}</th>`).join('')}</tr></thead><tbody>
      ${v.map((row) => `<tr>${cols.map((c) => `<td>${cell(c, row[c])}</td>`).join('')}</tr>${long.length ? `<tr class="why-row"><td colspan="${cols.length}" class="ash">${long.map((c) => `<b>${esc(c)}:</b> ${esc(String(row[c] ?? ''))}`).join(' · ')}</td></tr>` : ''}`).join('')}
    </tbody></table>`;
  }
  if (typeof v === 'object') return `<h3>${esc(title)}</h3><div class="card">${Object.entries(v).map(([kk, vv]) => `<p><b>${esc(kk)}:</b> ${esc(String(vv))}</p>`).join('')}</div>`;
  return `<h3>${esc(title)}</h3><p>${esc(String(v))}</p>`;
}
function cell(c, v) {
  if (c === 'room') return `<a href="#room/${esc(v)}">${esc(ROOM_BY_ID[v]?.name || v)}</a>`;
  if (c === 'priority') return chip(String(v), { P0: 'deny', P1: 'flare', P2: 'arcane', P3: 'ash' }[v] || 'ash');
  if (c === 'venture' || c === 'where' || c === 'source') return chip(String(v), 'ash');
  return esc(String(v ?? ''));
}
