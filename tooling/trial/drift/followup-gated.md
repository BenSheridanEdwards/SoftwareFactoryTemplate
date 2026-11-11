Think clearly and speak in standard English. Let everything follow from that: implement the code that this codebase wants, based on its lint rules.

# Change {{STEP}} to the app in showcase/{{ID}}/

`showcase/{{ID}}/` holds an app that other engineers built in this repository. You make one change to it. Work alone in this one session. Nobody will answer a question or correct you, so make every decision from the repository's own docs, its checks and the code that is already there, and repair your own mistakes until the checks pass.

## How to build it

Make the change in a simple, production-level way. Make sensible decisions. Do not overcomplicate. Make no fancy UI.

- Read the code in `showcase/{{ID}}/` first. Do the same job the same way the app already does it.
- Keep every behaviour the app already has.
- Sort your imports.
- Keep code next to the code that uses it.
- Keep each data layer inside its boundary. Import only in the directions that `.agents/project/ARCHITECTURE.md` permits.
- Use the global primitives from `@repo/ui`.
- Keep state thin. Put it in custom `use*` hooks.
- Use React Hook Form for forms and React Query (TanStack Query) for server state.
- Style with Tailwind. Use only scalable Tailwind values: the theme scale and the shared `@theme` tokens in `packages/ui`. Use no arbitrary values, no inline `style` props and no one-off CSS values.
- You have 100 turns maximum. Finish the work, with every check passing, inside this limit.

The judging question is: would you want this code as your codebase?

## The change

{{BRIEF}}

## Where it goes

- Read only inside this clone. Write only inside `showcase/{{ID}}/`. Leave every other file as it is, `pnpm-lock.yaml` included.
- Use only dependencies that the app's two packages already declare.
- Put Playwright specs for the new behaviour in `showcase/{{ID}}/web/e2e/`.
- The fixed acceptance test `tooling/trial/acceptance/todo.spec.ts` still drives the page. Keep it passing.
- Add no tool config, no symlink and no suppression directive.
- Regenerate the files the gates ask for: `pnpm arch:diagram` writes `showcase/{{ID}}/architecture.mmd`, and `pnpm api:report` writes the reports in `etc/`.

## Done

Run `node tooling/trial/check-scope.mjs --id {{ID}}` after the checks below. Fix every reported path before finishing.

Done means `pnpm verify` and `pnpm e2e` pass with every gate as it is, per `.agents/project/PR_QUALITY.md`. Run them, fix what they report, and run them again until they pass. Leave your work uncommitted. The harness commits it when you finish.

## Shared machine

Never use `pkill -f`, `killall` or any kill-by-pattern: this machine is shared.
Stop only processes you started, by PID. Never set git `user.name` or
`user.email` in any git config. Do not push.
