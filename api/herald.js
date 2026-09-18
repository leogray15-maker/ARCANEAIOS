/**
 * HERALD, from the floor.
 *
 *   POST /api/herald { code, module_id, formats?, parent_id?, note? }
 *     → { run, status, drafts, refused, warnings, usage }
 *
 * One module, up to five formats, one Claude call, the lint gate, one
 * repair, and the drafts land as `draft` in content_drafts with a run in
 * agent_runs. `parent_id` names a draft to regenerate or vary: the new
 * draft points back at it and the model is told what the earlier hook was.
 *
 * The source gate holds here as it does in the skill: `never` subjects
 * and reposted third-party pieces are refused outright; a module outside
 * the Allowed list needs `allow_open: true` from the operator (the Library
 * asks); sensitive lanes are allowed by name — the lint still bites.
 */
import { json, guard, db, client } from './_lib.js';
import { modules, drafts } from '../packages/database/src/content.js';
import { generate, FORMAT_IDS, DEFAULT_MODEL } from '../packages/content-engine/src/herald.js';

export const config = { maxDuration: 300 };

export default guard(['POST'], async (req, res, auth) => {
  const b = req.body || {};
  const moduleId = String(b.module_id || '').trim();
  if (!moduleId) return json(res, 400, { error: 'module_id is required' });
  let formats = Array.isArray(b.formats) && b.formats.length ? b.formats.map(String) : FORMAT_IDS;
  formats = formats.filter((f) => FORMAT_IDS.includes(f));
  if (!formats.length) return json(res, 400, { error: `formats must be from ${FORMAT_IDS.join(', ')}` });
  if (formats.length > 5) return json(res, 400, { error: 'at most five formats per run' });

  const m = await modules.get(db(), moduleId);
  if (!m) return json(res, 404, { error: `no module ${moduleId}` });
  if (m.kind !== 'module') return json(res, 422, { error: `"${m.title}" is an index page, not a module` });
  if (m.gate === 'never' || m.lane === 'external') return json(res, 422, { error: `"${m.subject}" is under Never in 05-Knowledge/Archives-Sources.md — HERALD does not cut from it` });
  if (m.gate !== 'allowed' && !b.allow_open) return json(res, 409, { error: `"${m.subject}" is not under Allowed in Archives-Sources.md`, needs: 'allow_open' });
  if (!m.body?.trim()) return json(res, 422, { error: 'the module has no text — re-run npm run archives:sync' });

  let parent = null;
  if (b.parent_id) {
    parent = await db().get('content_drafts', { select: 'id,hook,format,module_id', id: `eq.${String(b.parent_id)}` }, { single: true });
    if (!parent) return json(res, 404, { error: `no draft ${b.parent_id} to regenerate from` });
  }

  const mock = process.env.HERALD_MOCK === '1' && process.env.VERCEL !== '1';
  const c = mock ? null : client();
  if (!mock && !c) return json(res, 503, { error: 'HERALD cannot write: set ANTHROPIC_API_KEY in the Vercel project' });

  const out = await generate({ db: db(), client: c, model: process.env.HERALD_MODEL || DEFAULT_MODEL, effort: process.env.HERALD_EFFORT || 'high', module: m, formats, device: auth.device, note: String(b.note || '').slice(0, 200), mock, parent });
  const status = out.status === 'ok' ? 200 : out.status === 'refused' ? 422 : 502;
  return json(res, status, { ...out, module: { id: m.id, title: m.title, subject: m.subject } });
});
