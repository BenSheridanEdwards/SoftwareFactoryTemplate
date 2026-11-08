# 124. Lint the patterns agent rebuilds repeat

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-08
- **Amends:** [0050](0050-anti-slop-lint-policies.md),
  [0109](0109-declarative-policy-lint.md)

## Context

Nine agents rebuilt a reference feature from its PRD: six to-do rebuilds and
three greeting rebuilds. Every rebuild passed every gate, and each still
carried patterns a reviewer would reject. Six of them recurred, can be found in
one file with no type information, and leave the fixed reference with no
finding. Two later to-do rebuilds, r7 and r8, repeated them and added one
variant, a status read through a lookup object. Several are what agents reach for in place of a banned form: with
`noUncheckedIndexedAccess` on and the non-null assertion banned, a test that
needs a value writes `?? ''`, because the repository offered no sanctioned way
to unwrap one.

## Decision

Add six rules to `tooling/oxlint-plugin-policy.js`, each at error in the
result-root override, `{apps,packages}/*/src/**/*.{ts,tsx}` and
`showcase/*/*/src/**/*.{ts,tsx}`:

- `policy/one-status-from-hooks`: a `use*` hook returns one `status` union,
  and one object it returns reads at most one of a query's `data`, `status`,
  `isPending`, `isLoading`, `isError` and `isSuccess`. A query is a `const`
  bound to the result of `useQuery`, `useSuspenseQuery` or `useInfiniteQuery`.
  A lookup keyed by the status, such as `STATES[list.status]`, reads
  `status`. The rule follows one `const` binding, and resolves each name in
  its own scope. `error` and `isFetching` describe a state rather than choose
  one, so `{ status: list.status, problem: list.error }` and
  `{ list: list.data, refreshing: list.isFetching }` pass, as does a mutation
  hook's `{ submitting, problem }`.
- `policy/test-unwraps-values`: a test takes a value with `present()` and an
  outcome's value with `unwrap()`. `?? ''` fails, and so does a ternary on
  `x.ok` whose other branch reads `x.value…` and whose fallback is a literal;
  `response.ok ? 'passed' : 'failed'` passes. The rule also runs on each
  result's `web/e2e/**/*.ts`, in an override of its own.
- `policy/test-imports-the-type`: a test declares no interface or type alias
  that a non-test module in its folder exports with a declaration at the
  start of a line, so `export type` inside a string or comment that does
  not start a line does not count. One scan of a folder serves all its tests
  until a module in it changes, and then replaces the earlier scan, so the
  cache holds one scan per folder and extension mode.
- `policy/message-uses-its-limit`: a string, template or JSX text writes no
  limit as a count. A limit is a module-scope `const` of 10 or more in the
  same file whose name holds `MAX`, `MIN`, `MAXIMUM`, `MINIMUM`, `LIMIT`,
  `LENGTH` or `LEN` (`TITLE_MAX_LENGTH`, `maxTitleLength`). A count is the
  number, or its grouped form such as `1,000`, followed by a word
  (`100 characters`), so `100%`, `gap-10` and a port in a URL pass. JSX
  attribute values and import sources hold no message and are skipped.
  Smaller numbers appear in ordinary prose too often to tie to one
  constant.
- `policy/reexport-only-from-index`: a module under `src/routes/<slice>/` or
  `src/features/<slice>/`, other than the slice's own `index.ts`, re-exports
  nothing, from a source or from an import, so its siblings import each name
  from the module that declares it. A nested barrel such as
  `src/routes/todos/components/index.ts` is not the slice's public surface
  and fails too: `no-restricted-imports` already admits only
  `routes/*/index.ts` and `features/*/index.ts` as entry points.
- `policy/keep-rejections`: a `.catch` or second `.then` handler that ignores
  its error and returns a literal, `undefined` or nothing fails, following one
  `const` binding resolved in the handler's own scope. When a caller means to
  ignore a failure, settle the promise and read the result:
  `void Promise.allSettled([prefetch()])` for a fire-and-forget call, or
  `Promise.allSettled([save()]).then(([result]) => result?.status === 'fulfilled')`
  for a yes or no. Both keep the rejection in the settled result and pass
  `pnpm lint:policy`, `pnpm lint:anti-slop` and Biome. A handler that uses its
  error, such as `.catch(report)`, also passes.

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
so each result's `e2e/fixtures.ts` holds its own five-line `present` and
`unwrap`, which a unit test holds to the same behaviour as the Jest globals,
and each E2E spec imports them from there.

## Consequences

The reference fixes its own hits in the same change: four in
`application.test.ts`, five in `e2e/todos.spec.ts` and the restated `Todo` in
`TodosPage.test.tsx`. Each rule fires on the rebuild samples it was mined
from, and r7 and r8 confirm them.

Each rule trades recall for precision, and its fixtures, valid and invalid,
mark the boundary. `policy/one-status-from-hooks` reads only the returned
object, so a hook that splits the flags across helper functions passes, and it
leaves `data` beside `error` to review. `policy/test-unwraps-values` leaves
other fallback strings such as `?? 'waiting'` to review, because a test may
render one on purpose. `policy/message-uses-its-limit` skips JSX attributes, so
a `placeholder` that restates a limit passes; a limit not followed by a word,
such as `at most 100.` or `100-character`, passes. The first version of these rules
reported five shapes that were not the pattern, found in review: a query's
`isFetching`, a mutation's state, a status beside its error, a flattened local
union and an `ok` check that never reads `value`. Each is now a passing
fixture.
