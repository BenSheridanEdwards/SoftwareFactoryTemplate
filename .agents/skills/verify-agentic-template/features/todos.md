# To-dos

The page keeps a list of to-dos through the api. `Buy   milk` is added as
`Buy milk` at the end of the list; a blank title shows the `Enter a title` alert
and a 101-character title shows `Use 100 characters or fewer`, both without a
request. Each to-do can be marked done, edited and deleted, the list filters by
All, Active or Done, and Clear done removes the done ones. A failed add shows
`Could not add the to-do` and keeps the typed title.
[`docs/prd/todos.md`](../../../../docs/prd/todos.md) lists every promise.

## Sub-features

- `todos` opens the page, rejects a blank title, adds one through
  `POST /trpc/todos.add`, marks it done and deletes it.
- `todos-validation` uses the form's Effect schema to stop blank and over-long titles before a request.
- `todos-error` shows the add error and keeps the typed title when the api fails.

## How to get to it (user POV)

- Open `/`. The `To-dos` heading sits above a card with `Title`, `Add`, the
  `Filter` buttons, `Clear done` and the list.
- Type a title and press `Add` or Enter.

## Driving it with verify.mjs

Require a passing `doctor`, including `to-do api answers through /trpc`.

- Run `node $V drive todos --run <id>`. Every step prints `PASS`; the last line reads `PASS journey=todos`.
- Press `Add` with an empty field. The alert reads `Enter a title`; no `todos.add` request leaves.
- The add step types the title with extra spaces; the checkbox is named by the
  normalised title, and `manifest.json` lists one `/trpc/todos.add` response with status 200.
- Run `node $V drive todos-validation --run <id>`: spaces show `Enter a title`
  and set `aria-invalid="true"`; 101 characters show `Use 100 characters or fewer`.
- Run `node $V drive todos-error --run <id>`: answer `**/trpc/todos.add**` with 500
  and check the `Could not add the to-do` alert and the kept title.

## Gotchas

- The list lives in the api process the run launched, so journeys add their own
  titles and leave other to-dos alone.
- Queries have no retries and no refetch on focus, so request errors show at once.
- tRPC batches calls: `/trpc/todos.list?batch=1&input=...`.
