# 130. Measure the two-arm test by defects, and test drift over a chain of changes

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-11
- **Amends:** [0127](0127-test-the-factory-claim-against-a-plain-arm.md)

## Context

Two pilots of the two-arm test ran on 10 November 2026
([strong builder](../../docs/trials/pilot-2026-11-10/README.md),
[less capable builder](../../docs/trials/pilot-2026-11-10-weaker-model/README.md)).
They showed two limits of [0127](0127-test-the-factory-claim-against-a-plain-arm.md).

- The rule counts reviewer flags. Total flags for near-identical code ranged from 5 to 14, and
  the count moved more with the reviewer than with the code. The lint findings and the defects
  a user can see separated the arms; the flag count did not.
- The test is one small task with a clean example to copy. The maintainer's claim is about a
  codebase that grows: inconsistent patterns confuse agents, and gates keep the patterns
  consistent so a less capable model finds its way. One task on a fresh scaffold says little
  about that.

## Decision

**Measure defects, not flags.** A two-arm comparison scores each result with three counts:

1. **Hidden checks failed.** Playwright checks of the brief's stated behaviour that the
   builder never sees. They live outside the scaffold.
2. **Checklist items answered no.** One fresh reviewer answers a fixed list of yes or no
   questions about the result, each with a file and line as evidence. The questions ask
   whether the same job is done the same way everywhere, for example whether every hook
   returns one status and whether every failed change reaches the user.
3. **Gate findings.** The lint, Fallow and structure findings on the gated scaffold. A plain
   result is applied to the gated scaffold first.

The **defect score** is the sum of the three. The reviewer's would-want answer and flag list
stay in the record as notes and decide nothing.

**The drift test.** Each arm runs chains. A chain is one result that four fresh builders
change in turn, each on the tree the last one left:

1. Build the Todo brief of [0115](0115-the-todo-research-project.md).
2. Add tags: a second api feature and a second route beside the first.
3. Add a clear-completed mutation and button to the todos.
4. Add a summary line derived from the list.

The builder is a less capable model, because the pilots showed the written rules are enough
for a strong one. The result id matches no brief, so the route inventory of
[0075](0075-canonical-colocated-routes.md) lets the result grow. Every prompt states the
page and API contract that the hidden checks use. The orchestrator keeps a copy of the
result after each step and scores every step.

**The decision rule**, fixed before the first chain: with two chains per arm, the claim is
**supported** when each gated chain's final defect score is lower than each plain chain's,
**refuted** when each plain chain's is equal to or lower than each gated chain's, and
**inconclusive** otherwise. The record also shows the score after each step, so a reader
sees whether an arm gets worse as the result grows.

**One correction is allowed.** A hidden check that fails in every chain of both arms is
examined. When its cause is the check or an unclear line of the prompt, the check is
corrected and rerun on the saved trees, and the record says so.

## Alternatives

- **Keep the flag count and add reviewers.** More reviewers cut the noise and multiply the
  cost. Closed questions cut it at the source.
- **Count only gate findings.** A gated result has none by construction, so the count cannot
  show a gated arm that passes its gates and still ships a defect.
- **Grow the reference app in `apps/`.** That adds the PRD, bundle-size and sign-off gates to
  every step. The first drift test keeps to the code-pattern gates; `apps/` is a later test.

## Consequences

- Two chains per arm give a direction and no significance level.
- The hidden checks and the checklist are written by the same author as the prompts. The
  record keeps both, so a reader can judge them.
- A chain costs four builds, and builds run one at a time because results share ports.
- The first run is a pilot with sub-agents. A harness version needs a task that starts from
  a result branch, which the harness lacks today.
- This adds no gate and no dependency.
