---
type: knowledge
created: 2026-09-17 00:30
updated: 2026-09-17 00:30
status: active
agent: TALLY
tags: [knowledge, trading, journal, notion]
---
# The Arcane Trading Journal

A room inside the facility, kept in Notion. Six linked databases, one
teamspace, one rule: **every trade gets a card before the next trade is
taken.** The journal exists to surface patterns — winning setups, emotional
leaks, time-of-day edges — not to be admired. If a field is not pulling its
weight in a month, delete it.

In the facility it belongs to [[THE VAULT]] (TALLY answers for it) as a
second dashboard tab, "JOURNAL", with a trading desk prop set: three
monitors with bar charts, an R-multiple ticker, the session clock. Energy
and sleep come across from [[SANCTUM]] so the numbers can be read against
how Leo actually was that day.

---

## 1. Information architecture

```
THE ARCANE — TRADING JOURNAL  (Notion teamspace)
│
├── 01 TRADES          one card per trade · the atom · everything rolls up from here
├── 02 DAYS            one card per trading day · pre-market plan + end-of-day review
├── 03 WEEKS           one card per ISO week · the review ritual
├── 04 MONTHS          one card per month · the performance dashboard
├── 05 PLAYBOOK        one card per setup · what you are allowed to trade
└── 06 PSYCHOLOGY      check-ins · pre-market, post-session, mid-session urges
```

Relations (arrows point from the many to the one):

```
TRADES ──► DAYS ──► WEEKS ──► MONTHS
TRADES ──► PLAYBOOK
PSYCHOLOGY ──► DAYS
PSYCHOLOGY ──► TRADES (optional, "this urge was about this trade")
```

Rollups flow up that chain: a Day sums its Trades' R; a Week sums its Days;
a Month sums its Weeks. Win rate, expectancy and profit factor are formulas
on the parent, so nothing is typed twice. The Playbook rolls up the same
numbers per setup, which is what tells you which setups to keep.

Naming: trades are `T-YYYYMMDD-NN`, days `YYYY-MM-DD`, weeks `YYYY-Www`,
months `YYYY-MM`, setups by their short name (`Silver Bullet`, `London
Sweep`). Consistent names make the relation pickers fast to type into.

---

## 2. Database properties — copy these exactly

Notation: **Name** · type · options / formula. Anything marked *auto* is a
formula or rollup and never typed.

### 01 TRADES

| Property | Type | Options / formula |
| --- | --- | --- |
| **Trade** | Title | `T-YYYYMMDD-NN` (the template pre-fills the date) |
| **Status** | Select | `Open` · `Closed` · `Reviewed` |
| **Opened** | Date (time on) | entry time |
| **Closed** | Date (time on) | exit time |
| **Instrument** | Select | `XAUUSD` (default) · add others only when actually traded |
| **Direction** | Select | `Long` · `Short` |
| **Session** | Select | `Asia` · `London` · `NY AM` · `NY PM` · `Overlap` |
| **Killzone** | Select | `London KZ 02–05` · `NY KZ 07–10` · `Silver Bullet 10–11` · `NY PM 13–16` · `Outside KZ` |
| **Setup** | Relation → 05 PLAYBOOK | one setup per trade; "no setup" is a setup called `Unplanned` so it can be counted |
| **HTF Bias** | Select | `Bullish` · `Bearish` · `Neutral` |
| **Setup Grade** | Select | `A+` · `A` · `B` · `C` — graded *before* entry |
| **Conviction** | Number | 1–5, before entry |
| **Checklist** | Multi-select | `HTF bias set` · `Liquidity mapped` · `In killzone` · `Risk sized` · `No red news` · `Displacement seen` |
| **Entry** | Number | price |
| **Stop** | Number | price |
| **Target** | Number | price |
| **Exit** | Number | price actually exited (blank while open) |
| **Risk £** | Number | money at risk at the stop |
| **Size** | Number | lots |
| **Stop Distance** | Formula *auto* | `abs(prop("Entry") - prop("Stop"))` |
| **Planned R** | Formula *auto* | `abs(prop("Target") - prop("Entry")) / prop("Stop Distance")` |
| **R** | Formula *auto* | `if(empty(prop("Exit")), 0, if(prop("Direction") == "Long", (prop("Exit") - prop("Entry")), (prop("Entry") - prop("Exit"))) / prop("Stop Distance"))` |
| **P&L £** | Formula *auto* | `round(prop("R") * prop("Risk £") * 100) / 100` |
| **Win R** | Formula *auto* | `if(prop("R") > 0, prop("R"), 0)` — feeds profit factor |
| **Loss R** | Formula *auto* | `if(prop("R") < 0, -prop("R"), 0)` |
| **Outcome** | Formula *auto* | `if(empty(prop("Exit")), "Open", if(prop("R") > 0.2, "Win", if(prop("R") < -0.2, "Loss", "BE")))` |
| **Hold** | Formula *auto* | `dateBetween(prop("Closed"), prop("Opened"), "minutes")` |
| **Weekday** | Formula *auto* | `formatDate(prop("Opened"), "ddd")` |
| **Hour** | Formula *auto* | `formatDate(prop("Opened"), "HH")` |
| **Plan Followed** | Checkbox | the honest one |
| **Rule Breaks** | Multi-select | `Late entry` · `No stop` · `Moved stop` · `Oversized` · `Revenge` · `FOMO` · `Early exit` · `Held past invalidation` · `Outside killzone` · `No setup` · `Added to loser` |
| **Edge Seen** | Multi-select | `Sweep → displacement` · `FVG retest` · `OB tap` · `Breaker` · `SMT` · `Turtle soup` · `OTE` · `Equilibrium` |
| **Emotion Before** | Select | `Calm` · `Focused` · `Eager` · `Anxious` · `Bored` · `Tired` · `Frustrated` · `Euphoric` |
| **Emotion During** | Select | same list |
| **Emotion After** | Select | same list |
| **Energy** | Number | 1–5, from that morning's SANCTUM log |
| **Sleep** | Number | hours, from SANCTUM |
| **Stress** | Number | 1–5 |
| **Process Grade** | Select | `A` · `B` · `C` · `D` — graded *after*, on execution, independent of P&L |
| **Thesis** | Text | one paragraph: why this trade, before entry |
| **Execution** | Text | what actually happened |
| **Review** | Text | after close: what was right, what was wrong |
| **Lesson** | Text | one sentence, or blank — not every trade has one |
| **Chart** | URL | TradingView link |
| **Screens** | Files | entry / exit screenshots |
| **Day** | Relation → 02 DAYS | the template links it |
| **Streamed** | Checkbox | taken live on Kick — content source for [[BEACON]] |

