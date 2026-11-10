# 127. Test the factory claim against a plain arm

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-10
- **Amends:** [0034](0034-trial-harness-and-evidence.md),
  [0048](0048-trial-tasks-and-codex.md), [0115](0115-the-todo-research-project.md)

## Context

The North Star says written instructions alone fail to stop slop, and that
gates stop it. The trials so far test a different thing. They run the same
brief several times on the full scaffold and compare the results with each
other ([0035](0035-trial-comparison.md)). That measures whether the results
are alike. It has no run without the gates, so it gives no evidence that the
gates cause the quality.

The gates also cost agent time and maintainer time. A claim that can fail, and
a test that can refute it, tells the maintainer which parts of the factory to
keep.

## Decision

**The claim.** On the same brief, model and scaffold revision, a run with the
gates gives code a reviewer wants at least as often, with fewer reviewer
flags, than a run with the written rules alone.

**Two arms.** The gated arm is the Todo task of
[0115](0115-the-todo-research-project.md), unchanged. The plain arm is a new
task, `tooling/trial/tasks/todo-plain.json`, with ids `todo-plain-01..03`. Its
prompt, `tooling/trial/todo-plain-prompt.md`, gives the same brief, page and
public API. It says that the checkout runs no lint or architecture gate, and
it keeps every written rule.

**The plain scaffold.** `node tooling/trial/arms.mjs scaffold --scaffold <rev>`
makes a child commit of the gated scaffold. It removes the paths in
`STRIPPED_PATHS`: the hooks, the Oxlint and Fallow configs and plugins, the
vendored anti-slop rules, the architecture tooling and the style and
suppression checks. It keeps only the run, build, typecheck, format and E2E
scripts in `package.json`, and sets `verify` to typecheck, unit tests and the
build. `AGENTS.md`, `.agents/` and every doc stay. A fixed author and the
parent's date make the commit a pure function of the gated scaffold, so the
report recomputes it and rejects a plain run on any other commit. The command
fails when the scaffold lacks a stripped path, so a renamed gate cannot stay
in the plain arm by accident.

**One judge, one tree.** `node tooling/trial/arms.mjs transplant` applies a
plain run's patch to a clone of the gated scaffold. `review.mjs` then lints and
judges it there, as it does a gated run. The reviewer sees the same configs and
docs for both arms. The lint counts for the plain arm measure how far the
written rules alone carried the agent.

**The decision rule.** `node tooling/trial/arms.mjs report` writes
`docs/trials/arms.md`. It needs three reviewed runs per arm, from real agents,
on one model, with one reviewer. The rule is fixed before any run:

- **Supported:** the gated arm passes and is wanted at least as often as the
  plain arm, and its median reviewer flag count is lower.
- **Refuted:** the plain arm passes and is wanted at least as often as the
  gated arm, and its median reviewer flag count is equal or lower.
- **Inconclusive:** any other result.

The report also shows the median lint findings, agent minutes and cost per
arm. A refuted or inconclusive verdict is a valid result; the command exits
non-zero only when the comparison is incomplete.

## Alternatives

- **Remove the gates inside the harness after the clone.** The agent would
  start from a tree that no commit records. A commit keeps the existing
  scaffold checks and the evidence schema as they are.
- **Hide the gates with prompt text only.** The agent reads `AGENTS.md` and
  can run every gate, so the arm would still be gated.
- **Remove the written rules too.** That tests the docs and the gates
  together. It is a third arm for a later decision.
- **Judge the plain result in its own clone.** The missing configs would show
  the reviewer which arm it reads.

## Consequences

- Three runs per arm give a direction, not a significance level. The report
  states the counts and medians so a reader can judge the margin.
- The Todo brief is small. A result on it says little about a large codebase;
  the external-task trials of [0048](0048-trial-tasks-and-codex.md) are the
  next place to apply two arms.
- The written rules name gate commands that the plain scaffold lacks. The
  plain prompt says so.
- A plain agent can still run a default linter by hand. The arm removes the
  repository's rules, not the installed tools.
- The plain run's id shows in its folder name. The reviewer session gets no
  word about arms.
- A change to `STRIPPED_PATHS`, either prompt or either task starts a new
  baseline for both arms.
- This adds no gate and no dependency.
