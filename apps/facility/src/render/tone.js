/**
 * The Arcane palette, shared by the interface and the 3D floor.
 *
 * Neutrals carry everything; the accents are functional and sparse. Each
 * says one thing: violet is the system itself (the core, the commander,
 * working), cyan is activity and data, green is healthy, amber needs the
 * operator, red is blocked or failed, gold is money. Nothing is coloured
 * for decoration.
 */
export const TONE = {
  violet: '#8f80ee', cyan: '#5ec4e2', green: '#4fc58a', amber: '#e0a64e',
  gold: '#d4a554', rose: '#d6728f', red: '#e2554f', steel: '#7f98b2', warm: '#ffcf9c', cold: '#c9dcf0',
};
/** Config accents (packages/config) to the palette above. */
export const ACCENT = { arcane: TONE.violet, cyan: TONE.cyan, vital: TONE.green, flare: TONE.amber, gold: TONE.gold, rose: TONE.rose, breach: TONE.red };
export const accentOf = (id) => (id && id.startsWith('#') ? id : ACCENT[id] || TONE.violet);
