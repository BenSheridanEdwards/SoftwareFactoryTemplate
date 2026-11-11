Add tags to the app. A tag has exactly two fields, `id` and `name`. Tags are independent of todos.

### Public API

Add a new api feature beside `todos`, and mount exactly these procedures under the `tags` router key.

| Procedure | Kind | Input | Output |
| --- | --- | --- | --- |
| tags.list | query | none | array of `{ id: string, name: string }`, in creation order |
| tags.create | mutation | `{ name: string }` | the stored `{ id: string, name: string }` |
| tags.delete | mutation | `{ id: string }` | `{ id: string }`, the deleted id |

`create` trims the name. It rejects a blank name as `BAD_REQUEST`. It rejects a name that a stored tag already has, compared without regard to letter case, as `CONFLICT`. `delete` rejects an unknown id as `NOT_FOUND`. The api keeps the tags in memory, inside the api process. The `todos` procedures stay exactly as they are.

### The page

Add a new route beside the todos route, and show it on the same page, below the todos.

- A section, with the role `region` and the name `Tags`, holds everything in this list.
- A text field labelled `Tag name` and a button named `Add tag` create a tag.
- Submitting a blank name adds nothing and shows an alert.
- Submitting a name that exists adds nothing and shows an alert with the text `That tag exists`.
- The tags appear in a list named `Tags`. Each item shows the tag's name and has a button named `Delete tag <name>`, which deletes it.
- Tags survive a page reload while the api runs.
