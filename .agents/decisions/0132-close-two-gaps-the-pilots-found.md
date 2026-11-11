# 132. Close two gaps the pilots found: a status beside its data, and earlier results in a builder's reach

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-11
- **Amends:** [0124](0124-lint-the-patterns-agent-rebuilds-repeat.md),
  [0115](0115-the-todo-research-project.md)

## Context

The pilots of 10 November 2026 found two gaps
([report](../../docs/trials/pilot-2026-11-10-weaker-model/README.md)).

- A gated builder on a less capable model wrote
  `const status = toStatus(list.isPending, failed)` and returned
  `{ status, todos: list.data ?? [] }`. `policy/one-status-from-hooks` followed one `const`
  and stopped at the call, so it counted one read of the query. The page could still read a
  placeholder list in every state, which is the defect the rule exists to stop.
- A builder read `tooling/trial/fixtures/todo-01.patch`, an earlier trial's result that sits
  inside the scaffold. The pilot reports now add six more results under `docs/trials/`.

## Decision

**The status rule reads through a call.** When a returned property is made by a call, the
rule takes one read per query from the call's arguments, each followed through one `const`
as before. `toStatus(list.isPending, failed)` beside `list.data ?? []` is two states of
`list` and fails. One property that maps a query to one state passes whatever it reads, so
`{ state: toState(list.isPending, list.isError, list.data) }` and the reference
`toGreetingState(name, query)` pass. Two fixtures in `scripts/oxlint-policy.test.ts` hold
both sides. The rule leaves the four correct hooks of the pilots without a finding and
reports the one that got past it.

**The prompts name what to leave unread.** `todo-prompt.md`, `todo-plain-prompt.md` and
`notes-prompt.md` tell the builder to read nothing under `tooling/trial/fixtures/` or
`docs/trials/`. In the pilots every builder that had this line kept to it.

## Consequences

- The rule still reads one file with no type information. A status computed in another
  module from the query object, or through two `const` bindings, passes.
- A call that takes the whole query passes too. In the drift test of
  [0130](0130-measure-the-two-arm-test-by-defects-and-test-drift.md) a gated builder
  returned `{ todos: list.data ?? [], status: queryStatus(list) }`. The reference shape,
  `{ list: toTodoList(list), count: list.data?.length }`, has the same form to a rule with
  no types, and a fixture holds that it passes. Review holds this case.
- The prompt line is an instruction and has no check. The harness records reads outside the
  clone; a check for these two folders inside the clone is a follow-up.
- `tooling/oxlint-plugin-policy.js` is a guarded file, so this change waits for sign-off.
- A change to a prompt starts a new baseline for the trials.
