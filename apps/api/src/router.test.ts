import { appRouter, createAppRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the greeting feature under greeting.greet', async () => {
  const caller = createCallerFactory(appRouter)({});

  await expect(caller.greeting.greet({ name: 'Ada' })).resolves.toEqual({ message: 'Hello, Ada!' });
});

it('serves the recent greetings feature under recentGreetings', async () => {
  const caller = createCallerFactory(appRouter)({});
  await caller.recentGreetings.record({ name: 'Lin' });
  await expect(caller.recentGreetings.list()).resolves.toEqual({ names: ['Lin'] });
});

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
