# Drift pilot, 11 November 2026

This folder records the first run of the drift test in
[ADR 0130](../../../.agents/decisions/0130-measure-the-two-arm-test-by-defects-and-test-drift.md).
It is a pilot with sub-agents and stays outside the harness evidence. The measure and the
decision rule were committed and pushed before the first build.

## Setup

- Gated scaffold: `0bb4dd936a7ea35007aec9b5019c3e693319186b`. Plain scaffold:
  `d50e567285d1bdf791f03bf64bb6427c9c6f4e6c`, from `node tooling/trial/arms.mjs scaffold`.
- Two chains per arm: `drift-01` and `drift-02` gated, `drift-plain-01` and `drift-plain-02`
  plain. Each chain is one result that four fresh builders changed in turn.
- Every builder was a Claude Haiku sub-agent. The checklist reviewers ran on the session's
  stronger model.
- Step 1 used the Todo prompt. Steps 2 to 4 used the templates in
  [`tooling/trial/drift/`](../../../tooling/trial/drift/) with the tags, clear-completed and
  summary briefs.
- The 16 builds ran one at a time. After each step the orchestrator kept a copy of the result
  and committed it with the hooks on.
- The 18 hidden checks are in [hidden-checks.md](hidden-checks.md). The checklist is
  [`tooling/trial/drift/checklist-prompt.md`](../../../tooling/trial/drift/checklist-prompt.md).
- Each chain's four commits are in `<id>.patch` in this folder.

## Final scores

| Chain | Arm | Steps ended green | Hidden checks failed | Checklist items answered no | Gate findings | Defect score |
| --- | --- | --- | --- | --- | --- | --- |
| `drift-01` | gated | 4 of 4 | 0 of 18 | 8 of 40 | 0 | 8 |
| `drift-02` | gated | 4 of 4 | 0 of 18 | 4 of 40 | 0 | 4 |
| `drift-plain-01` | plain | 4 of 4 | 0 of 18 | 5 of 40 | 13 | 18 |
| `drift-plain-02` | plain | 4 of 4 | 0 of 18 | 5 of 40 | 8 | 13 |

Gate findings count the Oxlint findings, the Biome findings and the unused exports of the
Fallow audit on the gated scaffold. Typecheck, the style check, the suppression check, the
Fallow architecture zones and the structure contract passed on all four final trees.

## Verdict by the rule of ADR 0130

**The claim is supported in this pilot.** Each gated chain's final defect score, 8 and 4, is
lower than each plain chain's, 18 and 13.

The whole margin comes from the gate findings. The hidden checks are equal in the two arms,
and the checklist favours neither: 8 and 4 against 5 and 5.

## Gate findings after each step

| Chain | Step 1 | Step 2 | Step 3 | Step 4 |
| --- | --- | --- | --- | --- |
| `drift-01` | 0 | 0 | 0 | 0 |
| `drift-02` | 0 | 0 | 0 | 0 |
| `drift-plain-01` | 9 | 13 | 12 | 13 |
| `drift-plain-02` | 4 | 6 | 6 | 8 |

A plain chain's findings grow with the code and none leaves. The files show how.

- In `drift-plain-01` the first builder left an unsorted import in `TodoForm.tsx` and an
  unused type export, `TodoListStatus`. The second builder made `TagForm.tsx` and `useTags.ts`
  from those files, with the same unsorted import and a matching `TagListStatus`.
- The third and fourth builders of both plain chains reported the unsorted import in
  `TodoForm.tsx` and left it.
- In `drift-plain-02` one `role="status"` finding after step 1 is three after step 4.

A gated builder met the same slips as failures of `pnpm verify` and fixed them in the step
that made them, so the next builder copied a clean pattern.

## What the checklist found

| Question | `drift-01` | `drift-02` | `drift-plain-01` | `drift-plain-02` |
| --- | --- | --- | --- | --- |
| A failed change reaches the user, 6 mutations | 4 no | 0 no | 0 no | 0 no |
| A failure message clears after a later success, 2 routes | 2 no | 2 no | 2 no | 2 no |
| A hook returns one status that carries its data, 2 hooks | 2 no | 0 no | 2 no | 1 no |
| Two features do the same job the same way, 5 jobs | 0 no | 2 no | 0 no | 0 no |
| Each behaviour has an E2E spec, 9 behaviours | 0 no | 0 no | 1 no | 2 no |

- The gates leave one question open: whether a failed change reaches the user. `drift-01`
  passes every gate and shows nothing when a create, a toggle or a delete fails.
- All four chains keep a failure message on screen after a later change succeeds.
- `drift-01` returns `{ todos: list.data ?? [], status: queryStatus(list) }`.
  `policy/one-status-from-hooks` passes it, and ADR 0132 records why the rule stays that way.

## Cost

| Chain | Build minutes, steps 1 to 4 | Total | `pnpm verify` runs | Sub-agent tokens |
| --- | --- | --- | --- | --- |
| `drift-01` | 11.5, 10.8, 10.5, 5.3 | 38.1 | 9 | 625,478 |
| `drift-02` | 8.6, 7.4, 6.2, 9.3 | 31.5 | 9 | 673,070 |
| `drift-plain-01` | 6.3, 3.4, 2.9, 4.4 | 17.0 | 9 | 619,417 |
| `drift-plain-02` | 4.5, 3.8, 3.1, 1.7 | 13.1 | 7 | 602,234 |

The gated chains took 2.3 times the wall-clock time of the plain chains and about the same
tokens. The scaffold predates the `lab` project of ADR 0131, so each gated `pnpm verify`
still ran the lab suites.

## One correction to the hidden checks

Two clear-completed checks failed on `drift-01` at step 3, the first chain to reach that
step. The checks used Playwright's `check()` action, which needs the box to change at once;
the app sets a checkbox after the server answers, as the fixed acceptance spec expects. The
checks now click and then wait for the checked state. The summary checks got the same
change before any chain reached step 4. Every score in this report is from the corrected
checks.

## Limits

- Two chains per arm give a direction and no significance level.
- The decisive count, gate findings, is zero for a gated chain by construction. It shows
  that a plain chain collects rule breaks; it says nothing about their cost to a user. Of
  the 21 findings in the two plain final trees, 4 are accessibility findings and the rest
  are format, naming, type-form and unused-export findings.
- The checklist was answered by one reviewer per chain. Reviewers read the same hook shape
  differently: a status string beside a list is a no in three chains.
- The four changes are small and follow one clean first step. A chain that starts from
  inconsistent code is the stronger test.
- The builders had the instruction to leave `tooling/trial/fixtures/` and `docs/trials/`
  unread. Nothing checked it.

## What to do next

1. Add a gate or a review rule for the defect no gate saw: a failed change that shows
   nothing. An E2E template that fails each mutation once is one way.
2. Run a chain that starts from a result with two conflicting patterns, and see which one
   each arm copies.
3. Run the drift test with the `lab` project in the scaffold, to see how much of the
   2.3-fold time cost remains.
