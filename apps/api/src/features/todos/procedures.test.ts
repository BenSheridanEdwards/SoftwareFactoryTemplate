import { TRPCError } from '@trpc/server';
import { createCallerFactory } from '../../trpc.ts';
import { createTodosRouter } from './procedures.ts';

const caller = createCallerFactory(createTodosRouter())({});

it('adds a to-do with a normalised title and lists it', async () => {
  const added = await caller.add({ title: '  Buy   milk ' });

  expect(added).toEqual({ id: expect.any(String), title: 'Buy milk', done: false });
  await expect(caller.list()).resolves.toContainEqual(added);
});

it('marks, renames and deletes a to-do', async () => {
  const { id } = await caller.add({ title: 'Book the room' });

  await expect(caller.setDone({ id, done: true })).resolves.toMatchObject({ done: true });
  await expect(caller.rename({ id, title: 'Book  a room' })).resolves.toEqual({
    id,
    title: 'Book a room',
    done: true,
  });
  await expect(caller.clearDone()).resolves.toEqual({ ids: expect.arrayContaining([id]) });
  await expect(caller.delete({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('deletes a to-do and returns its id', async () => {
  const { id } = await caller.add({ title: 'Delete me' });

  await expect(caller.delete({ id })).resolves.toEqual({ id });
});

it.each([
  ['', 'Enter a title'],
  ['e'.repeat(101), 'Use 100 characters or fewer'],
])('rejects the title %j as a bad request', async (title, message) => {
  await expect(caller.add({ title })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'BAD_REQUEST',
    message,
  });
});

it('answers not found for an unknown id', async () => {
  await expect(caller.setDone({ id: 'missing', done: true })).rejects.toMatchObject({
    constructor: TRPCError,
    code: 'NOT_FOUND',
    message: 'No to-do has that id',
  });
});
