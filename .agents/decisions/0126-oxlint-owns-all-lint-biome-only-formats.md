# 126. Oxlint owns all lint; Biome only formats

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-08
- **Supersedes:** [0010](0010-lint-engine-ownership.md)
- **Implements:** [0073](0073-adopt-the-typescript-toolchain-standard.md)
  tasks T16 (Oxlint as main linter) and T17 (Biome formatting only)
- **Amends:** [0103](0103-eslint-is-retired.md) for the engine list, and
  [0002](0002-quality-gates-as-code.md) for the pre-commit lint engine

## Context

Two engines linted this repository. Biome ran 230 rules: 219 from its
recommended preset and `biome.json` at the root, two naming rules in package
sources, and nine domain rules that `biome rage` does not list. Biome turns a
domain on for every file under a `package.json` that lists the domain's
dependency. The React domain ran six rules in `apps/web` and `packages/ui`
(`useJsxKeyInIterable`, `noArrayIndexKey`, `noChildrenProp`,
`noDangerouslySetInnerHtml`, `noDangerouslySetInnerHtmlWithChildren`,
`noRenderReturnValue`); its other two recommended rules,
`useExhaustiveDependencies` and `useHookAtTopLevel`, are off in `biome.json`
because Oxlint's React hooks rules own them. The test domain ran
`noFocusedTests`, `noExportsInTest` and `noDuplicateTestHooks` in files under
the root package, which lists Jest. Biome also linted JSON and CSS.

Oxlint ran `oxlint.config.ts` (policy, React hooks and Compiler, Tailwind and
349 React Doctor rules) and `.oxlintrc.json` (anti-slop). Each rule had one
owner, but an agent had to know which engine reported which concern, and
`oxlint.config.ts` excluded 47 React Doctor rules because Biome owned them.
ADR 0073 already chose Oxlint for general lint and Biome for formatting; this
record carries that out.

The spike behind this record (8 November 2026, Oxlint 1.89.0, Biome 2.5.1)
mapped every Biome rule that ran on `main` to a native Oxlint rule:

| Biome category | Rules | Exact or close native rule | Covered elsewhere | No equivalent | Not applicable |
| --- | --- | --- | --- | --- | --- |
| a11y | 37 | 35 | 0 | 2 | 0 |
| complexity | 34 | 27 | 3 | 4 | 0 |
| correctness | 55 | 34 | 1 | 14 | 6 |
| performance | 2 | 1 | 0 | 1 | 0 |
| security | 5 | 5 | 0 | 0 | 0 |
| style | 16 | 14 | 0 | 1 | 1 |
| suspicious | 81 | 61 | 4 | 11 | 5 |

"Covered elsewhere" means the parser, `tsc` or an existing policy rule
already rejects the code. "Not applicable" is GraphQL rules, rules about
Biome's own suppression comments, and `useGoogleFontDisplay`, a Next.js rule.
Of the 33 rules with no equivalent, 26 lint CSS or HTML, which Oxlint does not
parse; this repository has two CSS files and one HTML file, and
`pnpm lint:styles` owns their token policy. The other seven are
`noStringCaseMismatch`, `noSuspiciousSemicolonInJsx`, `noSvgWithoutTitle`,
`noEmptyTypeParameters` (which `tsc` rejects), `noDynamicNamespaceImportAccess`
and two cosmetic rules (`noUselessStringRaw`, `useSimpleNumberKeys`).
Four close rules stay off. Three need type-aware linting (`useLiteralKeys`,
`useOptionalChain`, `useExportType`) until this repository runs
`oxlint --type-aware`. `unicorn/no-useless-undefined` is broader than
`noUselessUndefinedInitialization` and reports 32 places Biome accepted.
`useNamingConvention` has no Oxlint rule, so `tooling/oxlint-plugin-naming.js`
ports it. On the same source it reports the same names as Biome in 60 cases
across every selector the repository uses.

Timed on the same machine, median of seven interleaved runs, the lint step
did not get slower:

| Lint step | Whole repository | One staged file |
| --- | --- | --- |
| Before: staged Biome (lint, format, imports) + `pnpm lint:policy` | 0.95 s | 1.89 s |
| After: staged Biome (format, imports) + `pnpm lint:policy` with general rules | 0.96 s | 1.88 s |

