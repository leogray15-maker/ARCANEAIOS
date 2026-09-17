---
type: orders
created: 2026-09-16 22:00
updated: 2026-09-17 10:55
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
| 3 | Fill Shared-Memory figures | [[BRIDGE]] | Leo | human | P1 | open | — |
| 5 | Run supabase/migrations/0002_sync_codes.sql in the Supabase SQL editor | [[FORGE]] | Leo | human | P0 | open | — |
| 6 | Top up Anthropic API credits so HERALD, Counsel and the Council can run | [[BRIDGE]] | Leo | human | P0 | open | — |
| 7 | Set ANTHROPIC_API_KEY in the Vercel project environment | [[FORGE]] | Leo | human | P1 | open | #6 |
| 8 | Put SUPABASE_SERVICE_ROLE_KEY in .env so vault:sync and the brief can read the floor | [[FORGE]] | Leo | human | P1 | open | #5 |
| 9 | Review the five drafts on the CONTENT board | [[BEACON]] | Leo | human | P1 | open | — |
| 10 | Install the HERALD schedule (npm run herald:schedule -- install 6) | [[BEACON]] | [[HERALD]] | agent | P2 | open | #6 |

## Closed

| # | Order | Room | Outcome | Closed |
| --- | --- | --- | --- | --- |
| 1 | Build the Archives index from the local export | [[BEACON]] | done — vault mode, 1,663 notes | 2026-09-16 |
| 2 | First HERALD run — one module, five formats | [[BEACON]] | done — HER-R-20260916-001, 5 drafts | 2026-09-16 |
| 4 | Scaffold the facility shell (Vite, canvas, 20 rooms) | [[FORGE]] | done — live at arcaneaios.vercel.app | 2026-09-17 |
