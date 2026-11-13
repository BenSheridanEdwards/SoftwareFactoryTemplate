import { createTRPCUntypedClient } from '@trpc/client';
import { handlerLink } from './testApiHandlers';

it('passes undefined to a procedure with no input', async () => {
  const list = jest.fn(() => [{ id: '1', title: 'Read the review', done: false }]);
  const handlers = {
    'greeting.greet': ({ name }: { name: string }) => ({ message: `Hi ${name}` }),
    'todos.list': list,
  };
  const client = createTRPCUntypedClient({ links: [handlerLink(handlers)] });

  await expect(client.query('todos.list')).resolves.toEqual([
    { id: '1', title: 'Read the review', done: false },
  ]);
  expect(list).toHaveBeenCalledWith(undefined);
});

it('passes a different procedure input through unchanged', async () => {
  const input = { id: '7', done: true };
  const update = jest.fn((request: typeof input) => ({ ...request, title: 'Read the review' }));
  const handlers = {
    'greeting.greet': ({ name }: { name: string }) => ({ message: `Hi ${name}` }),
    'todos.setDone': update,
  };
  const client = createTRPCUntypedClient({ links: [handlerLink(handlers)] });

  await expect(client.mutation('todos.setDone', input)).resolves.toEqual({
    id: '7',
    done: true,
    title: 'Read the review',
  });
  expect(update.mock.calls[0]?.[0]).toBe(input);
});
