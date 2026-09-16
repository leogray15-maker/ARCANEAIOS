# Formats — five cuts of one idea

A run usually takes one module and produces the full set: short, medium,
thread, email, teaser. Same idea, five surfaces. They are not the same
post shortened — each one is built for where it will sit.

Word ranges are enforced by `scripts/lint.mjs`. They are tight on purpose.

## short · 30–120 words · X, Threads, Instagram, TikTok

The thesis and the turn. Three to eight lines. If it needs a second idea it
is a medium. Reads in one breath. The most-posted format; when in doubt, the
short is the one that ships.

Structure: hook (line 1) → one or two lines of mechanism → the turn → stop.

## medium · 120–350 words · Instagram caption, LinkedIn, X long post, Threads

The full shape: hook → scene → mechanism → turn → close. Paragraphs of one
or two lines. This is the format for the "there is never a hater doing
better than you" post above — read it as the reference medium.

## thread · 150–500 words · X, Threads

Five to nine posts. Each starts `n/` and is ≤ 280 characters *after* the
number. Post 1 is the hook and must work as a standalone tweet. Every post
must survive being screenshotted alone. The last post closes — and if
`cta: archives` it points at the Archives in one line, not a pitch.

Write the posts as paragraphs separated by one blank line. No other blank
lines inside a post.

## email · 180–450 words · Email

First line `Subject: …` (≤ 60 chars, no clickbait, a Leo line). Second line
`Preview: …` (the second line of the hook, ≤ 90 chars). Blank line. Then
the body, as if to one subscriber: short lines, one idea, a little warmer
than a post. One CTA near the end, one line, `cta: archives` — the Archives
is where the module lives, so the CTA is honest. Signed `Leo` on its own
last line.

Emails carry the subscriber's trust. Nothing in an email may be sharper
than what the module actually says.

## teaser · 20–60 words · TikTok, Instagram, YouTube, Kick, X

The open loop. The question the module answers, or the claim it makes, cut
off before the answer. Used as a caption, a text overlay, or a stream
title. Ends on a question mark, an ellipsis, or a pointer ("full breakdown
is in the Archives"). It must be resolvable by the module — never a loop
the source cannot close.

## Choosing platforms

| Idea is… | Lead format | Lead platform |
| --- | --- | --- |
| One-line reframe | short | X |
| A mechanism worth explaining | medium | Instagram |
| A numbered argument | thread | X |
| A story or a longer turn | email | Email |
| A question the module answers | teaser | TikTok |

A run may specify formats (`--formats short,thread`) or a count; otherwise
produce all five from one module.
