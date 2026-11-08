# To-dos

- **Result:** the reference result, `apps/`
- **Decision:** [ADR 0123](../../.agents/decisions/0123-a-to-do-app-is-the-reference-feature.md)
- **Covers:** `apps/web/src/routes/todos/**`, `apps/api/src/features/todos/**`
- Propose a behaviour or intent change with the [PRD change issue form](../../.github/ISSUE_TEMPLATE/prd-change.yml) (open it from **Issues → New issue → PRD change**).

## Intent

A visitor keeps a short list of things to do: they add a to-do, mark it done
or active again, edit its title, delete it, filter the list and clear the done
to-dos. The api keeps the list in memory, so it empties when the api restarts.

The to-do app is the reference feature. It crosses the web page, the tRPC
contract and every api layer, so each gate in the repo has real code to check:
title rules and state changes in the api domain, storage in integrations,
forms and server state in the route's hooks, and Tailwind on the `@repo/ui`
tokens. This PRD specifies every detail a visitor or an api client can see,
and each detail has an E2E test. A rebuild from this page alone behaves the
same as the original.

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
  answered and the list has been re-read.

## The page

From top to bottom, the page at `/` shows:

1. A level-one heading `To-dos`.
2. The add form: a text field labelled `Title` and a button `Add`.
3. The failure message for the latest failed change, when there is one.
4. Before the list first arrives, the status `Loading to-dos…`. If the list
   fails to load, the alert `Could not load the to-dos` takes its place, and
   the page shows none of the parts below.
5. Once the list has loaded, a group named `Filter` with three buttons, `All`,
   `Active` and `Done`, each with `aria-pressed` set to show which one is
   selected, and a button `Clear done`.
6. The to-dos the selected filter matches, as a list named `To-dos`. When the
   filter matches none, the text `No to-dos to show` replaces the list.

Each to-do in the list shows a checkbox whose label is the to-do's title, so
selecting the title also marks the to-do. The checkbox is checked when the
to-do is done, and a done to-do's title is struck through. Beside the title
sit a button that reads `Edit` and is named `Edit <title>`, and a button that
reads `Delete` and is named `Delete <title>`.

While a to-do is being edited, its row shows a text field labelled
`New title`, filled with the current title, and the buttons `Save` and
`Cancel` in place of its checkbox, title and buttons. One to-do is edited at a
time.

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
message as the error message. An id that names no to-do gets a `404` with the
`NOT_FOUND` code and the message `No to-do has that id`.

## Behaviours

- **Shows a loading message until the list arrives.** The page shows the
  status `Loading to-dos…`, and no filters, until `todos.list` answers.
  - Proved by [shows a loading message until the list arrives](../../apps/web/e2e/todos.spec.ts)
- **Starts on the All filter, with an empty message and a disabled Clear done when there are no to-dos.**
  With an empty list, the page shows `No to-dos to show` and no list, `All`
  is pressed, `Active` and `Done` are not, and `Clear done` is disabled.
  - Proved by [starts on the All filter with an empty message when there are no to-dos](../../apps/web/e2e/todos.spec.ts)
- **Says so when the list fails to load.** A failed `todos.list` shows the alert
  `Could not load the to-dos`, and the page shows no filters, no Clear done
  and no list. The add form stays.
  - Proved by [says so when the list fails to load](../../apps/web/e2e/todos.spec.ts)
- **Adds a to-do to the end of the list.** The visitor types a title and
  selects Add. The new to-do appears last, active, and the field empties.
  - Proved by [adds a to-do to the end of the list](../../apps/web/e2e/todos.spec.ts)
- **Stores and shows each title normalised.** Typing `  Buy   milk  ` sends
  `Buy milk`, and the api stores it and the page shows it as `Buy milk`,
  character for character, as the title and the checkbox's name.
  - Proved by [stores and shows a title with its whitespace normalised](../../apps/web/e2e/todos.spec.ts)
- **The api normalises every title it receives.** A direct call to
  `todos.add` with `  Call \t Ada  ` stores and returns `Call Ada`.
  - Proved by [the api normalises a title from any client](../../apps/web/e2e/todos.spec.ts)
