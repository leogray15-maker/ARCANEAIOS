/**
 * What the store seeds from when the brain export is missing a piece.
 * Everything here is re-exported from the shared config so the facility
 * never carries its own roster or ventures.
 */
export { VENTURES, ROOMS, ROOM_BY_ID, AGENTS, AGENT_BY_ID } from '@arcane/config';

export const GOALS_FALLBACK = [
  { id: 'g-mrr', goal: '£10k a month across all four ventures', room: 'THE VAULT', kind: 'money', target: '10000', progress: '' },
  { id: 'g-members', goal: '50 Archives members at £128', room: 'THE LIBRARY', kind: 'money', target: '50', progress: '' },
  { id: 'g-posts', goal: 'Post every day for 90 days', room: 'BEACON', kind: 'work', target: '90', progress: '0' },
  { id: 'g-coa', goal: 'COA published for every live batch', room: 'THE LAB', kind: 'work', target: '100', progress: '' },
];
