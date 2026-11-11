# Two-arm pilot with a less capable builder, 10 November 2026

This folder records a second pilot of the two-arm test in
[ADR 0127](../../../.agents/decisions/0127-test-the-factory-claim-against-a-plain-arm.md).
The [first pilot](../pilot-2026-11-10/README.md) used a strong builder on a brief with a clean
example to copy, the case where gates matter least. This run changes one thing: the builder
is Claude Haiku. It is a pilot and stays outside the harness evidence.

## Setup

- Same scaffolds as the first pilot: gated `6f52781536814d9a3a5b92c65b5e2f84a3983e4a`, plain
  `17ba66d45c1dbc9d3d0b48c4d5bf4c75f8ecf32a`. Same prompts, same checks, same order.
- Each builder was a Haiku sub-agent. Each reviewer was a sub-agent on the session's stronger
  model, as in the first pilot, so the review standard is the same.
- Each builder had the instruction to leave `tooling/trial/fixtures/` unread.
- The result code of each run is in `<id>.patch` in this folder.

## Runs

| Run | Arm | Own checks | Would want | Flags | Flags in new code | Lint findings | Build minutes | `pnpm verify` runs | Ended on a green verify |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `todo-01` | gated | pass | yes | 21 | 11 | 0 | 18.8 | 5 | yes |
| `todo-02` | gated | fail: its own E2E spec | yes | 14 | 10 | 0 | 5.8 | 1 | stopped early |
| `todo-03` | gated | pass | yes | 14 | 7 | 0 | 24.7 | 3 | last failure: the untracked-file test |
| `todo-plain-01` | plain | pass | yes | 15 | 9 | 2 | 4.4 | 2 | yes |
| `todo-plain-02` | plain | pass | yes | 19 | 12 | 13 | 5.6 | 2 | yes |
| `todo-plain-03` | plain | pass | yes | 16 | 11 | 1 | 8.5 | 2 | yes |

"Own checks" are the checks of the run's task file on a fresh clone of the result commit.
"Flags in new code" leaves out flags in `web/src/api-client/` and `web/vite.config.ts`.
"Lint findings" counts the anti-slop and policy findings on the gated scaffold.

| Arm | Passed | Would want | Median flags | Median flags in new code | Lint findings, total | Median build minutes |
| --- | --- | --- | --- | --- | --- | --- |
| gated | 2 of 3 | 3 of 3 | 14 | 10 | 0 | 18.8 |
| plain | 3 of 3 | 3 of 3 | 16 | 11 | 16 | 5.6 |

## Verdict by the rule of ADR 0127

**The claim is inconclusive in this pilot.** The gated arm has the lower median flag count,
and it passed its own checks less often than the plain arm.

## Both pilots side by side

| Builder | Arm | Passed | Median flags | Lint findings, total | Median build minutes |
| --- | --- | --- | --- | --- | --- |
| strong | gated | 3 of 3 | 13 | 0 | 15.8 |
| strong | plain | 3 of 3 | 9 | 1 | 9.7 |
| Haiku | gated | 2 of 3 | 14 | 0 | 18.8 |
| Haiku | plain | 3 of 3 | 16 | 16 | 5.6 |

With the strong builder the written rules were enough: one lint finding in three plain
results. With Haiku they were not: 16 findings in three plain results.

## What the gates stopped

The plain results carry mistakes that each gated builder had to fix before it could finish.

- `todo-plain-01` and `todo-plain-02` break `policy/one-status-from-hooks`. The hook returns
  loose flags, so the page can show loading, an error and an empty list at once.
- `todo-plain-02` has nine type-assertion findings from the anti-slop rules, three of them
  `as unknown as` chains, and it shows nothing when a toggle or a delete fails.
- `todo-plain-01` and `todo-plain-02` break `policy/test-imports-the-type`.
- `todo-plain-01` fails the Biome format check, and `todo-plain-03` has three unused exports.

Three of these are defects a user can see. The gated results have none of them.

## Where the gates misled the builder

Two of three gated builders ended without a green `pnpm verify`, and neither cause was the
quality of their code.

- **A warning that reads as a failure.** At this scaffold `pnpm fallow:audit` lists the copied
  scaffold files as duplicate clone groups beside its real findings. The `todo-02` builder
  took the list for a gate it had no way to pass and stopped after one `pnpm verify` run. Its
  E2E spec counts every todo in a shared api process, and it fails on a clean clone. The
  `todo-03` builder rewrote the api-client to clear the list; its version lists each
  procedure's input and output by hand where the reference derives them from the router.
- **A test that fails for no code reason.** All three gated builders hit the comparison with
  `git ls-files` in `scripts/oxlint-policy.test.ts`. It was the last failure of `todo-03`.
- **A rule met in letter only.** The `todo-02` hook returns a status string beside
  `todos: list.data ?? []`. `policy/one-status-from-hooks` passes, and the page can still
  read a placeholder list in every state.

Both misleading outputs are gone at the head of this branch. Commit `96f51bd` makes the test
count new files. On the current scaffold `pnpm fallow:audit` reports no issue and prints no
duplicate list for the `todo-01` result of the first pilot.

## Limits

- Three runs per arm give a direction and no significance level.
- Reviewer noise is larger than the two-flag gap between the arms. The lint findings and the
  user-visible defects separate the arms more clearly than the flag counts.
- The brief is small and has a clean example to copy.
- The `todo-03` builder set reminders that reached the orchestrating session. The session
  read them and took no action on the build.
- The `todo-02` builder ended its session early. Its result was committed as it stood, as the
  harness commits whatever a session leaves.

## What to do next

1. Run the gated arm again with Haiku on the current scaffold, where the two misleading
   outputs are gone. The claim predicts three green runs.
2. Run the drift test: several tasks in a row by fresh builders, each on the last one's
   output, in both arms.
3. Tighten `policy/one-status-from-hooks` so a status beside a defaulted list fails.
