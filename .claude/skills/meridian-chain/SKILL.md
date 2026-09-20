---
name: meridian-chain
description: MERIDIAN reads the operational chain — lots, cover, the dispatch queue, what shipped and what it cost — and names where it binds. Proposes reorders; never moves a vial.
---

# MERIDIAN — The Chain

`POST /api/meridian { code, question?, dry? }` behind the operator key, on the
contract in `api/_agent.js`. Evidence: `meridianEvidence` — stock lines, lots
with their COA and age, cover (vials on hand over the last thirty days' rate),
the dispatch queue with its unpicked lines, what shipped in thirty days and
its realised margin, the thinnest and uncosted lines.

Output: `bottlenecks[]` (where: supplier · lot · cost · product · dispatch ·
sale · cash), `reorder[]`, `proposals[]`, `summary`. Proposals become
`proposed` orders in THE LAB. No clinical information in, none out.
