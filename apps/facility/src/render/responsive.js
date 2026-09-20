/**
 * What the interface does when the screen is a phone.
 *
 * Three things the stylesheet cannot do on its own:
 *   1. A wide table has to become something you can scroll sideways
 *      without taking the whole page with it. Every view builds its
 *      tables from template strings, so rather than touch twelve
 *      renderers, new tables are wrapped as they appear.
 *   2. The bottom tabs need to know which view is showing.
 *   3. The real viewport height on a phone changes as the browser's own
 *      chrome slides away; `100dvh` covers most of it, `--vh` covers the
 *      rest for the older engines.
 */
export const isPhone = () => window.matchMedia('(max-width: 760px)').matches;
export const isTouch = () => window.matchMedia('(hover: none) and (pointer: coarse)').matches;

/** Wrap a table so it scrolls on its own; idempotent. */
function wrapTable(t) {
  if (!t.parentElement || t.parentElement.classList.contains('tscroll')) return;
  const box = document.createElement('div');
  box.className = 'tscroll';
  t.parentElement.insertBefore(box, t);
  box.appendChild(t);
}
function wrapAll(root) { for (const t of root.querySelectorAll('table.grid')) wrapTable(t); }

export function installResponsive() {
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle('phone', isPhone());
    root.classList.toggle('touch', isTouch());
    root.style.setProperty('--vh', `${window.innerHeight}px`);
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 120));

  // Views are re-rendered wholesale; wrap whatever tables arrive.
  const views = document.querySelectorAll('.view');
  const obs = new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) if (node.nodeType === 1) { if (node.matches?.('table.grid')) wrapTable(node); wrapAll(node); }
  });
  for (const v of views) { wrapAll(v); obs.observe(v, { childList: true, subtree: true }); }
}

/** Light up the tab that matches the view now showing. */
export function markTabs(screen, hash) {
  const which = hash.startsWith('#beacon') || hash.startsWith('#content') ? 'beacon'
    : hash.startsWith('#library') ? 'library'
    : hash.startsWith('#bridge') ? 'bridge'
    : screen === 'floor' ? 'floor' : '';
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.tab === which);
}
