/**
 * The work layer's small parts, shared by the Library and BEACON: the
 * three states every data view has (loading, failed, empty), the operator
 * key prompt that a 401 turns into, chips and times. Nothing here knows
 * about the floor.
 */
import { esc } from './widgets.js';
import { operator } from '../core/operator.js';
export { esc };

export const chip = (text, tone = '') => `<span class="chip ${tone}">${esc(text)}</span>`;
export const STATUS_TONE = { draft: 'flare', review: 'cyan', approved: 'vital', scheduled: 'arcane', posted: 'vital', killed: 'deny' };
export const GATE_TONE = { allowed: 'vital', open: 'ash', never: 'deny' };
export const LANE_TONE = { health: 'deny', trading: 'flare', external: 'deny', meta: 'ash' };

export function when(ts) {
  if (!ts) return '—';
  const d = new Date(ts); if (Number.isNaN(d.getTime())) return String(ts);
  const now = Date.now(), diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400 && d.getDate() === new Date().getDate()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '');
}
export const stampFull = (ts) => (ts ? new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const num = (n) => Number(n || 0).toLocaleString('en-GB');

export const loading = (what = 'loading') => `<p class="state loading">${esc(what)}…</p>`;
export const empty = (text, action = '') => `<div class="state empty-state"><p>${esc(text)}</p>${action}</div>`;

/** A failed call, as a sentence and the next step. A 401 becomes the key prompt. */
export function failed(err, { retry = '' } = {}) {
  if (err?.needsKey) return keyPrompt(err.status === 403 ? 'That key was rejected. Enter the operator key again.' : 'Enter the operator key to open this room.');
  const hint = err?.notOpen ? 'The server has no ARCANE_OPERATOR_KEY yet — set it in the Vercel project (and .env for the dev API).' : err?.hint || '';
  return `<div class="state error-state"><p><b>Could not load.</b> ${esc(err?.message || String(err))}</p>${hint ? `<p class="ash">${esc(hint)}</p>` : ''}${retry ? `<p><button class="tiny" data-act="${esc(retry)}">try again</button></p>` : ''}</div>`;
}

export function keyPrompt(text = 'Enter the operator key to open this room.') {
  return `<div class="state key-state"><p><b>Operator key.</b> ${esc(text)}</p>
    <form class="inline" data-act="operator-key"><input name="key" type="password" placeholder="ARCANE_OPERATOR_KEY" style="width:280px" autocomplete="off"><button type="submit" class="primary">Open</button></form>
    <p class="src">The key is kept in this browser only and sent with every request. It is the same value as ARCANE_OPERATOR_KEY on the server.</p></div>`;
}

/** Handle the key form anywhere; returns true if it was one. */
export function handleKeyForm(form, after) {
  if (form.dataset.act !== 'operator-key') return false;
  operator.set(form.key.value);
  after?.();
  return true;
}

export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/** Keep focus and caret across a re-render of a search box. */
export function keepFocus(el, selector) {
  const a = document.activeElement;
  if (!a || !el.contains(a) || !a.matches(selector)) return () => {};
  const pos = a.selectionStart;
  return () => { const again = el.querySelector(selector); if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch {} } };
}

/** Copy text; returns a promise that resolves when done or rejects if the clipboard is unavailable. */
export const copy = (text) => (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard')));
