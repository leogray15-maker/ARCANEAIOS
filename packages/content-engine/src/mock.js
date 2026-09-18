/**
 * A stand-in for the model, for testing the plumbing when there is no API
 * key or no credits. It cuts the module's own sentences into the five
 * shapes the lint expects — nothing is invented — and every draft it makes
 * is titled MOCK and lands with `model: mock`, so it can never be mistaken
 * for HERALD's writing. Turned on only by an explicit flag (`--mock`, or
 * HERALD_MOCK=1 on the dev server); never in production.
 */
import { FORMATS, sentences, countWords } from '../../../.claude/skills/herald/scripts/lib.mjs';

const clean = (s) => s.replace(/\s+/g, ' ').replace(/^[-–•*\d.\s]+/, '').trim();

/** Sentences from the module worth using: real sentences, not headings or fragments. */
function pool(module) {
  const out = [];
  for (const s of sentences(String(module.body || ''))) {
    const t = clean(s);
    if (t.length < 30 || t.length > 260 || !/[.!?]$/.test(t) || /^https?:/i.test(t)) continue;
    out.push(t);
  }
  if (!out.length) out.push(`${clean(module.title || 'This module')} is one idea, said plainly.`);
  return out;
}

/** Take sentences until the body has at least `min` words and no more than `max`. */
function take(src, min, max, start = 0) {
  const lines = []; let words = 0, i = start;
  while (words < min) {
    const s = src[i % src.length]; i++;
    const w = countWords(s);
    if (words + w > max) { if (lines.length) break; continue; }
    lines.push(s); words += w;
    if (i - start > src.length * 3) break;
  }
  return lines;
}

export function mockDrafts(module, formats) {
  const src = pool(module);
  const title = String(module.title || 'module').slice(0, 40);
  const tag = (module.lane || 'mindset').replace(/[^a-z0-9-]/g, '');
  const drafts = [];
  let cursor = 0;
  for (const f of formats) {
    const [lo, hi] = FORMATS[f].words;
    let body, hook;
    if (f === 'thread') {
      // Nine posts at most, each under 280 chars; pair sentences up until a post is long enough that nine of them clear the minimum.
      const posts = []; let i = cursor;
      while (posts.length < 9 && (posts.length < 5 || countWords(posts.join(' ')) < lo)) {
        let post = src[i % src.length]; i++;
        while (post.length < 150 && i - cursor < src.length * 2) { const nxt = src[i % src.length]; i++; if ((post + ' ' + nxt).length > 270) break; post += ' ' + nxt; }
        posts.push(`${posts.length + 1}/ ${post.slice(0, 270)}`);
      }
      body = posts.join('\n\n'); hook = posts[0].replace(/^1\/\s*/, '');
    } else if (f === 'email') {
      const lines = take(src, lo - 8, hi - 8, cursor);
      hook = `Subject: ${lines[0].replace(/[.!?]$/, '').slice(0, 58)}`;
      body = `${hook}\nPreview: ${(lines[1] || lines[0]).slice(0, 88)}\n\n${lines.join('\n\n')}\n\nThe full module is in the Archives.\n\nLeo`;
      hook = hook.replace(/^Subject:\s*/, '');
    } else if (f === 'teaser') {
      const lines = take(src, lo, hi - 6, cursor);
      body = `${lines.join('\n\n')}\n\nThe rest is inside the Archives…`; hook = lines[0];
    } else {
      const lines = take(src, lo, hi, cursor);
      body = lines.join('\n\n'); hook = lines[0];
    }
    cursor += 3;
    drafts.push({ format: f, platform: FORMATS[f].platforms[0], title: `MOCK ${f}: ${title}`, hook, cta: f === 'short' ? 'none' : 'archives', tags: [tag, 'mock'], body });
  }
  return { angle: `MOCK run for "${module.title}": the module's own sentences in five shapes, to test the pipeline.`, drafts, usage: { in: 0, out: 0, cached: 0 } };
}
