import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MatchersV3, PactV4 } from '@pact-foundation/pact';
import { createTrpcClient } from './trpc';

const directory = process.env.PACT_DIR ?? join(tmpdir(), 'art-pact');
const pact = new PactV4({ consumer: 'web', provider: 'api', dir: directory });

// Pact merges into an existing file, so a renamed interaction would linger.
beforeAll(() => rmSync(join(directory, 'web-api.json'), { force: true }));

it('todos.add returns the batch response the web consumes', async () => {
  const { like } = MatchersV3;
  await pact
    .addInteraction()
    .uponReceiving('todos.add for Read the review')
    .withRequest('POST', '/trpc/todos.add', (request) => {
      request.query({ batch: '1' }).jsonBody({ 0: { title: 'Read the review' } });
    })
    .willRespondWith(200, (response) => {
      response.jsonBody([
        { result: { data: { id: like('a-to-do-id'), title: 'Read the review', done: false } } },
      ]);
    })
    .executeTest(async (server) => {
      await expect(
        createTrpcClient(`${server.url}/trpc`).todos.add.mutate({ title: 'Read the review' }),
      ).resolves.toEqual({ id: 'a-to-do-id', title: 'Read the review', done: false });
    });
});

it('todos.add rejects a blank title with the tRPC error envelope', async () => {
  const { like } = MatchersV3;
  await pact
    .addInteraction()
    .uponReceiving('todos.add with a blank title')
    .withRequest('POST', '/trpc/todos.add', (request) => {
      request.query({ batch: '1' }).jsonBody({ 0: { title: '   ' } });
    })
    .willRespondWith(400, (response) => {
      response.jsonBody([
        {
          error: {
            message: 'Enter a title',
            code: -32600,
            data: {
              code: 'BAD_REQUEST',
              httpStatus: 400,
              stack: like('Error'),
              path: 'todos.add',
            },
          },
        },
      ]);
    })
    .executeTest(async (server) => {
      await expect(
        createTrpcClient(`${server.url}/trpc`).todos.add.mutate({ title: '   ' }),
      ).rejects.toMatchObject({ message: 'Enter a title', data: { code: 'BAD_REQUEST' } });
    });
});
