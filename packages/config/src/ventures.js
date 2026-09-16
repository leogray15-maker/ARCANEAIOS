/**
 * The four ventures. Each has a home room and an agent who answers for it.
 */
export const VENTURES = [
  {
    id: 'peptides', name: 'Arcane Peptides', room: 'apothecary', accent: 'arcane',
    kind: 'Research compounds · UK', model: 'Per order',
    facts: ['HPLC verified', 'COA every batch', 'Free UK delivery over £50', 'Dispatch 12:00 Mon–Fri'],
    price: null, unitLabel: 'orders / mo',
  },
  {
    id: 'archives', name: 'The Arcane Archives', room: 'archives', accent: 'cyan',
    kind: 'Education platform', model: 'Subscription',
    facts: ['£128 / month', '3,300+ modules', '~45 subjects'],
    price: 128, unitLabel: 'members',
  },
  {
    id: 'track', name: 'Arcane Track', room: 'vitals', accent: 'vital',
    kind: 'Skin healing tracker · TSW & eczema', model: 'Subscription',
    facts: ['£11.99 / month', '£70 / year', 'Every dose logged'],
    price: 11.99, unitLabel: 'members',
  },
  {
    id: 'codex', name: 'The Codex', room: 'scriptorium', accent: 'breach',
    kind: 'Books & masterclasses', model: 'One-off',
    facts: ['8 titles live', 'Highest ticket £70.99'],
    price: null, unitLabel: 'sales / mo',
  },
];

export const VENTURE_BY_ID = Object.fromEntries(VENTURES.map((v) => [v.id, v]));

/** The operator. The one human in the building. */
export const OPERATOR = {
  name: 'Leo',
  handle: 'arcane.leo',
  brand: 'Arcane',
  location: 'Essex, England',
  note: 'Chef turned entrepreneur. Contrarian, direct, no filter. Respected, not liked.',
};
