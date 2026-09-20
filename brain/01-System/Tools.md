---
type: system-card
created: 2026-09-21 00:12
updated: 2026-09-21 00:12
status: active
agent: FOUNDRY
generated: true
card: tools
tags: [system, tools]
---

# Tools

What the network can reach. State is honest, never aspirational.

| Tool | State | Note | Carried by |
| --- | --- | --- | --- |
| Shared memory | `live` | The brain (Obsidian vault) plus Firestore for live state. One state the whole network reads before acting. | [[ARCANE]], [[MERIDIAN]], [[TALLY]], [[VECTOR]], [[HERALD]], [[ORACLE]], [[LUMEN]], [[ANVIL]], [[SCRIBE]], [[KEEPER]], [[CIPHER]], [[ABACUS]], [[ENVOY]], [[VIGIL]], [[WARDEN]], [[SPARK]], [[FOUNDRY]], [[RELIC]], [[EMBER]] |
| Notion | `read-only` | The Arcane Archives. Read only, by the operator's instruction. No agent may create, update or move a page. | [[ARCANE]], [[MERIDIAN]], [[HERALD]], [[ORACLE]], [[SCRIBE]], [[RELIC]] |
| Claude | `live` | Reasoning for Counsel and the Council. | [[ARCANE]], [[VECTOR]], [[SPARK]] |
| Archives index | `live` | Local index of the Archives export, built by HERALD. Offline, deterministic, regenerable. | [[ARCANE]], [[HERALD]], [[ORACLE]], [[SCRIBE]] |
| Database | `live` | Supabase Postgres: the Archives modules, content drafts and revisions, agent runs, system events. Reached only through /api and the tools, with the service key; the browser never touches it directly. | [[MERIDIAN]], [[TALLY]], [[VECTOR]], [[HERALD]] |
| Calendar | `not wired` | Not connected yet. | — |
| Email | `not wired` | Not connected yet. | — |
| Store | `not wired` | Arcane Peptides orders and stock. | [[MERIDIAN]], [[ANVIL]], [[ABACUS]] |
| CRM | `not wired` | People, deals, follow-ups. | [[ENVOY]] |
| Web research | `live` | Server-side search, through `/api/intel`. CIPHER reads the operator's watchlist and nothing else, and reports; it never acts on what it finds. | [[CIPHER]], [[ENVOY]], [[VIGIL]], [[SPARK]] |
