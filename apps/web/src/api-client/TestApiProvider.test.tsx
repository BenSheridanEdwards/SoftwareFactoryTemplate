import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { TestApiProvider } from './TestApiProvider';
import { useTrpc } from './trpc';

function TodosProbe() {
  const trpc = useTrpc();
  const query = useQuery(trpc.todos.list.queryOptions());
  const titles = query.data?.map(({ title }) => title).join(', ');
  return <p>{query.error?.message ?? (titles === '' ? 'No to-dos' : titles) ?? 'Waiting'}</p>;
}

it('answers a procedure from its handler', async () => {
  render(
    <TestApiProvider
      handlers={{ 'todos.list': () => [{ id: '1', title: 'Read the review', done: false }] }}
    >
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Read the review')).toBeInTheDocument();
});

it('answers a procedure with no handler from the real router, seeded first', async () => {
  render(
    <TestApiProvider
      seed={async (api) => {
        await api.todos.add.mutate({ title: '  Read   the review ' });
      }}
    >
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Read the review')).toBeInTheDocument();
});

it('gives each render a new router with an empty list', async () => {
  const first = render(
    <TestApiProvider
      seed={async (api) => {
        await api.todos.add.mutate({ title: 'Read the review' });
      }}
    >
      <TodosProbe />
    </TestApiProvider>,
  );
  await screen.findByText('Read the review');
  first.unmount();

  render(
    <TestApiProvider>
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('No to-dos')).toBeInTheDocument();
});

it('lets a handler pass the input on to the real router', async () => {
  render(
    <TestApiProvider
      seed={async (api) => {
        await api.todos.add.mutate({ title: 'Read the review' });
      }}
      handlers={{
        'todos.list': async (input, serve) => [
          ...(await serve(input)),
          { id: 'extra', title: 'Added by the handler', done: false },
        ],
      }}
    >
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Read the review, Added by the handler')).toBeInTheDocument();
});

it("fails each call with the router's error when seeding fails", async () => {
  render(
    <TestApiProvider
      seed={async (api) => {
        await api.todos.add.mutate({ title: '   ' });
      }}
    >
      <TodosProbe />
    </TestApiProvider>,
  );

  expect(await screen.findByText('Enter a title')).toBeInTheDocument();
});
