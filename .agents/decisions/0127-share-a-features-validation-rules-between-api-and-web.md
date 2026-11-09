# 127. Share a feature's validation rules between the api and the web

- **Status:** Proposed (the maintainer decides before the prototype merges)
- **Date:** 2026-11-08
- **Amends:** [0032](0032-api-ui-greeting-and-contract.md) (role table),
  [0075](0075-canonical-colocated-routes.md) (route co-location),
  [0123](0123-a-to-do-app-is-the-reference-feature.md) (rules live in the api domain)
- **Issue:** #338

## Context

The to-do PRD says the api owns the title rules and applies them to every
title it receives, and that the page applies the same rules before it sends a
title: trim and collapse whitespace, accept 1 to 100 characters, and say
`Enter a title` or `Use 100 characters or fewer`.

The architecture lets the web reach the api by type only. Fallow lists every
api role under `allowTypeOnly` for the web roles, `@repo/api` exports types
only, and route co-location ([ADR 0075](0075-canonical-colocated-routes.md))
limits a route to its own folder, `@repo/ui`, the api-client barrel and
external npm packages. The title rules are values, so the only legal move is
to write them twice: `normaliseTitle`, the limit and both messages in
`apps/api/src/features/todos/domain.ts`, and again in
`apps/web/src/routes/todos/todoFormSchema.ts`.

Nine agent rebuilds show what that costs:

- 6 of the 9 rebuilds, all six to-do rebuilds, wrote the title rules twice,
  as the reference does (finding R1). Rehearsals r7, r8 and r9 did the same.
- The two copies already differ in form. In r1, r4, r5, r7, r8 and r9 the web
  copy writes `Use 100 characters or fewer` beside `MAX_TITLE_LENGTH = 100`,
  while the api interpolates its constant (finding P4). Change the limit in
  one place and the page and the api disagree.
- r8 and r9 split the rule between the schema and the hook, so the title was
  normalised two or three times (finding B4).
- Fallow's clone detector misses one-line duplicates, and the E2E tests only
  catch drift for the inputs they try.

## Options considered

1. **Status quo.** Keep two copies and rely on the PRD's E2E tests and review.
   No rule changes and the web stays free of api code. Every rebuild keeps
   writing the rule twice, each change needs two edits, and drift between the
   copies passes every gate until an E2E input happens to cross it.
2. **A small shared pure module that both the api domain and the web form
   import.** One source for the normaliser, the limit and the messages, with
   no runtime dependencies. Where it lives decides the cost:
   - a workspace package under `packages/` would be shared by every result,
     but each trial result rebuilds its own rules, and the structure check
     keeps a result's imports inside the result or `packages/ui`;
   - a `rules.ts` in the api feature keeps the api as the owner the PRD names
     and keeps each result self-contained. The web then makes its first value
     import from the api, limited to that one pure file.
3. **Api-only validation, with the web showing the api's errors.** One copy and
   no rule changes. It changes behaviour the PRD pins: the page would send a
   blank or over-long title instead of sending nothing, show the message only
   after a round trip, and clear it only after another. That needs a PRD
   change with sign-off, and the field would depend on the network to say a
   title is empty.

## Decision

Take option 2, with the module in the api feature.

- **Each api feature may hold one `rules.ts`**, the values both sides need to
  check an input before it is used: limits, messages and normalisers. It
  imports nothing. The to-do feature's holds `TITLE_MAX_LENGTH`,
  `TITLE_MESSAGES` and `normaliseTitle`.
- **The api domain imports it by value.** `checkTitle` keeps its outcome type
  and builds it from the shared normaliser, limit and messages. The domain no
  longer defines the title rules itself.
- **The web form imports it by value** through the api package's subpath
  `@<scope>/api/<feature>/rules`, for example `@repo/api/todos/rules`. The
  Effect form schema decodes with `normaliseTitle` and checks the shared limit
  and messages, so the form submits what it checked. `@<scope>/api` itself
  stays types-only.
- **Each side applies the rules with its own tools.** The api returns an
  `Outcome`; the web uses Effect Schema checks. Sharing the predicates as well
  is left for a later change, if a rule grows beyond a limit and a normaliser.

## Zone and import-rule changes

| Where | Change |
| --- | --- |
| `.fallowrc.jsonc` | New zone `api-rules`: `{apps,showcase/*}/api/src/features/*/rules.ts`. It imports no other role, types included, like `ui`. `api-domain`, `web-routes` and `web-features` may import it by value; every other role except `ui` lists it under `allowTypeOnly`. |
| `tooling/architecture/contract.rules.jsonc` | New `contract/rules-pure`: `api-rules` imports no `@trpc/server`, `effect`, React or Node module. |
| `tsconfig.domain.json` | Compiles `rules.ts` with the domain: no Node types and no DOM. |
| `tooling/architecture/structure.mjs` | `route-colocation` also allows `@<scope>/api/<feature>/rules` from a route, and an edge to its own result's `api/src/features/*/rules.ts`. |
| `apps/api/package.json` | Adds the export `"./*/rules"` with a `default` condition to `src/features/*/rules.ts`; `.` stays `types` only. |
| `apps/web/package.json` | Moves `@repo/api` from `devDependencies` to `dependencies`, because the web bundle now ships code from it. |
| `tooling/architecture/contract.test.ts`, `tooling/trial/inclusion.test.ts` | The pinned role list, value directions and domain program gain `api-rules`. Seeded tests in `boundaries.test.ts` and `structure.test.ts` prove each allowance and each failure. |
| `ARCHITECTURE.md`, `CONVENTIONS.md` | The role table, the api file roles, the rules table and the contract table name `rules.ts`. |
| `AGENTS.md` | Not changed in the prototype. If this is accepted, its rules table sentence on route co-location also names "its api's feature rules modules (`@<scope>/api/<feature>/rules`)". |

`policy/slice-isolation` and `no-restricted-imports` need no change: the
subpath is a package name, not a relative path into `features/`.

## Consequences

- One copy of the title rules. Changing the limit or a message changes the api
  and the page together, and the hard-coded `100` beside its constant (finding
  P4) has nowhere to appear.
- The web makes its first value import from the api, bounded by Fallow to one
  pure file per feature. The bundle gains the shared module and loses the web
  copy, so its size barely moves.
- A rebuild that keeps both copies still passes. A cheap follow-up,
  `check:shared-literals`, can fail on any string of 12 or more characters
  present in both `apps/api/src` and `apps/web/src`, so a second copy of a
  message fails the gate.
- Trial results follow the reference: a showcase result that shares rules
  uses the same zone and subpath, and the manifest check holds its `exports`
  to the reference's. Recorded trial evidence stays unchanged.
- The PRD is unchanged: the api still owns the rules and the page still
  applies them before it sends a title.
- Rollback: revert the prototype; both copies return.