Loading the JavaScript plugins dominates `pnpm lint:policy`; the native
general rules add about 50 ms. Biome's formatter alone checks the repository
in about 0.14 s, so no faster formatter would change the commit loop.
Oxfmt 0.77 (beta) formats the TypeScript identically except `it.each` tables
in 26 test files; dprint differed on 120 files. Biome stays the formatter.

The candidate config found one issue on the repository: `react/button-has-type`
on `packages/ui/src/Button.tsx`, which forwarded `type` from a prop. The
button now sets `type="button"` before spreading props, so a caller's `type`
still wins.

## Decision

- Oxlint owns every lint rule. `pnpm lint:policy` runs `oxlint.config.ts`,
  which spreads `tooling/oxlint-general-rules.ts` into its root rules: 170
  native rules, each naming the Biome rule it replaces, including the React
  and test domain rules. They run in every linted file, not only where Biome's
  domains applied. `pnpm lint` runs the same command. `pnpm lint:anti-slop`
  keeps the vendored anti-slop rules.
- The general rules match Biome's strength where an option allows it:
  `no-unused-vars` checks every argument and caught error (an `_` prefix
  opts out), `no-sequences` rejects a parenthesised comma, and
  `no-empty-function`, `func-style` and `no-multi-assign` cover the parts of
  `noEmptyBlockStatements`, `useArrowFunction` and `noAssignInExpressions`
  that their closest rules miss.
- `oxlint.config.ts` enables the `typescript`, `jsx-a11y`, `oxc` and `jest`
  plugins. Package sources get `naming/naming-convention` and
  `unicorn/filename-case`, the ports of Biome's naming override.
- The 47 React Doctor rules that Biome owned stay excluded; each now names
  the native Oxlint rule that owns its check.
- `biome.json` sets `linter.enabled` to `false`. Biome formats and orders
  imports through `pnpm check` and the staged pre-commit step.
- `scripts/lint-usage.mjs` records `pnpm lint:policy` findings at each
  pre-commit attempt as well as Biome and anti-slop findings
  ([ADR 0100](0100-record-per-rule-lint-failures-on-every-pre-commit.md)).

## Consequences

An agent reads every lint finding from one engine and one config. The rules
listed above as having no equivalent stop running. Some of them are
correctness checks, such as `noStringCaseMismatch` and the CSS rules that
reject unknown properties or units; tests, `tsc`, `pnpm lint:styles` and
review are the remaining defence. Turning Biome's linter off is a loosening
that the enforcement gate reports, so this change needs the approver's
sign-off.

Three checks now run in result sources only, where `policy/no-classes`,
`policy/no-let` and `unicorn/prefer-array-flat` cover them: `noThisInStatic`,
`noImplicitAnyLet` and `noFlatMapIdentity`. Scripts and tooling lose them.
This is an accepted loss: scripts and tooling hold no classes with static
members, `tsc` strict mode reports most implicit `any` from an untyped `let`,
and `flatMap((x) => x)` is a style slip, not a fault.

### Open question for the maintainer: duplicate JSON keys and CSS properties

Biome's linter also read the 30 tracked JSON and JSONC files and the two CSS
files. With it off, nothing reports a duplicate JSON key
(`noDuplicateObjectKeys`) or a duplicate CSS property
(`noDuplicateProperties`); a probe with one of each passes `biome check`,
`pnpm lint:policy` and `pnpm lint:styles` on this branch. A duplicate key in
`package.json`, a `tsconfig` or a lint config silently keeps the last value.
This record does not decide the fix. The options are:

1. Keep Biome's linter for `.json`, `.jsonc` and `.css` files only, through a
   `biome.json` override that enables those rules and nothing else. This keeps
   Biome's own checks but brings back a second lint engine for two file types.
2. Add a small duplicate-key check script that parses each tracked JSON and CSS
   file and fails on a repeated key or property, run by pre-commit and CI.
   This keeps one lint engine but adds a script to maintain.

To revert, set `linter.enabled` back to `true` in `biome.json`, restore its
rule blocks and naming override, and remove the general rules spread and the
naming plugin from `oxlint.config.ts`.