### 02 DAYS

| Property | Type | Options / formula |
| --- | --- | --- |
| **Day** | Title | `YYYY-MM-DD` |
| **Date** | Date | |
| **Week** | Relation → 03 WEEKS | |
| **Trades** | Relation ← 01 TRADES | |
| **Trades #** | Rollup *auto* | Trades → count |
| **R** | Rollup *auto* | Trades → R → sum |
| **P&L £** | Rollup *auto* | Trades → P&L £ → sum |
| **Wins** | Rollup *auto* | Trades → Outcome → count values = Win (use "count per group" or a Win checkbox formula on Trades) |
| **Win Rate** | Formula *auto* | `if(prop("Trades #") == 0, 0, round(prop("Wins") / prop("Trades #") * 100))` |
| **Rule Breaks** | Rollup *auto* | Trades → Rule Breaks → show original |
| **Bias** | Select | `Bullish` · `Bearish` · `Neutral` · `No trade day` |
| **Plan** | Text | pre-market: levels, liquidity, the one scenario you will trade |
| **News** | Text | red-folder events and times |
| **Energy** | Number | 1–5 from SANCTUM |
| **Sleep** | Number | hours from SANCTUM |
| **Trained** | Checkbox | from SANCTUM |
| **Day Grade** | Select | `A` · `B` · `C` · `D` — process, not P&L |
| **Review** | Text | end of day, three lines max |
| **Stopped Trading At** | Date (time) | when you closed the platform — honesty about overtrading |

### 03 WEEKS

| Property | Type | Options / formula |
| --- | --- | --- |
| **Week** | Title | `YYYY-Www` |
| **Range** | Date (range) | Mon–Fri |
| **Month** | Relation → 04 MONTHS | |
| **Days** | Relation ← 02 DAYS | |
| **Trades #** | Rollup *auto* | Days → Trades # → sum |
| **R** | Rollup *auto* | Days → R → sum |
| **P&L £** | Rollup *auto* | Days → P&L £ → sum |
| **Avg R** | Formula *auto* | `if(prop("Trades #") == 0, 0, round(prop("R") / prop("Trades #") * 100) / 100)` |
| **Wins** | Rollup *auto* | Days → Wins → sum |
| **Win Rate** | Formula *auto* | as Days |
| **Process Score** | Number | 1–10, given at the review |
| **Best Setup** | Text | the setup that paid this week |
| **Biggest Leak** | Text | the rule break that cost most |
| **Keep / Stop / Start** | Text | three lines |
| **Reviewed** | Checkbox | the Sunday ritual is done |

### 04 MONTHS

