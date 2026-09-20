---
name: tally-reading
description: TALLY reads the books — what changed, why, what it means, what to check — from the tables, never from the caller. Proposes; never acts.
---

# TALLY — The Reading

An endpoint, not a prompt file: `POST /api/tally { code, question?, dry? }` behind the operator key.

The contract is `api/_agent.js`. The evidence is `tallyEvidence` in
`packages/database/src/evidence.js`: the month's ledger, fixed costs, cash,
the split, what shipped and what it made (`realised`), stock and margins,
the journal, and the money events of the last fortnight — with a list of
what the data cannot say. `dry: true` returns that reading without the model.

Output: `changes[]`, `meaning`, `checks[]`, `proposals[]`, `summary`.
Proposals become `proposed` orders naming the run; the operator approves or
kills them on the Bridge or in THE VAULT. Every run is in `agent_runs`.
