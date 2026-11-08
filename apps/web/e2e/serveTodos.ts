import type { Page } from '@playwright/test';

/** Two to-dos, one active and one done, for specs that only read the list. */
export const SAMPLE_TODOS = [
  { id: 'sample-1', title: 'Write the talk', done: false },
  { id: 'sample-2', title: 'Book the room', done: true },
] as const;

/**
 * Answers the page's `todos.list` call with `todos` instead of the api. The
 * api's list is shared by every spec, so specs that only read it serve their
 * own and leave the real list to `todos.spec.ts`.
 */
export async function serveTodos(
  page: Page,
  todos: readonly { id: string; title: string; done: boolean }[],
) {
  await page.route(
    (url) => url.pathname === '/trpc/todos.list',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ result: { data: todos } }]),
      }),
  );
}