| Property | Type | Options / formula |
| --- | --- | --- |
| **Month** | Title | `YYYY-MM` |
| **Weeks** | Relation ← 03 WEEKS | |
| **Trades #** | Rollup *auto* | Weeks → Trades # → sum |
| **R** | Rollup *auto* | Weeks → R → sum |
| **P&L £** | Rollup *auto* | Weeks → P&L £ → sum |
| **Win R** | Rollup *auto* | via a Trades relation on Months (link trades to the month in the template) → Win R → sum |
| **Loss R** | Rollup *auto* | → Loss R → sum |
| **Profit Factor** | Formula *auto* | `if(prop("Loss R") == 0, 0, round(prop("Win R") / prop("Loss R") * 100) / 100)` |
| **Expectancy R** | Formula *auto* | `if(prop("Trades #") == 0, 0, round(prop("R") / prop("Trades #") * 100) / 100)` |
| **Max Drawdown R** | Number | typed, from the equity curve |
| **Setup Ranking** | Text | top three setups by total R, from the Playbook view |
| **Emotional Leak** | Text | the emotion that preceded the worst trades |
| **Time Edge** | Text | the hour / killzone that paid |
| **Goal Check** | Text | against `05-Knowledge/Goals.md` — what did trading contribute |
| **Energy vs R** | Text | one line: did good sleep weeks make money |

### 05 PLAYBOOK (Setups)

| Property | Type | Options / formula |
| --- | --- | --- |
| **Setup** | Title | e.g. `London Sweep`, `Silver Bullet`, `NY Reversal`, `Unplanned` |
| **Status** | Select | `Active` · `Testing` · `Retired` |
| **Model** | Select | `ICT` · `Other` |
| **Timeframes** | Multi-select | `HTF: 4H` · `HTF: 1H` · `LTF: 15m` · `LTF: 5m` · `LTF: 1m` |
| **Best Session** | Multi-select | as Trades.Session |
| **Conditions** | Text | what must be true before it exists |
| **Trigger** | Text | the exact entry event |
| **Stop Rule** | Text | where, always |
| **Target Rule** | Text | where, always |
| **A+ Criteria** | Text | what makes it A+ instead of B |
| **Invalidation** | Text | when to leave |
| **Example** | Files | one clean chart |
| **Trades** | Relation ← 01 TRADES | |
| **Count** | Rollup *auto* | Trades → count |
| **Total R** | Rollup *auto* | Trades → R → sum |
| **Avg R** | Rollup *auto* | Trades → R → average |
| **Win Rate** | Rollup *auto* | Trades → Outcome → percent = Win |
| **Last Traded** | Rollup *auto* | Trades → Opened → latest |

### 06 PSYCHOLOGY

| Property | Type | Options / formula |
| --- | --- | --- |
| **Entry** | Title | `YYYY-MM-DD · Pre` / `· Post` / `· Urge HH:MM` |
| **When** | Date (time) | |
| **Type** | Select | `Pre-market` · `Post-session` · `Urge` |
| **Day** | Relation → 02 DAYS | |
| **Trade** | Relation → 01 TRADES | optional |
| **Mood** | Select | as Trades.Emotion |
| **Energy** | Number | 1–5 |
| **Stress** | Number | 1–5 |
| **Urge** | Multi-select | `Revenge` · `FOMO` · `Oversize` · `Move stop` · `Skip plan` · `Keep trading` |
| **Acted On It** | Checkbox | did the urge become a trade |
| **Trigger** | Text | what set it off |
| **Note** | Text | |

---

## 3. Trade Entry template (01 TRADES → New → template "Trade")

Set as default template. Properties pre-filled: **Status** `Open`, **Instrument** `XAUUSD`, **Opened** now, **Day** today. Page body:

```
## Before  (fill in under 60 seconds, before the order)
Bias:            [HTF bias + why, one line]
Setup:           [name]  Grade: [A+/A/B/C]  Conviction: [1–5]
Liquidity:       [what is being swept / what is the draw]
Entry / Stop / Target:  [   /   /   ]   → Planned R: [auto]
Risk £:          [   ]   Size: [   ]
State:           [emotion]  Energy [1–5]  Sleep [h]
Checklist:       ☐ bias  ☐ liquidity  ☐ killzone  ☐ risk  ☐ news  ☐ displacement

## During  (optional — one line if anything changed)
-

## After  (fill in before the next trade)
Exit:            [price]  → R: [auto]  Outcome: [auto]
Plan followed:   ☐        Rule breaks: [ ]
State after:     [emotion]
Execution:       [what happened, three lines]
Review:          [right / wrong / would do again?]
Lesson:          [one sentence, or blank]
Process grade:   [A/B/C/D]
```

The "Before" block is the one that matters. If it is not filled in, the
trade was not planned, and it goes to the `Unplanned` setup so it counts
against you.

## 4. Weekly Review template (03 WEEKS → template "Review")

