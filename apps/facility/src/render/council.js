/**
 * THE COUNCIL — one question, several models, one verdict.
 *
 *   #council          ask; the answers from each seat (one per lab) side by
 *                     side; the judge's verdict with where they agreed and
 *                     where they split; the verdicts already given
 *   #council/<id>     one past verdict
 *
 * The run is the `council` agent (packages/agents/src/agents/council.js).
 * Seats a deployment may not call — a paid model with ALLOW_PAID_MODELS
 * off, a provider without a key — are shown as absent with the reason.
 */
import { api } from '../core/api.js';
import { esc, chip, when, stampFull, loading, failed, empty, handleKeyForm } from './ui.js';

const CALL_TONE = { BUILD: 'vital', DELAY: 'flare', WATCH: 'cyan', KILL: 'deny', ANSWER: 'arcane' };
const st = { past: null, current: null, sitting: false, error: null, draft: { question: '', context: '' }, loadedAt: 0 };
let el = null, go = null;

export function bindCouncil(view, ctx) {
  el = view; go = ctx.go;
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('input', (e) => { if (e.target.name === 'question' || e.target.name === 'context') st.draft[e.target.name] = e.target.value; });
}
export function renderCouncil(view, ctx, hash = '#council') {
  el = view;
  if ((!st.past && !st.error) || Date.now() - st.loadedAt > 60_000) load();
  paint(hash);
}
async function load() {
  st.loadedAt = Date.now();
  try { st.past = (await api.ai.outputs({ room: 'council', type: 'verdict', limit: 20 })).outputs; st.error = null; } catch (e) { st.error = e; }
  paint(location.hash);
}

function paint(hash) {
  if (!el) return;
  const id = /^#council\/(OUT-\d{8}-\d{3})/.exec(hash || '')?.[1];
  const shown = id ? st.past?.find((o) => o.id === id)?.data : st.current;
  el.innerHTML = `<div class="wrap app council">
    <div class="view-head">
      <button class="back ghost" data-act="${id ? 'council' : 'back'}">← ${id ? 'Council' : 'Floor'}</button>
      <h1>THE COUNCIL</h1>
      <span class="sub">one question · several models · one verdict</span>
      <span class="spacer"></span>
      <a class="faint" href="#garage/council">runs</a>
    </div>
    ${id ? '' : askBlock()}
    ${st.sitting ? `<p class="state loading">The Council is sitting — each seat answers on its own, then the judge weighs them. This takes a minute or two.</p>` : ''}
    ${st.runError ? `<div class="state error-state"><p><b>The Council could not sit.</b> ${esc(st.runError)}</p></div>` : ''}
    ${shown ? verdictBlock(shown) : id && st.past ? empty('No such verdict.') : ''}
    ${id ? '' : pastBlock()}
  </div>`;
}

function askBlock() {
  return `<section>
    <form class="council-ask" data-act="ask">
      <label class="field">The question<textarea name="question" rows="3" maxlength="2000" required placeholder="Should I raise the Archives price to £148 this month?" ${st.sitting ? 'disabled' : ''}>${esc(st.draft.question)}</textarea></label>
      <label class="field">Context (optional)<textarea name="context" rows="2" maxlength="4000" placeholder="Numbers, constraints, what you already know." ${st.sitting ? 'disabled' : ''}>${esc(st.draft.context)}</textarea></label>
      <p><button class="primary" type="submit" ${st.sitting ? 'disabled' : ''}>${st.sitting ? 'sitting…' : 'Put it to the Council'}</button> <span class="faint">Free models always sit; paid seats only with ALLOW_PAID_MODELS=true, inside the budget.</span></p>
    </form>
  </section>`;
}

function verdictBlock(d) {
  const v = d.verdict;
  return `<section class="verdict">
    <h2>${chip(v.call, CALL_TONE[v.call] || 'ash')} ${esc(v.headline)}</h2>
    <p class="ash">“${esc(d.question)}” · judged by ${esc(d.judge?.label || d.judge?.model || '—')} · confidence ${esc(v.confidence)}</p>
    <p>${esc(v.reasoning)}</p>
    <div class="bridge-grid">
      <div class="bridge-main">
        <h3>Where they agreed</h3>
        ${v.agreed.length ? `<ul>${v.agreed.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="faint">Nothing all seats agreed on.</p>'}
        <h3>Where they split</h3>
        ${v.disagreed.length ? v.disagreed.map((x) => `<div class="order-row"><span class="text"><b>${esc(x.point)}</b>${x.positions.map((p) => `<br>${chip(p.seat, 'ash')} ${esc(p.stance)}`).join('')}</span></div>`).join('') : '<p class="faint">No split worth recording.</p>'}
      </div>
      <aside class="bridge-side">
        <h3>Conditions</h3>
        ${v.conditions.length ? `<ul>${v.conditions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="faint">None.</p>'}
      </aside>
    </div>
    <h3>The seats <span class="faint">${d.answers.length} sat${d.absent?.length ? ` · ${d.absent.length} absent` : ''}</span></h3>
    <div class="council-seats">${d.answers.map((a) => `<div class="state"><p>${chip(a.seat, 'arcane')} <b>${esc(a.label)}</b> ${chip(a.free ? 'free' : 'paid', a.free ? 'vital' : 'flare')} <span class="faint">${(a.latencyMs / 1000).toFixed(1)}s</span></p><p class="pre">${esc(a.text)}</p></div>`).join('')}</div>
    ${d.absent?.length ? `<details><summary class="faint">Absent seats and why</summary>${d.absent.map((a) => `<p class="ash">${chip(a.seat, 'ash')} ${esc(String(a.reason).slice(0, 300))}</p>`).join('')}</details>` : ''}
  </section>`;
}

function pastBlock() {
  if (st.error) return failed(st.error, { retry: 'reload' });
  if (!st.past) return loading('past verdicts');
  return `<section><h2>Verdicts given <span class="faint">${st.past.length}</span></h2>
    ${st.past.length ? st.past.map((o) => `<div class="order-row"><span>${chip(o.data?.verdict?.call || '—', CALL_TONE[o.data?.verdict?.call] || 'ash')}</span><a class="text" href="#council/${esc(o.id)}">${esc(o.title)}</a><span class="ash">${esc(o.data?.verdict?.headline || '')}</span><span class="faint nowrap" title="${esc(stampFull(o.created_at))}">${when(o.created_at)}</span></div>`).join('') : empty('The Council has not sat yet.')}
  </section>`;
}

async function onSubmit(e) {
  const f = e.target; e.preventDefault();
  if (handleKeyForm(f, load)) return;
  if (f.dataset.act !== 'ask' || st.sitting) return;
  const question = f.question.value.trim(), context = f.context.value.trim();
  st.sitting = true; st.runError = null; st.current = null; paint(location.hash);
  try {
    const r = await api.ai.run('council', context ? { question, context } : { question });
    st.current = r.data; st.draft = { question: '', context: '' };
  } catch (err) { st.runError = err.message; }
  st.sitting = false;
  await load();
}
function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'FORM') return;
  if (b.dataset.act === 'back') go('#');
  else if (b.dataset.act === 'council') go('#council');
  else if (b.dataset.act === 'reload') load();
}
