# Consistency checklist for showcase/{{ID}}/

You check one app. Read the code in `showcase/{{ID}}/`. Read `AGENTS.md`, `.agents/project/ARCHITECTURE.md` and `.agents/project/CONVENTIONS.md` when you need the rules of this codebase. Only read. Change no file.

The app has an api with features under `api/src/features/` and a web app with routes under `web/src/routes/`. Skip `web/src/api-client/`, `web/vite.config.ts` and `web/e2e/fixtures.ts`: they are copied from a reference and are outside this checklist.

Answer each question below with `yes` or `no`. Answer `no` only when you can name the file and line that breaks it. Answer `yes` when nothing breaks it. When a question names "each" thing, give one answer per thing: one entry per hook, per mutation, per feature, per form, per route.

1. `one-status`: does each `use*` hook that reads a query return one status union that carries its data, with no loose `data`, `isPending`, `isLoading` or `isError` field beside it? One entry per such hook.
2. `one-state-on-screen`: can each page section render exactly one of loading, failed and loaded at a time? One entry per route.
3. `failure-reaches-user`: when each mutation fails, does the user see a message? One entry per mutation the web calls.
4. `failure-clears`: after a failed change, does the failure message go away when a later change of another kind succeeds? One entry per route that shows such a message.
5. `feature-roles`: does each api feature keep rules in a domain file with no import, use cases in an application file with no transport, state in an integrations file, and parsing with Effect Schema in a procedures file? One entry per api feature.
6. `form-pattern`: does each form use React Hook Form with the Effect schema resolver inside a `use*Form` hook, with the schema in its own file? One entry per form.
7. `tests-real-hooks`: do each route's tests run the real hooks through `TestApiProvider`, with no module mock? One entry per route.
8. `no-assertions`: is each feature and route free of type assertions (`as`, a chain through `unknown`, a non-null `!`), tests included? One entry per api feature and per route.
9. `same-job-same-way`: where two routes or two features do the same job, do they do it the same way? One entry per job: the shape a list hook returns, how a list refreshes after a change, how a missing id becomes an api error, how a form shows a validation error, how application functions are named against their procedures.
10. `derived-not-stored`: is each value that follows from other data computed during render, with no extra state or effect? One entry per route.
11. `tokens-only`: does each component style with theme-scale Tailwind classes and `@repo/ui` tokens only, with no arbitrary value, inline style or style that restyles a `@repo/ui` primitive? One entry per route.
12. `behaviour-has-e2e`: does the app's own `web/e2e/` folder hold a spec for each of these behaviours: add a todo, toggle, delete, clear completed, the summary line, add a tag, a blank tag name, an existing tag name, delete a tag? One entry per behaviour the app has.

Give your answer as one JSON object and nothing more:

```json
{
  "answers": [
    { "question": "one-status", "item": "useTodos", "answer": "yes", "file": "showcase/{{ID}}/web/src/routes/todos/useTodos.ts", "line": 12, "note": "One short sentence." }
  ]
}
```

Set `line` to `null` when an answer is about a whole file. Write each note in one short sentence of standard English.
