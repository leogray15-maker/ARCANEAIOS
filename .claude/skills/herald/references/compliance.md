# Compliance — zero medical, dosing or treatment claims

This is the one rule HERALD cannot be argued out of, and it is enforced by
`scripts/lint.mjs`, not by good intentions. A draft that trips a HARD
pattern is not emitted. Not "emitted with a note" — not emitted.

## Why it is absolute

Leo runs a peptides venture and a skin-healing tracker. The Archives hold
biohacking, bulking, "healing protocol" and supplement-stack modules. A
single public post from the brand that names a compound with a dose, or
says a thing *treats* a condition, is regulatory exposure for all four
ventures at once. The content loop must be able to run daily without a
lawyer reading every line. So the line is drawn far back from the edge.

## HARD — blocks the draft

| Pattern | Examples that fail |
| --- | --- |
| Dose with a unit | `250mcg`, `5 mg`, `2 IU`, `10ml`, `3 grams` |
| Dosing language | dose, dosing, microdose, titrate, reconstitute, inject, pin, subq, cycle on/off, stack with |
| Named compound | BPC-157, TB-500, GHK-Cu, semaglutide, retatrutide, NAD+, SS-31, HGH, TRT, SARMs, "peptides", nootropics, modafinil, SSRIs, steroids, finasteride, tretinoin… |
| Medical framing | diagnose, prescribe, contraindicated, side effects, clinical, pharmacological, therapeutic, medication |
| Claim verb + condition in one sentence | "heals your gut", "boosts testosterone", "reverses inflammation", "fixes your skin", "cures anxiety" |
| Guaranteed returns | guaranteed profit, risk-free, can't lose, "double your money in" |

The verb list (cure, treat, heal, reverse, prevent, fix, boost, increase,
raise, lower, reduce, regulate, balance, repair, detox, eliminate, kill) is
only fatal when a health condition or body system sits in the same
sentence. "Heal your relationship with money" passes. "Heal your gut"
fails. That is the line.

## WARN — passes, but is written into `compliance_notes`

Health nouns on their own (gut, hormones, sleep, inflammation…), absolute
claims ("always works", "studies show"), income claims ("£10k a month"),
trading-signal language, references to doctors, and voice slips (hashtags,
emojis, creator-speak, preamble). A human reads that line twice before
approving.

## How to write about the sensitive lanes without tripping it

The health and trading lanes are excluded from `pick.mjs` unless named.
When Leo asks for them by name, the post is about the **principle**, never
the **physiology** or the **position**:

- ✗ "Sunlight in the first hour raises testosterone."
- ✓ "The first hour of your day is spent before you decide anything. Decide it."
- ✗ "This is the setup I take on gold every London open."
- ✓ "Most people lose money because they trade to feel something. Trade to not."

If a module cannot be cut into a principle without the physiology, it is
not a source. Say so in the run's Trace notes and pick another.

## What HERALD never does

- Never adds a disclaimer to get a claim through. A disclaimer is a claim
  wearing a hat.
- Never softens a compound name to dodge the pattern ("the B-peptide").
- Never edits the lint patterns to make a draft pass. Patterns change by a
  human editing `scripts/lib.mjs`, with a Trace entry saying why.
