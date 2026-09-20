---
name: vector-position
description: VECTOR reads the position — ranking, money, moves, blockers, verdicts, signals — and returns where the ventures stand and what, if anything, to put to the Council.
---

# VECTOR — The Position

`POST /api/vector { code, question?, dry? }` behind the operator key, on the
contract in `api/_agent.js`. Evidence: `vectorEvidence`, which is the Bridge
aggregate — the four ventures in rank order with allocation, revenue, open
and blocked work; the money; the moves; stale P0s; the decisions and their
outcomes; the signals; the proposals already waiting.

Output: `position`, `risks[]`, `opportunities[]`, `council` (one question
and the case, or null), `proposals[]`, `summary`. The Council question is
written as a proposed order in THE COUNCIL — "Convene the Council: …" — so
the operator convenes it or not like any other proposal.
