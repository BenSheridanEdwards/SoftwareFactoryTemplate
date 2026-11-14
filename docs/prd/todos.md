# To-dos

- **Result:** the reference result, `apps/`
- **Decision:** [ADR 0123](../../.agents/decisions/0123-a-to-do-app-is-the-reference-feature.md)
- **Covers:** `apps/web/src/routes/todos/**`, `apps/api/src/features/todos/**`
- Propose a behaviour or intent change with the [PRD change issue form](../../.github/ISSUE_TEMPLATE/prd-change.yml) (open it from **Issues → New issue → PRD change**).

## Intent

A visitor keeps a short list of things to do: they add a to-do, mark it done
or active again, edit its title, delete it, filter the list and clear the done
to-dos. The api keeps the list in memory, so it empties when the api restarts.

## Words and rules

- A **to-do** has an `id` (a string the api makes up), a `title` and a `done`
  flag. A to-do that is not done is **active**.
- A **title is normalised** by trimming whitespace from both ends and turning
  each run of whitespace inside it (spaces, tabs, line breaks, non-breaking
  spaces) into one space. `  Buy   milk  ` becomes `Buy milk`.
- A **valid title** is a normalised title of 1 to 100 characters, counted as
  JavaScript's `length` counts them. A title of exactly 100 characters is
  valid. A blank title gets the message `Enter a title`. A title over 100
  characters gets the message `Use 100 characters or fewer`.
- The api owns these rules and applies them to every title it receives, from
  any client. The page applies the same rules before it sends a title, sends
  the normalised title, and shows the message under the field instead of
  sending anything when the title is invalid.
- The list is in the order the to-dos were added, oldest first. Marking a
  to-do done or active, and editing its title, keeps its place.
- A **change** is an add, a mark done or active, an edit, a delete or a clear
  done. After a change succeeds, the page re-reads the list from the api and
  shows the result. The page shows nothing of a change before the api has
  answered and the list has been re-read. A re-read that fails counts as a
  failed list load.

## The page

From top to bottom, the page at `/todos` shows:

1. A level-one heading `To-dos`.
2. The add form: a text field labelled `Title` and a button `Add`.
3. The failure message for the latest failed change, when there is one, as
   an alert. A title message sits under the `Title` field, before `Add`.
4. Before the list first arrives, the status `Loading to-dos…`. If the list
   fails to load, when the page opens or on a re-read after a change, the
   alert `Could not load the to-dos` takes its place, and the page shows none
   of the parts below until a later read succeeds.
5. Once the list has loaded, a group named `Filter` with three buttons, `All`,
   `Active` and `Done`, each with `aria-pressed` set to show which one is
   selected, and a button `Clear done`. The group's name comes from its
   `aria-label`; it holds no text besides the three button labels. The
   selected filter also looks selected: its border and text take the
   `@repo/ui` focus colour (`border-focus text-focus`, the `--color-focus`
   token), and the other two keep the standard button colours.
6. The to-dos the selected filter matches, as a list named `To-dos`. When the
   filter matches none, the text `No to-dos to show` replaces the list.

Each to-do in the list shows a checkbox whose label is the to-do's title, so
selecting the title also marks the to-do. The checkbox is checked when the
to-do is done, and a done to-do's title is struck through: the element that
holds the title text has `line-through`. Beside the title
sit a button that reads `Edit` and is named `Edit <title>`, and a button that
reads `Delete` and is named `Delete <title>`.

While a to-do is being edited, its row shows a text field labelled
`New title`, filled with the current title, and the buttons `Save` and
`Cancel` in place of its checkbox, title and buttons. One to-do is edited at a
time.

These are the only parts of the page. Its `main` landmark holds them directly,
with no other landmark, region, heading or text around or between them.

## The api

The router key is `todos`. Each procedure's input and output is JSON over the
reference's tRPC transport at `/trpc`.

| Procedure | Kind | Input | Output |
| --- | --- | --- | --- |
| `todos.list` | query | none | every to-do, oldest first |
| `todos.add` | mutation | `{ title }` | the new to-do, with `done: false` |
| `todos.setDone` | mutation | `{ id, done }` | the updated to-do |
| `todos.rename` | mutation | `{ id, title }` | the updated to-do |
| `todos.delete` | mutation | `{ id }` | `{ id }` of the deleted to-do |
| `todos.clearDone` | mutation | none | `{ ids }` of the deleted to-dos, oldest first |

