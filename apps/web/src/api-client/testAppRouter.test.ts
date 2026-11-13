import { createTRPCUntypedClient, unstable_localLink } from '@trpc/client';
import { createTestAppRouter } from './testAppRouter';

it('builds a new app router, with its own empty list, on each call', async () => {
  const client = () =>
    createTRPCUntypedClient({
      links: [
        unstable_localLink({ router: createTestAppRouter(), createContext: async () => ({}) }),
      ],
    });
  const first = client();
  await first.mutation('todos.add', { title: 'Read the review' });
  await expect(first.query('todos.list')).resolves.toEqual([
    { id: expect.any(String), title: 'Read the review', done: false },
  ]);
  await expect(client().query('todos.list')).resolves.toEqual([]);
});
it('names the Jest setup when no factory has been served', async () => {
  await jest.isolateModulesAsync(async () => {
    const unserved = await import('./testAppRouter');
    expect(() => unserved.createTestAppRouter()).toThrow(
      'No app router to serve: the web Jest project runs tooling/jest/serve-app-router.ts first.',
    );
    unserved.serveAppRouterInTests(createTestAppRouter);
    expect(unserved.createTestAppRouter()).not.toBe(createTestAppRouter());
  });
});
