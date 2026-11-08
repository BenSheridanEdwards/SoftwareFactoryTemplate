---
name: write-unit-tests
description: Write Jest + React Testing Library unit/component tests that assert behaviour through the accessibility tree, not implementation detail. Use when adding logic or components, fixing a bug (write the failing test first), or raising coverage in this repository.
---

# Write unit tests

Test what users perceive through the public surface so tests survive refactors.
Use this skill for new pure functions, hooks, or components; bug fixes (write
the failing test first); and coverage below `jest.config.ts`'s 80% threshold.

## Principles

- When the element is always rendered, wait for its content with `waitFor`, not for the element with `findBy*`.
- Query by `getByRole`, `getByLabelText`, or `getByText`; use `getByTestId` only
  when no accessible query fits. Assert observable behaviour, not state, props, or classes.
- Drive with `userEvent` rather than `fireEvent` to model real interaction.
- Use one behaviour per `it`, named as a sentence about the product.
- Test logic where it lives. Test domain rules (`checkTitle` in `domain.ts`)
  and use cases (`addTodo` in `application.ts`) as functions. Test procedures
  through `createCallerFactory(create<Name>Router())({})` from `trpc.ts`, with valid
  input and `BAD_REQUEST` rejection; see `apps/api/src/features/todos/procedures.test.ts`.
  Test form schemas by decoding (`todoFormSchema.test.ts`), and hooks and
  pages through rendered behaviour. See `.agents/project/ARCHITECTURE.md`.
- Render pages and hooks that call the api inside the api client's
  `TestApiProvider`. It serves the real app router in memory, with empty stores
  for each render, so the test runs the feature's procedures, application and
  domain code. Write no fake api. Add data through the router with `seed`
  (`async (api) => { await api.todos.add.mutate({ title: 'First' }); }`).
  Give a typed handler for a procedure path only to fail that call
  (`() => Promise.reject(new Error('api down'))`), hold it, or record it with
  `jest.fn((input, serve) => serve(input))`; `serve` passes the call on to the
  router. Run real hooks and providers, leaving hooks unmocked. Model:
  `apps/web/src/routes/todos/TodosPage.test.tsx`. Test a hook on its own with
  `renderHook` and a `TestApiProvider` wrapper.
- Replace dependencies through their seams. `jest.mock` fails `pnpm lint:anti-slop`.
- Fix console warnings, console errors and Node process warnings; the Jest
  setup fails the test when it records one. A test that expects a warning
  installs `jest.spyOn(console, 'warn').mockImplementation(() => undefined)`
  itself and asserts the call. Use the same pattern for an expected console error.

## Process

1. Copy `.agents/templates/component.test.tsx.template` beside the unit as
   `<Name>.test.tsx`. Jest runs three root projects: `web` (jsdom) for
   `{apps,showcase/*}/web/src/**` and `packages/*/src/**`, `api` (node) for
   `{apps,showcase/*}/api/src/**/*.test.ts`, and `tooling` for `scripts/` and `tooling/`.
2. Cover the default state, each user action, and edge cases: empty or blank
   input, api error, validation error.
3. Run coverage and close every gap the threshold reports.

## Commands

```bash
pnpm test                 # run the suite
pnpm test:watch           # TDD loop
pnpm test:coverage        # enforce the coverage threshold
pnpm test TodosPage        # run one file by name
pnpm test --selectProjects api   # run one Jest project
```

## Done when

`pnpm test:coverage` passes without threshold failures and every behaviour has
a test. Follow [`.agents/project/PR_QUALITY.md`](../../../.agents/project/PR_QUALITY.md).
