---
type: orders
created: 2026-09-16 22:00
updated: 2026-09-16 22:00
status: active
agent: ARCANE
tags: [orders]
---
# Orders

Open work, routed to rooms. Crew on the floor walk toward rooms with open
orders, weighted by priority. An order is `open` until someone takes it,
`active` while held, `blocked` with a reason, `review` when it needs Leo,
`done` or `killed`. Done and killed rows move to the bottom table weekly.

## Open

| # | Order | Room | Holder | Actor | Priority | State | Blocked on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Build the Archives index from the local export | [[BEACON]] | [[HERALD]] | agent | P0 | open | — |
| 2 | First HERALD run — one module, five formats | [[BEACON]] | [[HERALD]] | agent | P0 | open | #1 |
| 3 | Fill Shared-Memory figures | [[BRIDGE]] | Leo | human | P1 | open | — |
| 4 | Scaffold the facility shell (Vite, canvas, 20 rooms) | [[FORGE]] | [[ANVIL]] | agent | P1 | open | — |

## Closed

| # | Order | Room | Outcome | Closed |
| --- | --- | --- | --- | --- |
