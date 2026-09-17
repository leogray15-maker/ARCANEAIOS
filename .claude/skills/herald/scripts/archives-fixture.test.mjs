/**
 * One small Archives, described twice — as a folder of vault notes and as
 * a Notion workspace — so the indexer's two live sources can be asserted
 * against each other. Shared by `archives.test.mjs` (the assertions) and
 * `notion-stub.test.mjs` (which installs the stub in a child process).
 *
 * Fixture only. Nothing here is imported by the scripts themselves.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Four courses, each with four modules, plus one reposted piece. */
export const COURSES = [
  { title: 'Mindset Mastery', lane: 'mindset' },
  { title: 'Online Sales', lane: 'sales' },
  { title: 'Arcane PHILOSOPHIES', lane: 'philosophy' },
  { title: 'Biohacking', lane: 'health' },
];
export const MODULES_PER = 4;

const body = (n) => [
  `The ${n} you are avoiding is the one that matters.`,
  'Most people wait for the feeling to arrive before they move. The feeling arrives after.',
  'Do the thing badly on the first day. Do it slightly less badly on the second.',
  'That is the whole method. There is nothing underneath it.',
].join('\n');

/** A deterministic 32-hex id, so both fixtures name the same page. */
const idFor = (s) => {
  let h = 0n;
  for (const ch of s) h = (h * 131n + BigInt(ch.codePointAt(0))) % (2n ** 128n);
  return h.toString(16).padStart(32, '0').slice(-32);
};

export const ROOT = { title: 'The Arcane Archives', id: idFor('root') };

export const pages = [];
pages.push({ id: ROOT.id, title: ROOT.title, text: 'Everything Leo knows, filed.', children: COURSES.map((c) => idFor(c.title)) });
for (const c of COURSES) {
  const kids = [];
  for (let i = 1; i <= MODULES_PER; i++) {
    const title = `${c.title} ${i}`;
    kids.push(idFor(title));
    pages.push({ id: idFor(title), title, text: body(title) });
  }
  pages.push({ id: idFor(c.title), title: c.title, text: `The ${c.title} course.`, children: kids });
}
// One reposted third-party piece — it must land in the `external` lane.
pages.push({
  id: idFor('repost'),
  title: 'Why You Are Poor (March 3, 2024)',
  // Long enough to be a module rather than an index, so the external lane
  // is asserted on something the picker would otherwise have offered.
  text: [
    'Reading Time: 6 minutes',
    'Someone else wrote this and Leo saved it into the Archives for reference.',
    'It argues that poverty is a habit of attention rather than a shortage of money.',
    'The argument is fine. The writing is not his, so it is never a source for a draft.',
  ].join('\n'),
});
pages[0].children.push(idFor('repost'));

export const byId = new Map(pages.map((p) => [p.id, p]));

/** The name Notion's export gives a page, which is what the vault holds. */
export const baseName = (p) => `${p.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, ' ').trim()} ${p.id}`;

/** Write the fixture as a folder of Obsidian notes. */
export function writeVault(dir) {
  const archives = path.join(dir, 'Arcane ARCHIVES');
  fs.mkdirSync(archives, { recursive: true });
  for (const p of pages) {
    const links = (p.children || []).map((c) => `- [${byId.get(c).title}](${encodeURIComponent(baseName(byId.get(c)))}.md)`).join('\n');
    fs.writeFileSync(path.join(archives, `${baseName(p)}.md`), `# ${p.title}\n\n${p.text}\n\n${links}\n`);
  }
  return dir;
}

const rich = (s) => [{ plain_text: s, type: 'text' }];

/** The blocks Notion would return for a page: its prose, then its sub-pages. */
export function blocksFor(p) {
  const blocks = p.text.split('\n').map((line, i) => ({
    id: `${p.id.slice(0, 30)}${String(i % 100).padStart(2, '0')}`,
    type: 'paragraph', has_children: false, paragraph: { rich_text: rich(line) },
  }));
  for (const c of p.children || []) {
    blocks.push({ id: c, type: 'child_page', has_children: true, child_page: { title: byId.get(c).title } });
  }
  return blocks;
}

/**
 * Stand in for api.notion.com. Returns the calls it saw, so a test can
 * assert that nothing but a read was ever issued.
 */
export function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}`);
    const reply = (obj) => ({ ok: true, status: 200, headers: new Map(), json: async () => obj });

    if (u.pathname === '/v1/search') {
      const b = JSON.parse(init.body || '{}');
      if (b.query) return reply({ results: [{ id: ROOT.id, properties: { title: { type: 'title', title: rich(ROOT.title) } } }], has_more: false });
      return reply({ results: pages.map((p) => ({ id: p.id, last_edited_time: '2026-09-01T00:00:00.000Z' })), has_more: false });
    }
    const m = /^\/v1\/blocks\/([0-9a-f-]+)\/children$/.exec(u.pathname);
    if (m) {
      const p = byId.get(m[1].replace(/-/g, '').toLowerCase());
      return reply({ results: p ? blocksFor(p) : [], has_more: false });
    }
    return { ok: false, status: 404, headers: new Map(), statusText: 'not found', json: async () => ({ message: `no stub for ${u.pathname}` }) };
  };
  return calls;
}
