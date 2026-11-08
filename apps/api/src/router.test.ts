import { appRouter } from './router.ts';
import { createCallerFactory } from './trpc.ts';

it('serves the to-do feature under todos', async () => {
  const caller = createCallerFactory(appRouter)({});

  const added = await caller.todos.add({ title: 'Read the review' });

  await expect(caller.todos.list()).resolves.toEqual([added]);
});
