# 128. Warning findings and test console warnings fail the gate

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-09
- **Amends:** [0086](0086-console-warnings-fail-tests.md) for workers, other
  pages and the Playwright test process, [0079](0079-no-advisory-lint.md)
  for how a Fallow warning fails the gate, and
  [0059](0059-preserve-recorded-trial-outputs-in-duplication-analysis.md),
  whose per-result `duplicates.ignore` entries give way to one `showcase/**`
  entry

## Context

Biome, Oxlint and React Doctor already fail on a warning (ADR 0046). ADR 0086
made a console warning or error fail a Jest test and a Playwright page, and
left three gaps that issue #231 names:

- Fallow reports a finding whose rule is set to `warn` and still exits 0.
  ADR 0079 removed the warn tier and a Jest test checks the config, but nothing
  showed that a Fallow warning fails the gate itself. Duplication has no rule:
  `fallow audit` reports each clone group as a warning, returns the `warn`
  verdict and exits 0 unless `duplicates.threshold` is set, and main set none.
- The Playwright fixture listened on the test's page only, so a popup, a
  second page or a dedicated worker could warn or throw unseen.
- A warning from the test's own Node process, such as a `console.warn` in spec
  code or a Node deprecation, passed.

## Decision

- **Fallow.** A Fallow warning means a finding at warn severity, the same
  class as a Biome or Oxlint warning. `pnpm arch:gate` runs
  `scripts/check-fallow-severity.mjs` before `fallow architecture`. It reads
  the resolved config with `fallow config` and fails, naming each cause, when
  a rule, an override's rule or a rule-pack file sets `warn`, or when
  duplication is on with a threshold of 0 or above 0.001. `arch:gate` runs at pre-commit and in
  the CI Fallow job.
- **Duplication.** `.fallowrc.jsonc` sets `duplicates.threshold` to `0.001`
  percent of the lines Fallow analyses. The smallest clone group (two
  five-line copies) exceeds it while the analysed code stays under about a
  million lines, so any clone group makes the audit fail; main analyses about
  18,600 lines and has none. A codebase past that size lowers the threshold.
- **Showcase results leave duplication analysis.** A showcase result copies
  the reference's template files by design (ADR 0034), so with a threshold
  every trial result would fail its own audit on code it must copy. This
  amends ADR 0059: `duplicates.ignore` holds one `showcase/**` entry in place
  of named per-result entries, so code-duplication analysis no longer runs on
  any showcase result, for clones inside it or against `apps/`. Its
  `health.ignore` rule for styling and complexity is unchanged, and dead-code
  and architecture analysis still read every result.
- `tooling/architecture/boundaries.test.ts` proves each case on a seeded
  repository. With `boundary-violation` at `warn`, Fallow alone reports the
  route-to-route import and exits 0, and the gate's Fallow steps exit 1. A
  rule-pack rule at `warn` and a config with no duplication threshold fail the
  same steps. A committed clone gives the audit a `warn` verdict and exit 0
  without the threshold, and a `fail` verdict and exit 1 with it.
- **Playwright pages and workers.** The fixture in each result's
  `e2e/fixtures.ts` listens on the browser context's `console` and `weberror`
  events, which carry every page, popup and dedicated worker the test opens.
- **Playwright test process.** The same fixture records `console.warn`,
  `console.error` and Node `warning` events in the test's worker process,
  waits one turn of the event loop for a pending warning, and restores the
  originals before it checks. These messages start with `runner`, and
  `expectedConsole` declares them like any other; a pattern matches page and
  runner messages alike. Node prints its own warnings through
  `console.error`, so the patch skips text that starts with
  `(node:<pid>) `, and the warning listener records each one once.
- When the fixture fails, it attaches `console-guard.json` with the exact
  `unexpected` and `missing` lists, so the proof compares them instead of
  reading the assertion's text diff.
- `pnpm e2e:console-guard` proves each new case fails with exactly its
  attached result: a worker warning and error, a popup warning and error, and
  a runner `console.warn`, `console.error` and process warning. It also runs
  five mutants of the fixture, each without one recording path (console
  errors, worker messages, popup pages, `console.warn`, process warnings),
  and requires the matching case to pass there, so the proof fails if the
  fixture stops recording it. One child run serves all the mutants, so the
  proof starts its servers twice, as before. It runs its children without
  `NO_COLOR`, as CI does; beside `FORCE_COLOR`, that variable makes Node warn
  as each worker starts.

## Consequences

A warn-severity finding from Biome, Oxlint, React Doctor or Fallow fails its
gate. A console warning or error or a Node deprecation in a Jest test, and a
console warning or error in a Playwright page, popup or worker or the
Playwright test process, fails that test. The North Star states this as a
guarantee.

These stay outside the guarantee:

- Fallow's log lines on stderr, such as `boundary zone 'web-routes' matched 0
  files`, are tool diagnostics, not findings, and stay non-fatal. Main prints
  two on every run: the `web-routes` parent zone, whose files `autoDiscover`
  moves into its per-route children, and `web-features`, which the contract
  keeps for slices the reference has not built yet. Failing on them would fail
  a clean main.
- Output from the Playwright runner outside a test (config load, the web
  servers' own logs) and service-worker lifecycle messages; the app registers
  no service worker.
- Duplication in a showcase result, inside it or against the reference.
- Tools outside this list. commitlint, for example, keeps the
  `body-leading-blank` and `footer-leading-blank` warnings of
  `@commitlint/config-conventional` and exits 0 on them.
- Console output at module load in Jest, outside a test's hooks (ADR 0086).
