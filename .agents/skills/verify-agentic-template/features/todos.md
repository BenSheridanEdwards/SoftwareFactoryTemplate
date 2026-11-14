# To-dos

At `/`, add a normalised title, mark it done and delete it through the api.

## Sub-features

- `todos` proves blank-title validation, add, mark done and delete.

## How to get to it (user POV)

Open `/`, enter a `Title` and press `Add`.

## Driving it with verify.mjs

Run `node $V drive todos --run <id>` after a passing doctor.
The blank title sends no add request; the normalised title appears as a checkbox.

## Gotchas

Each journey uses a unique title and deletes its own item.
