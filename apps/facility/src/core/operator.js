/**
 * The operator key on this device.
 *
 * The site is public; the API is not. Leo sets ARCANE_OPERATOR_KEY once
 * on the server and pastes it once into each browser he uses; it lives in
 * localStorage and goes out as a bearer header on every /api call. It is
 * never shown back on the page. Without it, the Library and BEACON say so
 * and ask for it; the floor itself still works.
 */
const LS = 'arcane.operator';
const listeners = new Set();
let key = '';
try { key = localStorage.getItem(LS) || ''; } catch {}

export const operator = {
  get key() { return key; },
  get present() { return !!key; },
  set(next) { key = String(next || '').trim(); try { if (key) localStorage.setItem(LS, key); else localStorage.removeItem(LS); } catch {} for (const fn of listeners) fn(key); },
  clear() { this.set(''); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
