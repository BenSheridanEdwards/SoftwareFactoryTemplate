# Two-arm pilot, 10 November 2026

This folder records a pilot of the two-arm test in
[ADR 0127](../../../.agents/decisions/0127-test-the-factory-claim-against-a-plain-arm.md).
It is a pilot and stays outside the harness evidence: `tooling/trial/arms.mjs report`
reads only the records directly in `docs/trials/`.

## How it differs from a harness run

- Each builder and each reviewer was a sub-agent of one Claude Code cloud session. The
  session's own safety guard refused the nested `claude -p` session that the harness starts.
- The builders ran on the session's model, with no turn limit and no recorded stream.
- The orchestrating session made each result commit, ran the checks and applied the
  decision rule by hand, with the commands of `tooling/trial/tasks/todo.json` and
  `tooling/trial/tasks/todo-plain.json`.
- Each builder got the task prompt unchanged, plus the same container notes in each arm.

## Setup

- Gated scaffold: `6f52781536814d9a3a5b92c65b5e2f84a3983e4a`.
- Plain scaffold: `17ba66d45c1dbc9d3d0b48c4d5bf4c75f8ecf32a`, from
  `node tooling/trial/arms.mjs scaffold`.
- Order: `todo-01`, `todo-plain-01`, `todo-02`, `todo-plain-02`, `todo-03`, `todo-plain-03`,
  one at a time.
- Each plain result was applied to a clone of the gated scaffold before its review and its
  gate run. One fresh reviewer per result followed `tooling/trial/review-prompt.md`.
- The result code of each run is in `<id>.patch` in this folder.

## Runs

| Run | Arm | Own checks | Would want | Flags | Flags in new code | Lint findings | Build minutes | Tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `todo-01` | gated | pass | yes | 13 | 7 | 0 | 19.5 | 229,389 |
| `todo-02` | gated | pass | yes | 14 | 9 | 0 | 14.8 | 231,401 |
| `todo-03` | gated | pass | yes | 5 | 4 | 0 | 15.8 | 232,281 |
| `todo-plain-01` | plain | pass | yes | 10 | 6 | 0 | 9.7 | 247,113 |
| `todo-plain-02` | plain | pass | yes | 6 | 6 | 1 | 13.5 | 250,126 |
| `todo-plain-03` | plain | pass | yes | 9 | 6 | 0 | 8.5 | 212,074 |

"Own checks" are the checks of the run's task file on a fresh clone of the result commit.
"Flags in new code" leaves out flags in `web/src/api-client/` and `web/vite.config.ts`, which
each run copies unchanged from the reference. "Lint findings" counts the anti-slop and policy
findings on the gated scaffold, 584 rules in the policy config.

| Arm | Passed | Would want | Median flags | Median flags in new code | Median lint findings | Median build minutes |
| --- | --- | --- | --- | --- | --- | --- |
| gated | 3 of 3 | 3 of 3 | 13 | 7 | 0 | 15.8 |
| plain | 3 of 3 | 3 of 3 | 9 | 6 | 0 | 9.7 |

## Verdict by the rule of ADR 0127

**The claim is refuted in this pilot.** The plain arm passed and was wanted as often as the
gated arm, and its median reviewer flag count is lower.

## What the gates found in the plain results

Every plain result ran against every gate of the gated scaffold.

| Gate | `todo-plain-01` | `todo-plain-02` | `todo-plain-03` |
| --- | --- | --- | --- |
| Typecheck, Biome, style tokens, suppression ban | pass | pass | pass |
| Oxlint policy, 584 rules | pass | 1 finding: `jsx-a11y(prefer-tag-over-role)` | pass |
| Oxlint anti-slop | pass | pass | pass |
| Fallow architecture zones and structure contract | pass | pass | pass |
| Role diagram | fail: `architecture.mmd` absent | fail: `architecture.mmd` absent | fail: `architecture.mmd` absent |
| Fallow audit | 1 unused type export | 1 unused type export | 2 unused exports |
| Unit tests with coverage, E2E and acceptance | pass | pass | pass |

The plain prompt asks for no diagram, so the diagram row measures the prompt and says nothing
about the code. The gates' whole yield on three plain results was one accessibility finding
and four unused exports.

## What the gates cost in the gated runs

- `pnpm verify` took 210 to 218 seconds on a gated result and 13 to 14 seconds on a plain one.
- Each gated builder lost one `pnpm verify` run to `scripts/oxlint-policy.test.ts`. That test
  compares the linted files with `git ls-files`, so it fails while the result is untracked.
  The prompt tells the builder to leave the work uncommitted; all three builders staged it.
- Each gated builder removed the unused `present` and `unwrap` helpers from its copy of
  `web/e2e/fixtures.ts` after `pnpm fallow:audit` failed.

## What the reviewers saw in both arms

- All six results clear the form title before the API answers, so a failed create loses the
  typed title. The fixed `TodoForm` props in `.agents/templates/list-route.md` give the form
  no success signal.
- Four of six reviews flag the hook's status union named `todos`, so the page reads `todos.todos`.
- Reviewers flagged the same reference lines in several runs: the handler typing in
  `apps/web/src/api-client/testApiHandlers.ts` and the `Response` annotation in
  `apps/web/src/api-client/ApiProvider.test.tsx`.

## Limits

- Three runs per arm give a direction and no significance level.
- Reviewer noise is large. Total flags for near-identical code ranged from 5 to 14, and one
  reviewer gave the copied scaffold files no flag where the others gave 1 to 6.
- The brief is small, and the reference greeting and the list-route template give each arm a
  clean example to copy. A brief with no such example is the stronger test.
- The `todo-plain-01` builder read `tooling/trial/fixtures/todo-01.patch`, an earlier trial
  result inside the scaffold. It is unknown whether the `todo-01` builder read it. From run 2,
  each arm had the instruction to leave that folder unread.
- Four builders wrote log files one level above their clone and removed them.
- The plain run's id shows in its folder name. Each reviewer session got no word about arms.

## What to do next

1. Run the harness version on a machine that allows it, as
   [TRIALS.md](../../../.agents/TRIALS.md#the-two-arm-test) describes.
2. Add a brief with no template and no reference feature of the same shape, and run both arms
   on it.
3. Move `tooling/trial/fixtures/` out of the scaffold a builder can read.
4. Decide whether a result's pre-push needs the factory's own tooling tests. They are most of
   the 200 seconds between the two arms' `pnpm verify`.
