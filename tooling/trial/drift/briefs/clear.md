Add "clear completed" to the todos.

### Public API

Add `todos.clearCompleted` to the `todos` router. It is a mutation with no input. It removes every completed todo and returns `{ ids: string[] }`, the ids it removed. It returns `{ ids: [] }` when no todo is completed. The other `todos` procedures and the `tags` procedures stay exactly as they are.

### The page

- A button named `Clear completed` in the todos part of the page.
- The button is disabled while no todo is completed.
- It removes every completed todo from the list and keeps the others.
- When the call fails, the page shows an alert.
