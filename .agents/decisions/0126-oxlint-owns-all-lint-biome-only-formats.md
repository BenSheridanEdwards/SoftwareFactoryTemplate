# 126. Oxlint owns all lint; Biome only formats

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-08
- **Supersedes:** [0010](0010-lint-engine-ownership.md)
- **Implements:** [0073](0073-adopt-the-typescript-toolchain-standard.md)
  tasks T16 (Oxlint as main linter) and T17 (Biome formatting only)
- **Amends:** [0103](0103-eslint-is-retired.md) for the engine list

## Context

Two engines linted this repository. Biome ran 219 rules from its recommended
preset and `biome.json`, plus two naming rules in package sources. Oxlint ran
`oxlint.config.ts` (policy, React hooks and Compiler, Tailwind and 349 React
Doctor rules) and `.oxlintrc.json` (anti-slop). Each rule had one owner, but
an agent had to know which engine reported which concern, and
`oxlint.config.ts` excluded 47 React Doctor rules because Biome owned them.
ADR 0073 already chose Oxlint for general lint and Biome for formatting; this
record carries that out.

Biome's React rules were not running at all. Biome enables its React domain
from a React dependency in the root `package.json`, which has none, so
`useJsxKeyInIterable`, `noArrayIndexKey`, `noRenderReturnValue` and
`noDangerouslySetInnerHtmlWithChildren` were off while `oxlint.config.ts`
excluded their React Doctor twins as Biome-owned.

The spike behind this record (8 November 2026, Oxlint 1.89.0, Biome 2.5.1)
mapped every enabled Biome rule to a native Oxlint rule:

| Biome category | Rules | Exact or close native rule | Covered elsewhere | No equivalent | Not applicable |
| --- | --- | --- | --- | --- | --- |
| a11y | 37 | 35 | 0 | 2 | 0 |
| complexity | 34 | 27 | 3 | 4 | 0 |
| correctness | 52 | 30 | 1 | 15 | 6 |
| performance | 2 | 1 | 0 | 1 | 0 |
| security | 3 | 3 | 0 | 0 | 0 |
| style | 16 | 13 | 0 | 2 | 1 |
| suspicious | 77 | 56 | 4 | 13 | 4 |

"Covered elsewhere" means the parser, `tsc` or an existing policy rule
already rejects the code. "Not applicable" is GraphQL rules and rules about
Biome's own suppression comments. Of the 37 rules with no equivalent, 26 lint
CSS or HTML, which Oxlint does not parse; this repository has two CSS files
and one HTML file, and `pnpm lint:styles` already owns their policy. The rest
are rare logic slips (`noConstantMathMinMaxClamp`, `noStringCaseMismatch`,
`noApproximativeNumericConstant`, `noMisrefactoredShorthandAssign`,
`noSuspiciousSemicolonInJsx`), cosmetic rules (`noUselessStringRaw`,
`useSimpleNumberKeys`), `noSvgWithoutTitle`, `noEmptyTypeParameters` (which
`tsc` rejects) and `noDynamicNamespaceImportAccess`. Three close rules need
type-aware linting (`useLiteralKeys`, `useOptionalChain`, `useExportType`);
they stay off until this repository runs `oxlint --type-aware`.
`useNamingConvention` has no Oxlint rule, so `tooling/oxlint-plugin-naming.js`
ports it.

Timed on the same machine, median of seven interleaved runs, the lint step
did not get slower:

| Lint step | Whole repository | One staged file |
| --- | --- | --- |
| Before: staged Biome (lint, format, imports) + `pnpm lint:policy` | 0.95 s | 1.89 s |
| After: staged Biome (format, imports) + `pnpm lint:policy` with general rules | 0.96 s | 1.88 s |

Loading the JavaScript plugins dominates `pnpm lint:policy`; the 160 native
rules add about 50 ms. Biome's formatter alone checks the repository in about
0.14 s, so no faster formatter would change the commit loop. Oxfmt 0.77
(beta) formats the TypeScript identically except `it.each` tables in 26 test
files; dprint differed on 120 files. Biome stays the formatter.

The candidate config found one issue on the repository: `react/button-has-type`
on `packages/ui/src/Button.tsx`, which forwarded `type` from a prop. The
button now sets `type="button"` before spreading props, so a caller's `type`
still wins.

## Decision

- Oxlint owns every lint rule. `pnpm lint:policy` runs `oxlint.config.ts`,
  which spreads `tooling/oxlint-general-rules.ts` into its root rules: one
  native rule per Biome rule it replaces, named beside it, plus the four
  React rules above. `pnpm lint` runs the same command. `pnpm lint:anti-slop`
  keeps the vendored anti-slop rules.
- `oxlint.config.ts` enables the `typescript`, `jsx-a11y`, `import` and `oxc`
  plugins. Package sources get `naming/naming-convention` and
  `unicorn/filename-case`, the ports of Biome's naming override.
- The 47 React Doctor rules that Biome owned stay excluded; each now names the native Oxlint
  rule that owns its check.
- `biome.json` sets `linter.enabled` to `false`. Biome formats and orders
  imports through `pnpm check` and the staged pre-commit step.
- `scripts/lint-usage.mjs` records `pnpm lint:policy` findings at each
  pre-commit attempt as well as Biome and anti-slop findings
  ([ADR 0100](0100-record-per-rule-lint-failures-on-every-pre-commit.md)).

## Consequences

An agent reads every lint finding from one engine and one config. The
rules listed above as having no equivalent stop running; none is a correctness
check that tests, `tsc` or review would miss in agent-written TypeScript.
Turning Biome's linter off is a loosening that the enforcement gate reports,
so this change needs the approver's sign-off.

To revert, set `linter.enabled` back to `true` in `biome.json`, restore its
rule blocks and naming override, and remove the general rules spread and the
naming plugin from `oxlint.config.ts`.
