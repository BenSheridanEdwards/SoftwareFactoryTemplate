# 131. Verify runs once before a push and leaves the lab suites to CI

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-11
- **Amends:** [0028](0028-pre-push-runs-the-full-local-gate-suite.md),
  [0092](0092-split-jest-ci-lanes.md)

## Context

`pnpm verify` took 200 seconds on a 4-core container on 10 November 2026, and its Jest step
took 141 of them. That step ran 3,138 tests; 57 test the product. In the two-arm pilots the
wait was the main cost of the gated arm, and a less capable builder put the command in the
background and lost track of it.

Two parts of that cost check nothing about the change being pushed.

- `AGENTS.md` told a builder to run `pnpm verify` and `pnpm e2e` before each push. The
  pre-push hook then ran both again on the same tree.
- 14 suites test tools that gate no change: the trial harness in `tooling/trial/` and the
  benchmark in `scripts/bench/`. They hold 4 of the 10 slowest suites.

## Decision

**One run before a push.** Step 4 of "Before you push" in `AGENTS.md` now says to push
through git and let the pre-push hook run `pnpm verify` and `pnpm e2e` once. A harness that
pushes without the hooks runs both commands first. The hook is unchanged.

**A `lab` Jest project.** `jest.config.ts` moves the suites of `tooling/trial/` and
`scripts/bench/` into a sixth project, `lab`. `tooling/trial/inclusion.test.ts` stays in
`tooling`: it checks that every gate includes a result. `scripts/lint-usage.test.ts` stays
too: it checks that the pre-commit hook keeps its exit status.

- `pnpm test` and `pnpm test:coverage` select `web api tooling`, as before, so `pnpm verify`
  and the pre-push hook leave the lab suites out.
- `pnpm test:lab` runs them. Run it after a change in `tooling/trial/` or `scripts/bench/`.
- `pnpm test:tooling` selects `tooling lab`, so the three CI tooling shards run every suite
  they ran before, and `Required gates` still needs them. No workflow changes.

In one run on 10 November 2026 the 14 lab suites took 158 of the 445 suite-seconds of the
Jest step, 36 percent. A run of the step without the lab suites and the usage-logger suite
took 88 seconds of wall-clock time against 152 with them, on 4 cores.

## Alternatives

- **Run a suite only when its inputs changed.** The tooling suites read the real tree, so a
  sound input list is the whole repository, and an unsound one drops checks silently.
- **Reuse a green run for an identical tree.** It saves the second run and needs a new
  script, a record file and a hook change. Dropping the instruction saves the same run with
  no code.
- **Move every tooling suite out of verify.** The rest test the gates themselves. A broken
  gate script must fail before the push.

## Consequences

- A defect in the trial harness or the benchmark shows in CI and in `pnpm test:lab`, and no
  longer at push.
- `scripts/jest-scope.test.ts` still holds that every test file runs in exactly one project.
- A builder that runs `pnpm verify` by hand to debug a failure pays for it once more at
  push. That is a choice, and the instruction no longer asks for it.