```
# Week YYYY-Www

## The numbers            (all auto — read them, do not type them)
Trades · R · P&L · Win rate · Avg R
Rule breaks this week: [rollup]

## What paid              (from 05 PLAYBOOK, sorted by Total R this week)
1.
2.

## What leaked            (from 01 TRADES filtered: R < 0, sorted by R)
Worst trade: T-… — the rule break, the emotion before, the hour.
Pattern across the losers:

## The body               (from SANCTUM via 02 DAYS)
Avg sleep · avg energy · days trained
Did the low-energy days lose?  yes / no / no data

## Keep / Stop / Start
Keep:
Stop:
Start:

## Process score: __ / 10
Reviewed ☑
```

Fifteen minutes on Sunday, with `04-Records/Daily-Log` open beside it.

## 5. Monthly dashboard (04 MONTHS page, one per month)

A page with the month's card at the top and six linked views below:

1. **Equity curve** — 01 TRADES filtered to the month, sorted by Opened, chart: R cumulative (Notion charts: line, Y = R, cumulative)
2. **R distribution** — 01 TRADES, chart: bar, X = R rounded (`round(prop("R") * 2) / 2`), so the shape of outcomes is visible
3. **By setup** — 05 PLAYBOOK, table: Setup · Count · Win Rate · Avg R · Total R, sorted by Total R
4. **By hour** — 01 TRADES, board grouped by Hour, showing R — the time-of-day edge
5. **By emotion before** — 01 TRADES, board grouped by Emotion Before, showing R — the emotional leak
6. **Energy vs R** — 02 DAYS, table: Day · Energy · Sleep · R, sorted by Energy — the SANCTUM correlation

Then three typed lines on the month card: Setup Ranking, Emotional Leak,
Time Edge. Those three lines are the month's output. Everything else is
evidence.

## 6. Recommended views

**01 TRADES**
- `Open` — Status = Open · table · Trade, Direction, Entry, Stop, Target, Planned R, Opened
- `This Week` — Opened is this week · table · Trade, Setup, Grade, R, Outcome, Plan Followed, Rule Breaks
- `Needs Review` — Status = Closed · gallery · the queue to clear before tomorrow
- `By Setup` — board grouped by Setup · card shows R and Outcome
- `By Emotion` — board grouped by Emotion Before · R visible
- `By Killzone` — board grouped by Killzone · R visible
- `Rule Breaks` — Rule Breaks is not empty · table · sorted by R ascending
- `A+ Only` — Setup Grade = A+ · table — is your best grade actually your best?
- `Streamed` — Streamed = true · for [[HERALD]] to cut content from

**02 DAYS** — `Calendar` (by Date, showing R) · `This Month` (table) · `Low Energy` (Energy ≤ 2, showing R)
**03 WEEKS** — `Timeline` · `Unreviewed` (Reviewed = false)
**05 PLAYBOOK** — `Active` (Status = Active, sorted by Total R) · `Testing` · `Retired`
**06 PSYCHOLOGY** — `Urges` (Type = Urge, grouped by Acted On It) · `This Week`

## 7. Operating rules

1. **Card before the next trade.** No exceptions. An unlogged trade is an unplanned trade and is logged as `Unplanned`.
2. **Grade the process, not the P&L.** Process Grade and Day Grade are about execution. A winning trade with a moved stop is a `D`.
3. **Fill the "Before" block before the order.** If there is no time to fill it, there is no time to take the trade.
4. **Three lines max** for daily reviews. The weekly is where you think.
5. **Sunday, fifteen minutes.** The Weekly Review, with the Playbook view open. Mark Reviewed.
6. **Retire a setup** after 20 trades of negative expectancy. Promote from Testing to Active after 20 with positive.
7. **Log urges, not just trades.** The urges you did not act on are the data that shows the discipline is working.
8. **SANCTUM feeds the journal, not the other way round.** Energy and sleep are copied in each morning; the journal never asks you to change how you live, it shows you what the numbers say.
9. **Delete fields that go unfilled for a month.** The journal serves the trader.
10. **The journal is private.** Nothing in it is a claim to anyone else; [[HERALD]] may cut content only from trades marked Streamed, and only about process, never returns.

---

## Set-up order

1. Create the six databases empty, with the Title property only.
2. Add relations (they create both sides).
3. Add the remaining properties, formulas last (they reference other properties).
4. Add the templates to 01 TRADES and 03 WEEKS; set the Trade template as default.
5. Create the Playbook cards for the setups you actually trade now (start with three).
6. Make the views. Pin `Open`, `This Week` and `Needs Review`.
7. Log the next trade.

I can create all six databases, relations, properties, templates and views
in your Notion directly through the connector if you want that done rather
than copied — it is a write to Notion, so it happens on your say-so, not an
agent's.
