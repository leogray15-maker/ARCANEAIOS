/**
 * The Trading Journal — the view. A full page with six tabs: Trades,
 * Daily, Weekly, Monthly, Playbook, Psychology, plus the entry form. Reads
 * and writes the store's journal slice through `bindJournal`. Two charts
 * on a canvas: the equity curve and the R distribution, single-series,
 * thin marks, a readout under each on hover.
 */
import { derive, stats, groupBy, equity, distribution, exampleTrades, fmtR, fmtPct, fmtGbp, SESSIONS, KILLZONES, GRADES, PROCESS, EMOTIONS, RULE_BREAKS, EDGES, URGES, BIAS, SEED_SETUPS } from '../core/journal.js';
import { esc } from './widgets.js';

// Until the playbook has been written into the database, the starter setups stand in, so the
// card has something to choose and the trades that name them still read by name.
const setupsOf = (store) => (store.setups().length ? store.setups() : SEED_SETUPS);
const TABS = [['trades', 'TRADES'], ['new', 'NEW TRADE'], ['daily', 'DAILY'], ['weekly', 'WEEKLY'], ['monthly', 'MONTHLY'], ['playbook', 'PLAYBOOK'], ['psychology', 'PSYCHOLOGY']];
const chip = (text, tone = '') => `<span class="chip ${tone}">${esc(text)}</span>`;
const tone = (o) => (o === 'Win' ? 'vital' : o === 'Loss' ? 'deny' : o === 'Open' ? 'cyan' : 'ash');
const opt = (list, cur, blank = false) => (blank ? '<option value=""></option>' : '') + list.map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${esc(label)}</span>${inner}</label>`;
// A group of checkboxes is a fieldset, not a label: a label may hold one control, and nesting
// labels made a click anywhere in the group toggle the first box.
const group = (label, inner, cls = '') => `<div class="field ${cls}" role="group"><span>${esc(label)}</span>${inner}</div>`;
const checks = (name, list, cur = [], tone = '') => `<div class="checks pills ${tone}">${list.map((v) => `<label class="chk"><input type="checkbox" name="${name}" value="${esc(v)}" ${cur.includes(v) ? 'checked' : ''}><i></i>${esc(v)}</label>`).join('')}</div>`;
const toggle = (name, on, text, tone = 'vital') => `<div class="checks pills ${tone}"><label class="chk"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><i></i>${esc(text)}</label></div>`;
const segment = (name, list, cur) => `<div class="segment">${list.map((v, i) => `<label class="${v.toLowerCase()}"><input type="radio" name="${name}" value="${esc(v)}" ${(cur ? v === cur : i === 0) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div>`;
const panel = (title, note, inner) => `<section class="jr-panel"><h4>${esc(title)}${note ? ` <span class="faint">${esc(note)}</span>` : ''}</h4>${inner}</section>`;

/** The numbers a trade card implies, read live while it is filled in. */
function readout(d) {
  const cell = (k, v, cls = '') => `<div class="${cls}"><span>${k}</span><b>${v}</b></div>`;
  return cell('Stop distance', d.stopDist !== null ? d.stopDist.toFixed(2) : '—')
    + cell('Planned R', d.plannedR ? `${d.plannedR.toFixed(2)}R` : '—', d.plannedR >= 2 ? 'vital' : d.plannedR ? 'flare' : '')
    + cell('Result', d.r !== null ? fmtR(d.r) : 'open', d.r > 0.2 ? 'vital' : d.r < -0.2 ? 'breach' : '')
    + cell('P&amp;L', fmtGbp(d.pnl), d.pnl > 0 ? 'vital' : d.pnl < 0 ? 'breach' : '');
}

function statRow(s) {
  return `<div class="stat-row">
    <div class="stat"><b>${s.n}</b><span>closed trades</span></div>
    <div class="stat"><b>${fmtPct(s.winRate)}</b><span>win rate</span></div>
    <div class="stat ${s.totalR >= 0 ? 'vital' : 'breach'}"><b>${fmtR(s.totalR)}</b><span>total R</span></div>
    <div class="stat"><b>${fmtR(s.avgR)}</b><span>expectancy / trade</span></div>
    <div class="stat"><b>${s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)}</b><span>profit factor</span></div>
    <div class="stat ${s.pnl >= 0 ? 'vital' : 'breach'}"><b>${fmtGbp(s.pnl)}</b><span>P&amp;L</span></div>
    <div class="stat"><b>${fmtR(-s.maxDD)}</b><span>max drawdown</span></div>
    <div class="stat"><b>${fmtPct(s.planRate)}</b><span>plan followed</span></div>
  </div>`;
}

function tradeRow(t, store) {
  const d = derive(t);
  const setup = setupsOf(store).find((s) => s.id === t.setup)?.name || '—';
  return `<tr data-act="trade-open" data-id="${esc(t.id)}" style="cursor:pointer">
    <td class="faint">${esc(t.id)}</td><td>${esc((t.opened || '').replace('T', ' '))}</td><td>${esc(t.instrument || '')}</td>
    <td>${chip(t.direction, t.direction === 'Long' ? 'vital' : 'breach')}</td><td>${esc(setup)}</td><td>${esc(t.grade || '')}</td>
    <td class="r">${d.plannedR ? d.plannedR.toFixed(1) : '—'}</td><td class="r"><b>${fmtR(d.r)}</b></td><td class="r">${fmtGbp(d.pnl)}</td>
    <td>${chip(d.outcome, tone(d.outcome))}</td><td>${t.planFollowed ? chip('plan', 'vital') : ''}${(t.ruleBreaks || []).length ? chip(`${t.ruleBreaks.length} break${t.ruleBreaks.length > 1 ? 's' : ''}`, 'flare') : ''}</td>
  </tr>`;
}
const tradeTable = (ts, store) => ts.length ? `<table class="grid"><thead><tr><th>Trade</th><th>Opened</th><th>Inst.</th><th>Dir</th><th>Setup</th><th>Grade</th><th class="r">Plan R</th><th class="r">R</th><th class="r">P&amp;L</th><th>Outcome</th><th></th></tr></thead><tbody>${ts.map((t) => tradeRow(t, store)).join('')}</tbody></table>` : '<p class="empty">No trades here yet.</p>';

/* ---------------- tabs ---------------- */

function tabTrades(store) {
  const ts = store.trades();
  const open = ts.filter((t) => derive(t).outcome === 'Open');
  return `${statRow(stats(ts))}
    <div class="two"><div><h3>Equity curve <span class="faint">cumulative R</span></h3><canvas class="chart" data-chart="equity"></canvas><p class="faint chart-read" data-read="equity">&nbsp;</p></div>
    <div><h3>R distribution <span class="faint">half-R buckets</span></h3><canvas class="chart" data-chart="dist"></canvas><p class="faint chart-read" data-read="dist">&nbsp;</p></div></div>
    ${open.length ? `<h3>Open</h3>${tradeTable(open, store)}` : ''}
    <h3>All trades <span class="faint">newest first</span></h3>${tradeTable(ts, store)}
    ${!ts.length ? '<p><button data-act="example">Load ten example trades</button> <span class="ash">to see the journal working — delete them when the real ones arrive.</span></p>' : ts.every((t) => t.example) ? '<p><button class="ghost tiny" data-act="clear-examples">Remove the example trades</button></p>' : ''}
    <p class="src">Card before the next trade. An unlogged trade is an Unplanned trade.</p>`;
}

function tabNew(store, id) {
  const t = id ? store.trade(id) : null;
  const v = (k, d = '') => esc(t?.[k] ?? d);
  const now = new Date(); now.setSeconds(0, 0);
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const dd = derive(t || {});
  return `<form class="jr-form" data-act="trade-save" data-id="${esc(t?.id || '')}">
    ${t ? `<p class="ash">${esc(t.id)} · ${chip(dd.outcome, tone(dd.outcome))} ${fmtR(dd.r)} · ${fmtGbp(dd.pnl)}</p>` : ''}
    <div class="jr-live" data-live>${readout(dd)}</div>
    <h3>Before <span class="faint">fill in under sixty seconds, before the order</span></h3>
    <div class="jr-grid">
      ${panel('The setup', '', `<div class="fields">
        ${field('Opened', `<input type="datetime-local" name="opened" value="${v('opened', local(now))}" required>`)}
        ${field('Instrument', `<input name="instrument" value="${v('instrument', 'XAUUSD')}">`)}
        ${group('Direction', segment('direction', ['Long', 'Short'], t?.direction))}
        ${field('Setup', `<select name="setup">${setupsOf(store).map((s) => `<option value="${esc(s.id)}" ${s.id === (t?.setup || 'unplanned') ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`)}
        ${field('Session', `<select name="session">${opt(SESSIONS, t?.session, true)}</select>`)}
        ${field('Killzone', `<select name="killzone">${opt(KILLZONES, t?.killzone, true)}</select>`)}
        ${field('HTF bias', `<select name="bias">${opt(BIAS, t?.bias, true)}</select>`)}
        ${field('Setup grade', `<select name="grade">${opt(GRADES, t?.grade, true)}</select>`)}
      </div>`)}
      ${panel('Levels and risk', '', `<div class="fields">
        ${field('Entry', `<input class="num" type="number" step="any" name="entry" value="${v('entry')}" required>`)}
        ${field('Stop', `<input class="num" type="number" step="any" name="stop" value="${v('stop')}" required>`)}
        ${field('Target', `<input class="num" type="number" step="any" name="target" value="${v('target')}">`)}
        ${field('Conviction 1–5', `<input class="num" type="number" name="conviction" min="1" max="5" value="${v('conviction')}">`)}
        ${field('Risk £', `<input class="num" type="number" step="any" name="risk" value="${v('risk')}">`)}
        ${field('Size (lots)', `<input class="num" type="number" step="any" name="size" value="${v('size')}">`)}
      </div>`)}
      ${panel('State', 'how you walked in', `<div class="fields">
        ${field('Emotion before', `<select name="emotionBefore">${opt(EMOTIONS, t?.emotionBefore, true)}</select>`)}
        ${field('Energy 1–5', `<input class="num" type="number" name="energy" min="1" max="5" value="${v('energy')}">`)}
        ${field('Sleep (h)', `<input class="num" type="number" step="0.5" name="sleep" value="${v('sleep')}">`)}
        ${field('Stress 1–5', `<input class="num" type="number" name="stress" min="1" max="5" value="${v('stress')}">`)}
      </div>`)}
      ${panel('The read', '', `${field('Thesis', `<textarea name="thesis" rows="3" placeholder="why this, why here, why now">${v('thesis')}</textarea>`)}
        ${group('Edge seen', checks('edges', EDGES, t?.edges, 'arcane'))}`)}
    </div>
    <h3>After <span class="faint">fill in before the next trade</span></h3>
    <div class="jr-grid">
      ${panel('The exit', '', `<div class="fields">
        ${field('Closed', `<input type="datetime-local" name="closed" value="${v('closed')}">`)}
        ${field('Exit', `<input class="num" type="number" step="any" name="exit" value="${v('exit')}">`)}
        ${field('Process grade', `<select name="process">${opt(PROCESS, t?.process, true)}</select>`)}
        ${field('Chart URL', `<input name="chart" value="${v('chart')}" placeholder="TradingView link">`)}
        ${field('Emotion during', `<select name="emotionDuring">${opt(EMOTIONS, t?.emotionDuring, true)}</select>`)}
        ${field('Emotion after', `<select name="emotionAfter">${opt(EMOTIONS, t?.emotionAfter, true)}</select>`)}
      </div>
      <div class="jr-toggles">${toggle('planFollowed', t?.planFollowed, 'Plan followed')}${toggle('streamed', t?.streamed, 'Streamed on Kick', 'arcane')}</div>`)}
      ${panel('Discipline', 'tick only what happened', group('Rule breaks', checks('ruleBreaks', RULE_BREAKS, t?.ruleBreaks, 'breach')))}
      ${panel('Review', '', `<div class="fields two-up">
        ${field('Execution', `<textarea name="execution" rows="3">${v('execution')}</textarea>`)}
        ${field('Review', `<textarea name="review" rows="3">${v('review')}</textarea>`)}
      </div>
      ${field('Lesson', `<input name="lesson" value="${v('lesson')}" placeholder="one sentence, or blank">`)}`)}
    </div>
    <div class="acts jr-acts"><button type="submit" class="primary">${t ? 'Save trade' : 'Log trade'}</button> ${t ? `<button type="button" class="ghost" data-act="trade-delete" data-id="${esc(t.id)}">Delete</button>` : ''} <button type="button" class="ghost" data-act="tab" data-tab="trades">Cancel</button></div>
  </form>`;
}

function periodTab(store, keyOf, label) {
  const groups = groupBy(store.trades(), keyOf);
  if (!groups.length) return '<p class="empty">Nothing logged yet.</p>';
  return `<table class="grid"><thead><tr><th>${esc(label)}</th><th class="r">Trades</th><th class="r">Win rate</th><th class="r">R</th><th class="r">Avg R</th><th class="r">P&amp;L</th><th class="r">Plan</th><th class="r">Breaks</th></tr></thead><tbody>${groups.map((g) => `<tr><td><b>${esc(g.key)}</b></td><td class="r">${g.stats.n}</td><td class="r">${fmtPct(g.stats.winRate)}</td><td class="r ${g.stats.totalR >= 0 ? 'vital' : 'breach'}">${fmtR(g.stats.totalR)}</td><td class="r">${fmtR(g.stats.avgR)}</td><td class="r">${fmtGbp(g.stats.pnl)}</td><td class="r">${fmtPct(g.stats.planRate)}</td><td class="r">${g.stats.ruleBreaks}</td></tr>`).join('')}</tbody></table>`;
}

function breakdown(trades, store, keyOf, label) {
  const groups = groupBy(trades, keyOf).sort((a, b) => b.stats.totalR - a.stats.totalR);
  if (!groups.length) return '';
  return `<h3>${esc(label)}</h3><table class="grid"><thead><tr><th>${esc(label)}</th><th class="r">Trades</th><th class="r">Win rate</th><th class="r">Avg R</th><th class="r">Total R</th></tr></thead><tbody>${groups.map((g) => `<tr><td>${esc(g.key)}</td><td class="r">${g.stats.n}</td><td class="r">${fmtPct(g.stats.winRate)}</td><td class="r">${fmtR(g.stats.avgR)}</td><td class="r ${g.stats.totalR >= 0 ? 'vital' : 'breach'}">${fmtR(g.stats.totalR)}</td></tr>`).join('')}</tbody></table>`;
}

function tabMonthly(store) {
  const ts = store.trades();
  const months = groupBy(ts, (t, d) => d.month);
  const cur = months[0];
  const setupName = (id) => setupsOf(store).find((s) => s.id === id)?.name || 'Unplanned';
  return `${periodTab(store, (t, d) => d.month, 'Month')}
    ${cur ? `<h3>${esc(cur.key)} — the evidence</h3>${statRow(cur.stats)}
      <div class="two">
        <div>${breakdown(cur.trades, store, (t) => setupName(t.setup), 'By setup')}${breakdown(cur.trades, store, (t, d) => (d.hour === null ? '' : `${String(d.hour).padStart(2, '0')}:00`), 'By hour')}</div>
        <div>${breakdown(cur.trades, store, (t) => t.emotionBefore || '', 'By emotion before')}${breakdown(cur.trades, store, (t) => (t.energy ? `Energy ${t.energy}` : ''), 'By energy')}${breakdown(cur.trades, store, (t) => (t.killzone || ''), 'By killzone')}</div>
      </div>` : ''}`;
}

function tabPlaybook(store) {
  const ts = store.trades();
  const cards = store.setups().map((s) => {
    const mine = ts.filter((t) => t.setup === s.id); const st = stats(mine);
    return `<div class="card">
      <div class="card-head"><b>${esc(s.name)}</b> ${chip(s.status, s.status === 'Active' ? 'vital' : s.status === 'Testing' ? 'flare' : 'ash')} ${s.session ? chip(s.session) : ''} ${s.tf ? chip(s.tf) : ''}<span class="spacer"></span></div>
      <div class="stat-row" style="margin:6px 0 10px"><div class="stat"><b>${st.n}</b><span>trades</span></div><div class="stat"><b>${fmtPct(st.winRate)}</b><span>win rate</span></div><div class="stat"><b>${fmtR(st.avgR)}</b><span>avg R</span></div><div class="stat ${st.totalR >= 0 ? 'vital' : 'breach'}"><b>${fmtR(st.totalR)}</b><span>total R</span></div></div>
      <dl class="kv">${[['Conditions', s.conditions], ['Trigger', s.trigger], ['Stop', s.stop], ['Target', s.target], ['A+ when', s.aplus], ['Invalidation', s.invalidation]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <div class="acts"><button class="tiny" data-act="setup-edit" data-id="${esc(s.id)}">Edit</button>${s.id !== 'unplanned' ? `<button class="tiny ghost" data-act="setup-delete" data-id="${esc(s.id)}">Delete</button>` : ''}</div>
    </div>`;
  }).join('');
  const seed = !store.setups().length ? `<p class="ash">The playbook is empty. <button class="tiny" data-act="seed-setups">Add the four starter setups</button> London Sweep, Silver Bullet, NY Reversal and Unplanned, to edit into your own.</p>` : '';
  return `${seed}${cards}<h3>New setup</h3>${setupForm(null)}<p class="src">Retire a setup after 20 trades of negative expectancy. Promote from Testing to Active after 20 with positive.</p>`;
}
function setupForm(s) {
  const v = (k) => esc(s?.[k] || '');
  return `<form data-act="setup-save" data-id="${esc(s?.id || '')}"><div class="fields">
    ${field('Name', `<input name="name" value="${v('name')}" required>`)}${field('Status', `<select name="status">${opt(['Active', 'Testing', 'Retired'], s?.status || 'Testing')}</select>`)}
    ${field('Best session', `<select name="session">${opt(SESSIONS, s?.session, true)}</select>`)}${field('Timeframes', `<input name="tf" value="${v('tf')}" placeholder="4H bias · 5m entry">`)}
    ${field('Conditions', `<textarea name="conditions" rows="2">${v('conditions')}</textarea>`, 'wide')}${field('Trigger', `<textarea name="trigger" rows="2">${v('trigger')}</textarea>`, 'wide')}
    ${field('Stop rule', `<input name="stop" value="${v('stop')}">`)}${field('Target rule', `<input name="target" value="${v('target')}">`)}
    ${field('A+ criteria', `<input name="aplus" value="${v('aplus')}">`)}${field('Invalidation', `<input name="invalidation" value="${v('invalidation')}">`)}
  </div><div class="acts"><button type="submit" class="primary">${s ? 'Save setup' : 'Add setup'}</button>${s ? ` <button type="button" class="ghost" data-act="tab" data-tab="playbook">Cancel</button>` : ''}</div></form>`;
}

function tabPsychology(store) {
  const cs = store.checkins();
  const urges = cs.filter((c) => c.type === 'Urge');
  return `<div class="stat-row"><div class="stat"><b>${cs.length}</b><span>check-ins</span></div><div class="stat"><b>${urges.length}</b><span>urges logged</span></div><div class="stat ${urges.length && urges.filter((u) => !u.acted).length === urges.length ? 'vital' : ''}"><b>${urges.length ? fmtPct(urges.filter((u) => !u.acted).length / urges.length) : '—'}</b><span>urges resisted</span></div></div>
    <h3>Check in</h3><form data-act="checkin-save"><div class="fields">
      ${field('Type', `<select name="type">${opt(['Pre-market', 'Post-session', 'Urge'], 'Pre-market')}</select>`)}${field('Mood', `<select name="mood">${opt(EMOTIONS, '', true)}</select>`)}
      ${field('Energy 1–5', '<input type="number" name="energy" min="1" max="5">')}${field('Stress 1–5', '<input type="number" name="stress" min="1" max="5">')}${field('Sleep (h)', '<input type="number" step="0.5" name="sleep">')}
      ${group('Urge', checks('urges', URGES, [], 'flare'), 'wide')}${group('Acted on it', toggle('acted', false, 'yes', 'breach'))}
      ${field('Trigger', '<input name="trigger" placeholder="what set it off">', 'wide')}${field('Note', '<textarea name="note" rows="2"></textarea>', 'wide')}
    </div><div class="acts"><button type="submit" class="primary">Log</button></div></form>
    <h3>Log</h3>${cs.length ? `<table class="grid"><thead><tr><th>When</th><th>Type</th><th>Mood</th><th class="r">E / S</th><th>Urge</th><th>Acted</th><th>Note</th><th></th></tr></thead><tbody>${cs.map((c) => `<tr><td class="faint">${new Date(c.ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td><td>${chip(c.type, c.type === 'Urge' ? 'flare' : 'ash')}</td><td>${esc(c.mood || '')}</td><td class="r">${c.energy || '—'} / ${c.stress || '—'}</td><td>${(c.urges || []).map((u) => chip(u)).join('')}</td><td>${c.type === 'Urge' ? (c.acted ? chip('acted', 'deny') : chip('held', 'vital')) : ''}</td><td class="ash">${esc([c.trigger, c.note].filter(Boolean).join(' — '))}</td><td><button class="tiny ghost" data-act="checkin-delete" data-id="${c.id}">×</button></td></tr>`).join('')}</tbody></table>` : '<p class="empty">Nothing logged. The urges you did not act on are the data that shows the discipline is working.</p>'}`;
}

/* ---------------- charts ---------------- */

function drawCharts(el, store) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const style = getComputedStyle(document.documentElement);
  const c = (n) => style.getPropertyValue(n).trim();
  for (const cv of el.querySelectorAll('canvas.chart')) {
    const W = cv.clientWidth, H = cv.clientHeight; if (!W) continue;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.font = `11px ${c('--mono')}`; g.fillStyle = c('--faint');
    const pad = { l: 62, r: 16, t: 16, b: 24 };
    const read = el.querySelector(`[data-read="${cv.dataset.chart}"]`);
    if (cv.dataset.chart === 'equity') {
      const pts = equity(store.trades());
      if (pts.length < 1) { g.fillText('No closed trades yet.', pad.l, H / 2); continue; }
      const ys = [0, ...pts.map((p) => p.cum)]; const lo = Math.min(...ys), hi = Math.max(...ys); const span = hi - lo || 1;
      const X = (i) => pad.l + (i / pts.length) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b);
      g.strokeStyle = c('--line-2'); g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(W - pad.r, Y(0)); g.stroke(); g.setLineDash([]);
      g.fillStyle = c('--faint'); g.textAlign = 'right'; g.fillText(fmtR(hi), pad.l - 8, pad.t + 4); g.fillText(fmtR(lo), pad.l - 8, H - pad.b + 4);
      if (Math.abs(Y(0) - pad.t) > 14 && Math.abs(Y(0) - (H - pad.b)) > 14) g.fillText('0', pad.l - 8, Y(0) + 4);
      g.textAlign = 'left';
      const line = c('--arcaneLt') || '#a99cff';
      const fill = g.createLinearGradient(0, pad.t, 0, H - pad.b); fill.addColorStop(0, line); fill.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.beginPath(); g.moveTo(X(0), Y(0)); pts.forEach((p, i) => g.lineTo(X(i + 1), Y(p.cum))); g.lineTo(X(pts.length), Y(lo)); g.lineTo(X(0), Y(lo)); g.closePath(); g.fillStyle = fill; g.globalAlpha = 0.16; g.fill(); g.globalAlpha = 1;
      g.strokeStyle = line; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); g.moveTo(X(0), Y(0));
      pts.forEach((p, i) => g.lineTo(X(i + 1), Y(p.cum))); g.stroke();
      pts.forEach((p, i) => { g.beginPath(); g.arc(X(i + 1), Y(p.cum), 3, 0, Math.PI * 2); g.fillStyle = p.r < 0 ? c('--breach') || line : line; g.fill(); });
      const last = pts.at(-1); g.fillStyle = c('--ink'); g.textAlign = 'right'; g.fillText(fmtR(last.cum), X(pts.length) - 8, Math.max(pad.t + 10, Y(last.cum) - 10)); g.textAlign = 'left';
      cv.onmousemove = (e) => { const i = Math.round(((e.offsetX - pad.l) / (W - pad.l - pad.r)) * pts.length) - 1; const p = pts[Math.max(0, Math.min(pts.length - 1, i))]; if (read) read.textContent = `${p.id} · ${(p.when || '').replace('T', ' ')} · ${fmtR(p.r)} · cumulative ${fmtR(p.cum)}`; };
      cv.onmouseleave = () => { if (read) read.innerHTML = '&nbsp;'; };
    } else {
      const bs = distribution(store.trades());
      if (!bs.length) { g.fillText('No closed trades yet.', pad.l, H / 2); continue; }
      const max = Math.max(...bs.map((b) => b.n), 1); const bw = (W - pad.l - pad.r) / bs.length;
      const Y = (n) => pad.t + (1 - n / max) * (H - pad.t - pad.b);
      g.strokeStyle = c('--line-2'); g.beginPath(); g.moveTo(pad.l, H - pad.b); g.lineTo(W - pad.r, H - pad.b); g.stroke();
      bs.forEach((b, i) => { const x = pad.l + i * bw + 1, w = Math.max(2, bw - 2); g.fillStyle = b.r > 0.2 ? '#2fb87a' : b.r < -0.2 ? c('--breach') : c('--ash'); if (b.n) g.fillRect(x, Y(b.n), w, H - pad.b - Y(b.n)); if (i % Math.ceil(bs.length / 8) === 0) { g.fillStyle = c('--faint'); g.textAlign = 'center'; g.fillText(`${b.r}`, x + w / 2, H - 6); g.textAlign = 'left'; } });
      g.fillStyle = c('--faint'); g.textAlign = 'right'; g.fillText(String(max), pad.l - 6, pad.t + 4); g.textAlign = 'left';
      cv.onmousemove = (e) => { const i = Math.max(0, Math.min(bs.length - 1, Math.floor((e.offsetX - pad.l) / bw))); const b = bs[i]; if (read) read.textContent = `${fmtR(b.r)} bucket · ${b.n} trade${b.n === 1 ? '' : 's'}`; };
      cv.onmouseleave = () => { if (read) read.innerHTML = '&nbsp;'; };
    }
  }
}

/* ---------------- render + bind ---------------- */

let editingSetup = null;

export function renderJournal(el, { store }, hash = '#journal', { keepScroll = false } = {}) {
  const m = /^#journal(?:\/([a-z]+))?(?:\/([^/]+))?/.exec(hash) || [];
  const tab = m[1] || 'trades', arg = m[2] || '';
  const scroll = keepScroll ? el.scrollTop : 0;
  const body = tab === 'new' || tab === 'trade' ? tabNew(store, arg) : tab === 'daily' ? periodTab(store, (t, d) => d.day, 'Day') : tab === 'weekly' ? periodTab(store, (t, d) => d.week, 'Week')
    : tab === 'monthly' ? tabMonthly(store) : tab === 'playbook' ? (editingSetup ? setupForm(store.setups().find((s) => s.id === editingSetup)) : tabPlaybook(store)) : tab === 'psychology' ? tabPsychology(store) : tabTrades(store);
  el.innerHTML = `<div class="wrap journal">
    <div class="view-head"><button class="back ghost" data-act="back">← Floor</button><h1>THE TRADING FLOOR</h1><span class="sub">the Journal · XAUUSD · ${store.trades().length} trades</span><span class="spacer"></span>
      <button class="tiny ghost" data-act="export">Export JSON</button><label class="tiny"><input type="file" accept="application/json" data-act="import" class="hidden"><button class="tiny ghost" data-act="import-click">Import</button></label></div>
    <div class="tabs">${TABS.map(([id, name]) => `<button data-act="tab" data-tab="${id}" class="${(tab === 'trade' ? 'new' : tab) === id ? 'on' : ''}">${name}</button>`).join('')}</div>
    ${body}
  </div>`;
  drawCharts(el, store);
  if (keepScroll) el.scrollTop = scroll;
}

export function bindJournal(el, { store, go }) {
  const formData = (f) => {
    const o = {};
    for (const [k, v] of new FormData(f).entries()) { if (o[k] !== undefined) { o[k] = [].concat(o[k], v); } else o[k] = v; }
    for (const k of ['edges', 'ruleBreaks', 'urges']) o[k] = [].concat(o[k] || []).filter(Boolean);
    for (const k of ['planFollowed', 'streamed', 'acted']) o[k] = f.elements[k]?.checked || false;
    return o;
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'back') go('#');
    else if (act === 'tab') { editingSetup = null; go(`#journal/${b.dataset.tab}`); }
    else if (act === 'trade-open') go(`#journal/trade/${id}`);
    else if (act === 'trade-delete') { if (confirm(`Delete ${id}?`)) { store.removeTrade(id); go('#journal'); } }
    else if (act === 'setup-edit') { editingSetup = id; renderJournal(el, { store }, '#journal/playbook'); }
    else if (act === 'setup-delete') { if (confirm('Delete this setup?')) store.removeSetup(id); }
    else if (act === 'checkin-delete') store.removeCheckin(id);
    else if (act === 'seed-setups') { for (const s of SEED_SETUPS) store.saveSetup({ ...s }); }
    else if (act === 'example') { for (const t of exampleTrades()) store.saveTrade(t); }
    else if (act === 'clear-examples') { for (const t of store.trades().filter((t) => t.example)) store.removeTrade(t.id); }
    else if (act === 'export') { const blob = new Blob([JSON.stringify(store.journal(), null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `arcane-journal-${new Date().toISOString().slice(0, 10)}.json`; a.click(); }
    else if (act === 'import-click') el.querySelector('input[data-act="import"]').click();
  });
  // The card's arithmetic updates as it is typed, so a bad R:R shows before the order, not after.
  el.addEventListener('input', (e) => {
    const f = e.target.form; if (f?.dataset.act !== 'trade-save') return;
    const live = f.querySelector('[data-live]'); if (live) live.innerHTML = readout(derive(formData(f)));
  });
  el.addEventListener('change', (e) => {
    if (e.target.form?.dataset.act === 'trade-save' && e.target.type === 'radio') { const live = e.target.form.querySelector('[data-live]'); if (live) live.innerHTML = readout(derive(formData(e.target.form))); }
    if (e.target.dataset.act !== 'import') return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then((txt) => { try { store.importJournal(JSON.parse(txt)); go('#journal'); } catch (err) { alert(err.message); } });
  });
  el.addEventListener('submit', (e) => {
    const f = e.target; if (!f.dataset.act) return;
    e.preventDefault();
    const o = formData(f);
    if (f.dataset.act === 'trade-save') { if (f.dataset.id) o.id = f.dataset.id; const id = store.saveTrade(o); go(`#journal/trade/${id}`); }
    else if (f.dataset.act === 'setup-save') { if (f.dataset.id) o.id = f.dataset.id; store.saveSetup(o); editingSetup = null; go('#journal/playbook'); }
    else if (f.dataset.act === 'checkin-save') { store.addCheckin(o); }
  });
}
