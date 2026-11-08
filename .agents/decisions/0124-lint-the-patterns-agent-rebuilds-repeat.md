# 124. Lint the patterns agent rebuilds repeat

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-08
- **Amends:** [0050](0050-anti-slop-lint-policies.md),
  [0109](0109-declarative-policy-lint.md)

## Context

Nine agents rebuilt a reference feature from its PRD: six to-do rebuilds and
three greeting rebuilds. Every rebuild passed every gate, and each still
carried patterns a reviewer would reject. Six of them recurred, can be found in
one file with no type information, and had no false positive in the
reference. Several are what agents reach for in place of a banned form: with
`noUncheckedIndexedAccess` on and the non-null assertion banned, a test that
needs a value writes `?? ''`, because the repository offered no sanctioned way
to unwrap one.

## Decision

Add six rules to `tooling/oxlint-plugin-policy.js`, each at error in the
result-root override, `{apps,packages}/*/src/**/*.{ts,tsx}` and
`showcase/*/*/src/**/*.{ts,tsx}`:

- `policy/one-status-from-hooks`: a `use*` hook returns one `status` union,
  and one object it returns reads at most one of a query's `data`, `error`,
  `status`, `isPending`, `isLoading`, `isFetching`, `isError` and
  `isSuccess`, following one `const` binding.
- `policy/test-unwraps-values`: a test takes a value with `present()` and an
  outcome's value with `unwrap()`. `?? ''` and an `x.ok ? x.value… : <literal>`
  stand-in fail. The rule also runs on
  each result's `web/e2e/**/*.ts`, in an override of its own.
- `policy/test-imports-the-type`: a test declares no interface or type alias
  that a non-test module in its folder exports.
- `policy/message-uses-its-limit`: a string or JSX text holds no number that a
  module-scope `const` of 10 or more in the same file names. Smaller numbers
  appear in ordinary prose too often to tie to one constant.
- `policy/import-types-from-their-owner`: a module under `src/routes/<slice>/`
  or `src/features/<slice>/`, other than `index.ts`, re-exports nothing, from
  a source or from an import.
- `policy/keep-rejections`: a `.catch` or second `.then` handler that ignores
  its error and returns a literal, `undefined` or nothing fails, following one
  `const` binding.

Tests and specs are outside the three source rules, and inside the two test
rules. Ship `present` and `unwrap` in `tooling/jest/test-globals.ts`, beside
the Jest setup that holds the other shared test helpers. `present(value)`
returns a value that is neither `null` nor `undefined` and throws otherwise.
`unwrap(outcome)` takes only an `{ ok: true, value } | { ok: false }` outcome,
returns its value, and throws with the failure otherwise. The Jest setup makes
both globals, because a unit test in a package may import nothing from outside
that package (`policy/slice-isolation`). `tooling/types/test-globals.d.ts`
types them, and only the test type programs, `tsconfig.test.json` and
`tsconfig.api.test.json`, include it: the web and api programs exclude test
files, so a production module that calls either fails `pnpm typecheck`. A
result is self-contained and a showcase copies the reference's `e2e/` folder,
so each result's `e2e/fixtures.ts` holds its own five-line `present`, which a
unit test holds to the same behaviour as the Jest global, and each E2E spec
imports it from there.

## Consequences

The reference fixes its own hits in the same change: four in
`application.test.ts`, five in `e2e/todos.spec.ts` and the restated `Todo` in
`TodosPage.test.tsx`. Each rule fires on the rebuild samples it was mined
from. Until the pre-commit hook runs `pnpm lint:policy`, these rules fail at
pre-push and in CI rather than at commit.

`policy/one-status-from-hooks` reads only the returned object, so a hook that
splits the flags across helper functions passes. `policy/test-unwraps-values`
leaves other fallback strings such as `?? 'waiting'` to review, because a test
may render one on purpose. Both are trade-offs for a zero false-positive rate.
