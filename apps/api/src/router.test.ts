import { appRouter, createAppRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the to-do feature under todos', async () => {
  const caller = createCallerFactory(appRouter)({});

  const added = await caller.todos.add({ title: 'Read the review' });

  await expect(caller.todos.list()).resolves.toEqual([added]);
});

it('builds each app router over its own empty to-do list', async () => {
  const first = createCallerFactory(createAppRouter())({});
  const second = createCallerFactory(createAppRouter())({});

  const added = await first.todos.add({ title: 'Read the review' });

  await expect(first.todos.list()).resolves.toEqual([added]);
  await expect(second.todos.list()).resolves.toEqual([]);
});

it('serves only the to-do feature', () => {
  expect(new Set(Object.keys(appRouter._def.procedures))).toEqual(
    new Set([
      'todos.add',
      'todos.clearDone',
      'todos.delete',
      'todos.list',
      'todos.rename',
      'todos.setDone',
    ]),
  );
});
