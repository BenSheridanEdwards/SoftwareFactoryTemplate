# 123. A to-do app is the reference feature

- **Status:** Accepted
- **Date:** 2026-11-08
- **Accepted:** 2026-11-12
- **Amends:** [0032](0032-api-ui-greeting-and-contract.md),
  [0045](0045-prds-state-intent-and-link-their-specs.md),
  [0058](0058-prds-name-the-code-they-cover.md),
  [0107](0107-a-second-api-feature-proves-feature-isolation-on-the-real-tree.md)

## Context

The reference result shipped two features: the greeting, where a visitor
types a name and the api answers `Hello, <name>!`, and recent greetings, an
in-memory list of greeted names. Engineers read the reference, delete it and
rebuild it from its PRD to see what the factory does.

The greeting is too small for that. Most gates have nothing to catch: the
domain is one string template, there is no state change, the page has one
form and one failure path. A rehearsal of the delete-and-rebuild exercise
found a second problem. Rebuilds passed every gate yet behaved differently in
three places that no PRD promise and no test pinned: which layer collapsed
whitespace and the exact form shown, a `Loading…` state that disappeared,
and when the recent list refreshed. The greeting page also carried a promise
that lived in the recent greetings PRD, so deleting one feature's folders
broke the other's behaviour.

The maintainer decided on 8 November 2026 to replace both features with a
to-do app, at the "standard" scope: add, mark done or active, edit the title,
delete, filter by all, active or done, clear done, reject blank and over-long
titles, keep everything the visitor typed or had when the api fails, and keep
the list in memory on the api.

## Decision

Ben (maintainer) accepted this decision on 12 Nov 2026:
"Yes, the to-do app is the reference feature".

**One feature, one PRD.** `docs/prd/todos.md` specifies every detail a
visitor or an api client can see: the exact words, the order, the normalised
title form, the 100-character limit, the loading, pending, empty and failure
states, the default filter, what Clear done does with nothing done, and when
the page re-reads the list. Each behaviour links to an E2E test. Its Covers
list names the two feature folders, and no other PRD promises anything about
them.

**The to-do app is the reference feature.** It crosses the web page, the tRPC
contract and every api layer, so each gate in the repo has real code to check:
title rules and state changes in the api domain, storage in integrations,
forms and server state in the route's hooks, and Tailwind on the `@repo/ui`
tokens. Because every visible detail has an E2E test, a rebuild from the PRD
alone behaves the same as the original, and the exercise shows what the gates
catch and what they let through.

**Rules live in the api domain.** `apps/api/src/features/todos/domain.ts`
holds the title rules (normalise, then check 1 to 100 characters) and the
state changes, as pure functions. Application calls them and the in-memory
store in `integrations.ts`, and returns a result the procedures map to
`BAD_REQUEST` or `NOT_FOUND`. Procedures validate the input shape with Effect
Schema. The web form applies the same title rules in its Effect form schema,
because the web reaches the api by type only, and sends the normalised title.

**Changes are pessimistic.** The page shows a change only after the api
answers and the list is re-read. Mutations await the list invalidation, so
every change control stays disabled until the new list arrives. A failure
leaves the list as it was, keeps what the visitor typed and shows one alert
for the latest failure. A re-read that fails after a successful change shows
the same alert as a failed first read, so the page never shows a stale list
without saying so. The list query in `useTodos` turns off refetch on focus
and on reconnect, so the list is read when the page opens and after a
successful change only. The setting sits on that query, inside the folders
the PRD covers, rather than on the shared query client, so a rebuild of the
feature carries it and other queries keep the library defaults.

**E2E tests share one api, so one spec writes to it.** Playwright runs specs
in parallel against one api process, and the list is global. `todos.spec.ts`
is the only spec that changes to-dos; it runs its tests in order in one
worker and empties the list through the api before each test. The
accessibility and visual specs serve a fixed `todos.list` answer through
`page.route`, so they read no shared state and write none.

**Greeting and recent greetings go.** Their routes, api features, PRDs, E2E
specs, API reports, visual baselines, docs, skill pages and test fixtures that
named their files are removed or moved to the to-do feature. Recorded evidence
(trial records and fixtures, the tour proof, older ADRs) keeps its content.

ADR 0032's contract and ADR 0107's storage model still hold; the to-do
feature is now the working example of both. With one real feature left,
ADR 0107's isolation proof reads the real to-do route and api application
and pairs each with a fixture `archive` sibling in the Oxlint policy test.

## Delivery plan

Land this decision as a sequence of PRs of at most 400 changed lines each.
First add to-dos beside the greeting at `/todos`, with its API layers and E2E
behaviour map. Keep the greeting available while those pieces land.
Once the feature and its E2E tests exist, add the to-do PRD with links to
those tests and the feature folders it covers. Then switch the reference
guidance to to-dos and remove the greeting and recent greetings together
with their obsolete routes, tests and PRDs. Keep recorded trial evidence.

ADRs 0045 and 0058 continue to require behaviour-to-test links and explicit
coverage paths; the new reference applies those rules to one self-contained
feature. This decision changes no file-counting or E2E server policy.

## Consequences

- Every gate sees real code: domain rules and state changes, storage in
  integrations, procedure input schemas, form schemas, server state with five
  mutations, local UI state for the filter and the open edit, Tailwind on the
  tokens, and E2E failure paths for every change.
- The E2E run takes longer, because the to-do spec runs its tests in one
  worker.
- The to-do trial brief in `tooling/trial/todo-prompt.md` asks agents to
  build a to-do app beside a reference that is now a to-do app. The brief and
  its recorded runs stay as they are; whether the research project keeps
  that brief is a separate decision.
- `.agents/templates/list-route.md` will point trial agents at
  `routes/todos/` for Button, TextField, token and test patterns. The trial
  prompts that name the greeting stay as they are: they are recorded
  evidence.
- The bundle, Lighthouse and coverage budgets stay where they are. Each
  implementation PR must prove it fits those budgets.