- **Asks for a title and sends nothing when the title is blank.** A blank
  title shows `Enter a title`, marks the field invalid and sends no
  `todos.add` request.
  - Proved by [asks for a title and sends nothing when the title is blank](../../apps/web/e2e/todos.spec.ts)
- **Clears the title message once the title is fixed.** After a rejected
  title, typing a valid one removes the message before the visitor submits.
  - Proved by [clears the title message once the title is fixed](../../apps/web/e2e/todos.spec.ts)
- **Accepts a title of exactly 100 characters, counted after normalising.**
  A 100-character title is added whole, and so is a longer typed title that
  normalises to 100 characters.
  - Proved by [accepts a title of exactly 100 characters after normalising](../../apps/web/e2e/todos.spec.ts)
- **Rejects a title over 100 characters and sends nothing.** A 101-character
  title shows `Use 100 characters or fewer`, marks the field invalid and sends
  no request.
  - Proved by [rejects a title over 100 characters and sends nothing](../../apps/web/e2e/todos.spec.ts)
- **The api rejects an invalid title as a bad request.** A direct `todos.add`
  or `todos.rename` with a blank or 101-character title gets a `400`, the
  `BAD_REQUEST` code and the title message.
  - Proved by [the api rejects a blank or over-long title as a bad request](../../apps/web/e2e/todos.spec.ts)
- **The api answers not found for an unknown id.** `todos.setDone`,
  `todos.rename` and `todos.delete` with an id that names no to-do get a
  `404`, the `NOT_FOUND` code and `No to-do has that id`.
  - Proved by [the api answers not found for an unknown to-do](../../apps/web/e2e/todos.spec.ts)
- **The api lists to-dos oldest first.** `todos.list` returns the to-dos in
  the order they were added.
  - Proved by [the api lists to-dos oldest first](../../apps/web/e2e/todos.spec.ts)
- **Shows an add only once the api has answered and the list is re-read.**
  While `todos.add` waits, and then while the list is re-read, `Add` is
  disabled, the field keeps the typed title and the list is unchanged. Then
  the to-do appears, the field empties and `Add` is enabled again. The page
  re-reads the list once.
  - Proved by [shows an add only once the api has answered and the list is re-read](../../apps/web/e2e/todos.spec.ts)
- **Keeps the typed title and says so when adding fails.** A failed
  `todos.add` shows `Could not add the to-do`, leaves the field holding the
  title exactly as typed, and leaves the list unchanged.
  - Proved by [keeps the typed title and says so when adding fails](../../apps/web/e2e/todos.spec.ts)
- **Marks a to-do done and active again, in place.** Selecting the checkbox,
  or the title, marks the to-do done: it is checked and struck through.
  Selecting it again makes it active. The to-do keeps its place.
  - Proved by [marks a to-do done and active again in place](../../apps/web/e2e/todos.spec.ts)
- **Disables every change control while a change waits.** While any change
  waits for the api and the list re-read, `Add`, every checkbox, `Edit`,
  `Delete`, `Save`, `Cancel` and `Clear done` are disabled, and the changed
  to-do shows its old state. The filters and the text fields stay usable.
  - Proved by [disables every change control while a change waits](../../apps/web/e2e/todos.spec.ts)
- **Leaves the to-do unchanged and says so when marking it fails.** A failed
  `todos.setDone` shows `Could not update the to-do`, and the to-do keeps its
  old state.
  - Proved by [leaves the to-do unchanged and says so when marking it fails](../../apps/web/e2e/todos.spec.ts)
- **Edits a title in place, normalised.** Edit opens `New title` filled with
  the title. Save stores the normalised title, closes the edit and shows the
  new title in the same place.
  - Proved by [edits a title in place and normalises it](../../apps/web/e2e/todos.spec.ts)
- **Cancels an edit without saving.** Cancel closes the edit, shows the old
  title and sends no `todos.rename` request.
  - Proved by [cancels an edit without saving](../../apps/web/e2e/todos.spec.ts)
