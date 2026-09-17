/**
 * The sync code: how one operator's state finds itself on another device
 * without a sign-in. Generated once per browser, unguessable (130 bits),
 * kept in localStorage, used as the row id in Supabase. Paste it on a
 * second device and both write the same row. It is never shown unless
 * asked for.
 */
const LS = 'arcane.sync';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const listeners = new Set();

function generate() {
  const bytes = new Uint8Array(26); crypto.getRandomValues(bytes);
  return 'sync-' + [...bytes].map((b) => ALPHABET[b % 32]).join('');
}
export const isSyncCode = (s) => /^sync-[a-z2-7]{26}$/.test(String(s || '').trim());

let code = null;
try { code = localStorage.getItem(LS); } catch {}
if (!isSyncCode(code)) { code = generate(); try { localStorage.setItem(LS, code); } catch {} }

export const sync = {
  get code() { return code; },
  /** Join another device's row. Returns false if the code is malformed. */
  use(next) {
    next = String(next || '').trim().toLowerCase();
    if (!isSyncCode(next) || next === code) return isSyncCode(next);
    code = next; try { localStorage.setItem(LS, code); } catch {}
    for (const fn of listeners) fn(code);
    return true;
  },
  /** Forget this device's code and start a fresh row. */
  reset() { code = generate(); try { localStorage.setItem(LS, code); } catch {} for (const fn of listeners) fn(code); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
