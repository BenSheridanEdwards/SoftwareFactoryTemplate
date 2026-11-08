# 123. Pre-commit runs every lint, style and architecture gate

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-08
- **Amends:** [0062](0062-pre-commit-steps-stay-under-30-seconds.md) for the
  list of pre-commit steps

## Context

The factory writes coding standards, conventions and architecture boundaries
as lint rules. Those rules pay off when the agent hears about a mistake inside
its own loop, seconds after making it. Before this change `.husky/pre-commit`
ran typecheck, staged Biome, `pnpm lint:anti-slop`, `pnpm fallow:audit` and
`pnpm secret-scan`. Four gates ran only at push and in CI:

- `pnpm lint:policy`: Oxlint with `oxlint.config.ts`, which from
  [ADR 0124](0124-oxlint-owns-all-lint-biome-only-formats.md) holds every lint
  rule except the anti-slop set.
- `pnpm lint:styles`: the style-token check over CSS and `index.html`
  ([ADR 0114](0114-tailwind-on-the-ui-design-tokens.md)). Its TypeScript twin,
  `policy/no-arbitrary-styles`, lives in `pnpm lint:policy`.
- `pnpm check:suppressions`: the ban on inline lint and coverage suppressions.
  Without it at commit, an `oxlint-disable` comment passed pre-commit.
- `pnpm arch:gate`: Fallow architecture zones, the folder structure check and
  the role diagram check.

BulletproofRepository made this change first, in its ADRs 0123 and 0127. This
record brings the same hook layout upstream.

[ADR 0062](0062-pre-commit-steps-stay-under-30-seconds.md) lets a step into
pre-commit only when it finishes in under 30 seconds, with timings recorded.
On 8 November 2026, on one Apple M2 Max with load averages of 5 to 24 from
other work, the median of five wall-clock runs of each step, with
[ADR 0124](0124-oxlint-owns-all-lint-biome-only-formats.md) applied, on the
whole repository and after a one-file staged change, was:

| Step | Whole repository | One staged file |
| --- | --- | --- |
| `pnpm typecheck` | 0.84 s | 0.90 s |
| staged Biome | 0.14 s | 0.10 s |
| `pnpm lint:policy` | 1.40 s | 1.44 s |
| `pnpm lint:styles` | 0.66 s | 0.67 s |
| `pnpm lint:anti-slop` | 1.05 s | 1.03 s |
| `pnpm check:suppressions` | 1.14 s | 1.18 s |
| `pnpm arch:gate` | 1.86 s | 1.93 s |
| `pnpm fallow:audit` | 2.82 s | 1.55 s |
| `pnpm secret-scan` | 1.18 s | 1.56 s |

The whole hook takes about 11 seconds. The slowest step takes under
3 seconds, a tenth of the budget.

## Decision

- `.husky/pre-commit` runs, in order: `pnpm typecheck`, staged Biome,
  `pnpm lint:policy`, `pnpm lint:styles`, `pnpm lint:anti-slop`,
  `pnpm check:suppressions`, `pnpm arch:gate`, `pnpm fallow:audit` and
  `pnpm secret-scan`. The architecture gate runs before the Fallow audit so a
  boundary violation is reported by the gate that owns boundaries.
- React Doctor's project scan stays in `pnpm verify` and CI. It calls a
  third-party score API, and a commit must not depend on one.
- Every new hook step keeps its CI twin: `lint:policy`, `lint:styles` and
  `check:suppressions` in the `quality` job, `arch:gate` in the `fallow` job.
  The contract in `scripts/required-gates.mjs` names `.husky/pre-commit` as a
  source for each, and `docs/required-gates.md` is regenerated.
- This change tightens enforcement. It loosens no rule, threshold or allowlist.

## Consequences

Pre-commit takes about 5 seconds longer. Each step stays well inside the
ADR 0062 budget. A lint error, a style-token break, an inline suppression or
an architecture boundary violation now stops `git commit` with the rule name,
file and line. Push and CI still run the same commands, so a bypassed hook is
caught later.

Policy lint, the style check, anti-slop lint, the suppression scan and the
architecture gate read the files on disk, like typecheck, not the staged
snapshot. Biome and gitleaks read staged content. So a staged violation whose
working-tree copy is fixed but unstaged can pass at commit; pre-push and CI
run the same commands on the pushed tree and fail it there. An untracked file
with a finding also stops a commit that does not include it: stage, stash or
delete it.

Revert the hook lines, the contract sources and the regenerated inventory
together to restore the previous hook.
