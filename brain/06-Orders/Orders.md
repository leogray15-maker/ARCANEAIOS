---
type: orders
created: 2026-09-16 22:00
updated: 2026-09-19 01:48
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
| 6 | Top up Anthropic API credits so HERALD, Counsel and the Council can run | [[BRIDGE]] | Leo | human | P0 | open | — |
| 11 | Run supabase/migrations/0003_content_machine.sql in the Supabase SQL editor (after 0002); then npm run db:check | [[FORGE]] | Leo | human | P0 | open | #5 |
| 12 | Make an operator key (openssl rand -base64 32); set ARCANE_OPERATOR_KEY in .env and in the Vercel project; paste it into the DEVICE control in the bar | [[THE CONTROL ROOM]] | Leo | human | P0 | open | — |
| 13 | npm run herald:index && npm run archives:sync — put the Archives in the database so the Library has modules | [[THE LIBRARY]] | Leo | human | P0 | open | #8, #11 |
| 17 | Run supabase/migrations/0004_operating_state.sql in the Supabase SQL editor (after 0003) — the Bridge, the War Room and every orders board write to it | [[FORGE]] | Leo | human | P0 | open | #11 |
| 19 | Run supabase/migrations/0005_lab.sql in the Supabase SQL editor (after 0004) — THE LAB's tables | [[FORGE]] | Leo | human | P0 | open | #17 |
| 21 | Run supabase/migrations/0006_vault.sql, 0007_sanctum.sql and 0008_trading.sql in the SQL editor (after 0005) — THE VAULT, SANCTUM and the Journal's tables | [[FORGE]] | Leo | human | P0 | open | #19 |
| 3 | Fill Shared-Memory figures | [[BRIDGE]] | Leo | human | P1 | open | — |
| 7 | Set ANTHROPIC_API_KEY in the Vercel project environment | [[FORGE]] | Leo | human | P1 | open | #6 |
| 8 | Put SUPABASE_SERVICE_ROLE_KEY in .env so vault:sync and the brief can read the floor | [[FORGE]] | Leo | human | P1 | open | #5 |
| 9 | Review the five drafts in BEACON | [[BEACON]] | Leo | human | P1 | open | #14 |
| 14 | npm run vault:sync once, to import the five drafts of 2026-09-16 into the database and mirror them back | [[BEACON]] | Leo | human | P1 | open | #8, #11 |
| 15 | Redeploy on Vercel after the environment changes, then open the Library, pick a module, Generate — the first real run from the floor | [[BEACON]] | Leo | human | P1 | open | #6, #7, #11, #12, #13 |
| 16 | Delete arcaneaios-firebase-adminsdk-fbsvc-*.json from the repo folder (untracked, gitignored, but a service account does not belong there) and rotate it in Firebase | [[THE CONTROL ROOM]] | Leo | human | P1 | open | — |
| 18 | Set the venture ranking in THE WAR ROOM and today's focus on the BRIDGE — the first real state the floor holds | [[THE WAR ROOM]] | Leo | human | P1 | open | #12, #17 |
| 20 | npm run products:import — the catalogue with the supplier costs into the database; then in THE LAB type the kit cost for the 13 lines with no supplier match, and stock in what is on the shelf | [[THE LAB]] | Leo | human | P1 | open | #8, #19 |
| 22 | Type this month's figures in THE VAULT (members, orders, revenue, fixed costs, a cash snapshot) so the brief's MONEY block and the goals stop saying — | [[THE VAULT]] | Leo | human | P1 | open | #21 |
| 10 | Install the HERALD schedule (npm run herald:schedule -- install 6) | [[BEACON]] | [[HERALD]] | agent | P2 | open | #6 |

## Closed

| # | Order | Room | Outcome | Closed |
| --- | --- | --- | --- | --- |
| 1 | Build the Archives index from the local export | [[BEACON]] | done — done — vault mode, 1,663 notes | 2026-09-16 |
| 2 | First HERALD run — one module, five formats | [[BEACON]] | done — done — HER-R-20260916-001, 5 drafts | 2026-09-16 |
| 4 | Scaffold the facility shell (Vite, canvas, 20 rooms) | [[FORGE]] | done — done — live at arcaneaios.vercel.app | 2026-09-17 |
| 5 | Run supabase/migrations/0002_sync_codes.sql in the Supabase SQL editor | [[FORGE]] | done | 2026-09-19 |
