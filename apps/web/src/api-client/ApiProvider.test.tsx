import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiProvider } from './ApiProvider';
import { useTrpc } from './trpc';

function TodosProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todos.list.queryOptions());
  return <p>{query.data?.map(({ title }) => title).join(', ') ?? 'waiting'}</p>;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

it('sends procedure calls to /trpc on the same origin and reads the answer', async () => {
  // jsdom omits Response; use Node's native implementation from its own realm.
  const NodeResponse: typeof Response = jest.requireActual('node:vm').runInThisContext('Response');
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async () =>
      new NodeResponse(
        JSON.stringify([
          { result: { data: [{ id: '1', title: 'Read the review', done: false }] } },
        ]),
        {
          headers: { 'content-type': 'application/json' },
        },
      ),
  );
  globalThis.fetch = fetchMock;

  render(
    <ApiProvider>
      <TodosProbe />
    </ApiProvider>,
  );

  expect(await screen.findByText('Read the review')).toBeInTheDocument();
  const [url] = fetchMock.mock.calls[0] ?? [''];
  expect(String(url)).toMatch(/^\/trpc\/todos\.list\?batch=1&input=/);
});