- **Checks an edited title like a new one.** Saving a blank or
  101-character title shows the same message under `New title`, keeps the
  edit open and sends nothing.
  - Proved by [checks an edited title like a new one](../../apps/web/e2e/todos.spec.ts)
- **Edits one to-do at a time.** Opening Edit on a second to-do closes the
  first edit and discards what was typed there.
  - Proved by [edits one to-do at a time](../../apps/web/e2e/todos.spec.ts)
- **Keeps the edit open and says so when saving fails.** A failed
  `todos.rename` shows `Could not save the to-do`, keeps the edit open with
  the typed title, and leaves the stored title unchanged.
  - Proved by [keeps the edit open with the typed title and says so when saving fails](../../apps/web/e2e/todos.spec.ts)
- **Deletes a to-do at once.** Delete removes the to-do without asking, and
  the others keep their order.
  - Proved by [deletes a to-do at once](../../apps/web/e2e/todos.spec.ts)
- **Keeps the to-do and says so when deleting fails.** A failed
  `todos.delete` shows `Could not delete the to-do`, and the to-do stays.
  - Proved by [keeps the to-do and says so when deleting fails](../../apps/web/e2e/todos.spec.ts)
- **Filters to active or done to-dos and back to all.** `Active` shows only
  active to-dos, `Done` only done ones and `All` every to-do, each in list
  order, and the selected button is the pressed one.
  - Proved by [filters to active or done to-dos and back to all](../../apps/web/e2e/todos.spec.ts)
- **Hides a to-do from the Active filter once it is done.** On `Active`,
  marking a to-do done removes it from the list.
  - Proved by [hides a to-do from the Active filter once it is marked done](../../apps/web/e2e/todos.spec.ts)
- **Shows the empty message when a filter matches nothing.** With only
  active to-dos, `Done` shows `No to-dos to show`.
  - Proved by [shows the empty message when a filter matches nothing](../../apps/web/e2e/todos.spec.ts)
- **Returns to the All filter when the page reloads.** The filter lives only
  in the open page.
  - Proved by [returns to the All filter when the page reloads](../../apps/web/e2e/todos.spec.ts)
- **Clears every done to-do, whatever the filter.** `Clear done` deletes all
  done to-dos, including ones the filter hides, keeps the active ones and the
  filter, and is then disabled.
  - Proved by [clears every done to-do whatever the filter](../../apps/web/e2e/todos.spec.ts)
- **Enables Clear done only while a to-do is done.** With only active
  to-dos, `Clear done` is disabled and does nothing. Marking one done enables
  it.
  - Proved by [enables Clear done only while a to-do is done](../../apps/web/e2e/todos.spec.ts)
- **Keeps the done to-dos and says so when clearing fails.** A failed
  `todos.clearDone` shows `Could not clear the done to-dos`, and every to-do
  stays.
  - Proved by [keeps the done to-dos and says so when clearing fails](../../apps/web/e2e/todos.spec.ts)
- **Shows only the latest failure, until the next change starts.** A second
  failed change replaces the first message, and starting any change removes
  it.
  - Proved by [shows only the latest failure and clears it when the next change starts](../../apps/web/e2e/todos.spec.ts)
- **Reads the list when the page opens and after each successful change.**
  Returning to the tab, coming back online and a failed change read nothing.
  - Proved by [reads the list only when the page opens and after a successful change](../../apps/web/e2e/todos.spec.ts)
- **Works for every visitor.** The empty page, a list with an active and a
  done to-do, the validation error and an open edit each pass the WCAG 2.1 A
  and AA rules that axe checks in Chromium.
  - Proved by [the empty to-do page has no detectable WCAG A/AA violations](../../apps/web/e2e/accessibility.spec.ts)
  - Proved by [the to-do list has no detectable WCAG A/AA violations](../../apps/web/e2e/accessibility.spec.ts)
  - Proved by [the validation error state has no detectable WCAG A/AA violations](../../apps/web/e2e/accessibility.spec.ts)
  - Proved by [an open edit has no detectable WCAG A/AA violations](../../apps/web/e2e/accessibility.spec.ts)
