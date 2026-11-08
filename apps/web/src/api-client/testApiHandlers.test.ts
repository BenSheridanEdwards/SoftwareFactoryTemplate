import type { AppRouter } from '@repo/api';
import { createTRPCUntypedClient, type TRPCUntypedClient, unstable_localLink } from '@trpc/client';
import { handlerLink, serveThrough, type TestApiHandlers } from './testApiHandlers';
import { createTestAppRouter } from './testAppRouter';

const routerClient = (): TRPCUntypedClient<AppRouter> =>
  createTRPCUntypedClient({
    links: [unstable_localLink({ router: createTestAppRouter(), createContext: async () => ({}) })],
  });

const serveNothing = () => Promise.reject(new Error('the real router was not asked'));

it('passes undefined to a procedure with no input', async () => {
  const list = jest.fn(() => [{ id: '1', title: 'Read the review', done: false }]);
  const handlers: TestApiHandlers = { 'todos.list': list };
  const client = createTRPCUntypedClient({ links: [handlerLink(handlers, serveNothing)] });

  await expect(client.query('todos.list')).resolves.toEqual([
    { id: '1', title: 'Read the review', done: false },
  ]);
  expect(list).toHaveBeenCalledWith(undefined, expect.any(Function));
});

it('passes a different procedure input through unchanged', async () => {
  const input = { id: '7', done: true };
  const setDone = jest.fn((request: typeof input) => ({ ...request, title: 'Read the review' }));
  const handlers: TestApiHandlers = { 'todos.list': () => [], 'todos.setDone': setDone };
  const client = createTRPCUntypedClient({ links: [handlerLink(handlers, serveNothing)] });

  await expect(client.mutation('todos.setDone', input)).resolves.toEqual({
    id: '7',
    done: true,
    title: 'Read the review',
  });
  expect(setDone.mock.calls[0]?.[0]).toBe(input);
});

it('serves a call with no handler, and a handler that passes it on, from the router', async () => {
  const serve = serveThrough(routerClient(), Promise.resolve());
  const handlers: TestApiHandlers = {
    'todos.add': (input, next) => next({ title: `${input.title}!` }),
  };
  const client = createTRPCUntypedClient({ links: [handlerLink(handlers, serve)] });

  await client.mutation('todos.add', { title: 'Read the review' });

  await expect(client.query('todos.list')).resolves.toEqual([
    { id: expect.any(String), title: 'Read the review!', done: false },
  ]);
});

it('waits for the seed before it serves a call', async () => {
  const router = routerClient();
  const seeded = router.mutation('todos.add', { title: 'Seeded first' }).then(() => undefined);
  const client = createTRPCUntypedClient({
    links: [handlerLink({}, serveThrough(router, seeded))],
  });

  await expect(client.query('todos.list')).resolves.toEqual([
    { id: expect.any(String), title: 'Seeded first', done: false },
  ]);
});

it('rejects a subscription, which the router does not serve', async () => {
  const serve = serveThrough(routerClient(), Promise.resolve());

  await expect(
    serve({ type: 'subscription', path: 'todos.list', input: undefined }),
  ).rejects.toThrow(
    'TestApiProvider serves queries and mutations, not the subscription todos.list',
  );
});
