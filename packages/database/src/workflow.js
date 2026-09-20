/**
 * The workflow engine — a pure step runner over a small DAG, for the
 * Agent Orchestrator (docs/PLAN.md's "Next"; scaffolded, not yet built).
 * No caller exists yet: this is the engine an Orchestrator would drive,
 * built and tested ahead of it rather than invented inline once it does.
 *
 * A workflow is a list of steps, each with an id and the ids of the steps
 * it waits on (`after`). A step is one of:
 *
 *   { kind: 'agent',     agent, run }              run(ctx) → the step's output
 *   { kind: 'condition', test }                    test(ctx) → true/false; false skips every step downstream
 *   { kind: 'approval',  describe }                describe(ctx) → a string; the run pauses here until `decide()` is called
 *
 * `run()` executes everything with its dependencies satisfied, in
 * parallel where the DAG allows it, and stops cleanly at the first
 * approval or failure — it never guesses past either. The caller resumes
 * a paused workflow by calling `run()` again with the same `state`.
 */

/** Every step name that names a real step, and no cycle. Throws, naming the problem, rather than running a workflow that cannot finish. */
export function validate(steps) {
  const ids = new Set(steps.map((s) => s.id));
  if (ids.size !== steps.length) throw new Error('two steps share an id');
  for (const s of steps) for (const a of s.after || []) if (!ids.has(a)) throw new Error(`${s.id} waits on unknown step "${a}"`);
  // Cycle check: a topological sort must be able to place every step.
  const done = new Set(); const visiting = new Set();
  const visit = (id) => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`a cycle includes "${id}"`);
    visiting.add(id);
    for (const a of steps.find((s) => s.id === id).after || []) visit(a);
    visiting.delete(id); done.add(id);
  };
  for (const s of steps) visit(s.id);
}

/**
 * Advance a workflow as far as it can go right now. `state` is
 * `{ done: {id: output}, skipped: [id], failed: null|{id,error}, pending: null|{id,description} }`
 * — the caller persists it (a jsonb column, or in a test, a plain object)
 * and passes it back in to resume. `ctx` is handed to every step's
 * function, and gains `.done` (the outputs so far) so a later step can
 * read an earlier one's result.
 */
export async function run(steps, ctx = {}, state = { done: {}, skipped: [], failed: null, pending: null }) {
  validate(steps);
  const s = { done: { ...state.done }, skipped: [...(state.skipped || [])], failed: state.failed || null, pending: null };
  if (s.failed) return s;   // a failed workflow does not resume on its own
  const ready = (step) => (step.after || []).every((a) => a in s.done || s.skipped.includes(a));
  const isDone = (id) => id in s.done || s.skipped.includes(id) || s.failed;

  for (;;) {
    if (s.failed || s.pending) return s;
    const next = steps.filter((step) => !isDone(step.id) && ready(step));
    if (!next.length) break;   // nothing left that is both undone and ready — either finished, or waiting on a step that will never come (validate() already ruled that out)
    // Run this wave together — nothing in it depends on anything else in it, by construction of `ready`.
    await Promise.all(next.map(async (step) => {
      if (s.failed || s.pending) return;
      const localCtx = { ...ctx, done: s.done };
      try {
        if (step.kind === 'condition') {
          const pass = await step.test(localCtx);
          if (!pass) markSkippedFrom(steps, step.id, s);
          else s.done[step.id] = true;
        } else if (step.kind === 'approval') {
          if (state.pending?.id === step.id && state.pending.decision) {
            if (state.pending.decision === 'approved') s.done[step.id] = state.pending.note || true;
            else { markSkippedFrom(steps, step.id, s); s.done[step.id] = false; }
          } else {
            s.pending = { id: step.id, description: await step.describe(localCtx) };
          }
        } else if (step.kind === 'agent') {
          s.done[step.id] = await step.run(localCtx);
        } else {
          throw Object.assign(new Error(`unknown step kind "${step.kind}"`), { step: step.id });
        }
      } catch (e) { s.failed = { id: step.id, error: e.message }; }
    }));
  }
  return s;
}

/** Everything downstream of a skipped condition is skipped too — a false branch never half-runs. */
function markSkippedFrom(steps, fromId, s) {
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    if (!s.skipped.includes(id)) s.skipped.push(id);
    for (const step of steps) if ((step.after || []).includes(id) && !(step.id in s.done) && !s.skipped.includes(step.id)) queue.push(step.id);
  }
}

/** The picture a UI would show: current step, completed, waiting, failed, next. */
export function progress(steps, state) {
  const doneIds = Object.keys(state.done || {});
  const skipped = state.skipped || [];
  const isReady = (step) => !doneIds.includes(step.id) && !skipped.includes(step.id) && (step.after || []).every((a) => doneIds.includes(a) || skipped.includes(a));
  return {
    completed: doneIds, skipped,
    failed: state.failed, pending: state.pending,
    next: state.failed || state.pending ? [] : steps.filter(isReady).map((s) => s.id),
    finished: !state.failed && !state.pending && steps.every((s) => doneIds.includes(s.id) || skipped.includes(s.id)),
  };
}
