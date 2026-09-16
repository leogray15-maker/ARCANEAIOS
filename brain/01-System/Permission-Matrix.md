---
type: system-card
created: 2026-09-16 22:11
updated: 2026-09-16 22:11
status: active
agent: WARDEN
generated: true
card: matrix
tags: [system, permissions]
---

# Permission Matrix

Grades weakest to strongest: `deny` · `read` · `analyse` · `draft` · `recommend` · `approval` · `allow`

| Agent | Read data | Analyse | Draft | Spend money | Publish | Contact people | Change systems |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [[ARCANE]] | analyse | analyse | recommend | deny | approval | approval | approval |
| [[MERIDIAN]] | analyse | analyse | draft | deny | deny | deny | approval |
| [[TALLY]] | analyse | analyse | recommend | deny | deny | deny | deny |
| [[VECTOR]] | analyse | analyse | recommend | deny | deny | deny | deny |
| [[HERALD]] | analyse | analyse | draft | deny | approval | draft | deny |
| [[ORACLE]] | analyse | analyse | draft | deny | deny | deny | deny |
| [[LUMEN]] | analyse | analyse | draft | deny | deny | draft | deny |
| [[ANVIL]] | analyse | analyse | draft | deny | deny | deny | approval |
| [[SCRIBE]] | analyse | analyse | draft | deny | approval | deny | deny |
| [[KEEPER]] | analyse | analyse | draft | deny | deny | deny | deny |
| [[CIPHER]] | analyse | analyse | draft | deny | deny | deny | deny |
| [[ABACUS]] | analyse | analyse | draft | deny | deny | deny | approval |
| [[ENVOY]] | analyse | analyse | draft | deny | deny | approval | deny |
| [[VIGIL]] | analyse | analyse | draft | deny | deny | deny | deny |
| [[WARDEN]] | analyse | analyse | recommend | deny | deny | deny | deny |
| [[SPARK]] | analyse | analyse | recommend | deny | deny | deny | deny |
| [[FOUNDRY]] | analyse | analyse | draft | deny | deny | deny | approval |
| [[RELIC]] | analyse | analyse | draft | deny | deny | deny | deny |
| [[EMBER]] | analyse | analyse | recommend | deny | deny | deny | deny |

## Standing rules (enforced by `tools/validate-config.mjs`)

- **no-allow** — No agent holds `allow` on any capability. Nothing executes unattended.
- **no-spend** — No agent spends money. `spend` is `deny` for the entire network, commander included. Money moves by the operator's hand.
- **notion-readonly** — Notion is read-only for the entire network. The Archives are a source, never a target.
- **no-medical** — No agent makes a medical, dosing or treatment claim about any compound, protocol or condition — to the operator, a member or the public.
- **drafts-wait** — Nothing publishes unattended. Every draft waits in 02-Content/Drafts until a human moves its status.
- **trace-everything** — Every run writes a Trace entry into THE RECORDS before it reports success.

## What each capability means

- **Read data** — See the numbers behind its own room
- **Analyse** — Reason over what it can see
- **Draft** — Produce copy, plans, documents, recommendations
- **Spend money** — Move or commit funds
- **Publish** — Put something in front of the public
- **Contact people** — Email, message or call anyone outside
- **Change systems** — Edit live pricing, stock, site, app or the brain's system files