An invalid title gets a `400` with the `BAD_REQUEST` code and the title
message as the error message, and `todos.rename` checks the title before it
looks for the id. An id that names no to-do gets a `404` with the
`NOT_FOUND` code and the message `No to-do has that id`.

## Behaviours

- **Says so when the list fails to load.** A failed `todos.list` shows the
  alert `Could not load the to-dos`, and the page shows no filters, no Clear
  done and no list. The add form stays.
  - Proved by [says so when the list fails to load](../../apps/web/e2e/todos.spec.ts)

- **Marks a to-do done and active again, in place.** Selecting the checkbox,
  or the title, marks the to-do done: it is checked and struck through.
  Selecting it again makes it active. The to-do keeps its place.
  - Proved by [marks a to-do done and active again in place](../../apps/web/e2e/todos.spec.ts)

- **Edits a title in place, normalised.** Edit opens `New title` filled with
  the title. Save stores the normalised title, closes the edit and shows the
  new title in the same place.
  - Proved by [edits a title in place and normalises it](../../apps/web/e2e/todos.spec.ts)

- **Deletes a to-do at once.** Delete removes the to-do without asking, and
  the others keep their order.
  - Proved by [deletes a to-do at once](../../apps/web/e2e/todos.spec.ts)

- **Clears every done to-do, whatever the filter, and only while one is done.**
  `Clear done` deletes all done to-dos, including ones the filter hides, keeps
  the active ones and the filter, and is then disabled. With only active
  to-dos it is disabled and does nothing; marking one done enables it.
  - Proved by [clears every done to-do whatever the filter](../../apps/web/e2e/todos.spec.ts)
  - Proved by [enables Clear done only while a to-do is done](../../apps/web/e2e/todos.spec.ts)

- **Keeps the done to-dos and says so when clearing fails.** A failed
  `todos.clearDone` shows `Could not clear the done to-dos`, and every to-do
  stays.
  - Proved by [keeps the done to-dos and says so when clearing fails](../../apps/web/e2e/todos.spec.ts)

- **Shows only the latest failure, until the next change starts.** A second
  failed change replaces the first message, and starting any change removes
  it.
  - Proved by [shows only the latest failure and clears it when the next change starts](../../apps/web/e2e/todos.spec.ts)

- **Says so when the list fails to load after a change.** When a change
  succeeds but the re-read of the list fails, the page shows the alert
  `Could not load the to-dos` and no filters, Clear done or list, as when the
  first read fails. The api keeps the change, and a successful add still
  empties the field. The next change re-reads the list and, when that read
  succeeds, shows it again with no alert.
  - Proved by [says so when the list fails to load after a change](../../apps/web/e2e/todos.spec.ts)

- **Reads the list when the page opens and after each successful change.**
  Returning to the tab, coming back online and a failed change read nothing.
  - Proved by [reads the list only when the page opens and after a successful change](../../apps/web/e2e/todos.spec.ts)

- **Shows loading until the list arrives.** The page announces `Loading to-dos…` while waiting for the list.
  - Proved by [shows loading until the list arrives](../../apps/web/e2e/todos.spec.ts)

- **Loads an empty list and adds a normalised title.** The page starts empty; adding `  Buy   milk  ` shows `Buy milk`.
  - Proved by [loads an empty list then adds a normalised title](../../apps/web/e2e/todos.spec.ts)

- **Rejects blank and too-long titles.** Invalid titles show the validation message.
  - Proved by [rejects blank and too-long titles](../../apps/web/e2e/todos.spec.ts)

- **Filters to active or done to-dos and back to all.** The selected filter limits the visible list.
  - Proved by [filters to active or done to-dos and back to all](../../apps/web/e2e/todos.spec.ts)

- **Hides a newly done to-do from Active.** Marking it done removes it from the Active view.
  - Proved by [hides a to-do from the Active filter once it is marked done](../../apps/web/e2e/todos.spec.ts)

- **Shows an empty message for an unmatched filter.** The page says `No to-dos to show`.
  - Proved by [shows the empty message when a filter matches nothing](../../apps/web/e2e/todos.spec.ts)

- **Passes the automated accessibility scan.** Empty and populated lists pass the axe WCAG checks in Chromium.
  - Proved by [empty and populated to-dos have no detectable WCAG violations](../../apps/web/e2e/accessibility.spec.ts)
