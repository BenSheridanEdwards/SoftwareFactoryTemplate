import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

it('loads the empty list', async () => {
  render(
    <TestApiProvider>
      <TodosPage />
    </TestApiProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading to-dos');
  expect(await screen.findByText('No to-dos to show')).toBeVisible();
});
it('loads seeded titles and adds a normalised title', async () => {
  render(
    <TestApiProvider
      seed={async (api) => {
        await api.todos.add.mutate({ title: 'First' });
      }}
    >
      <TodosPage />
    </TestApiProvider>,
  );
  expect(await screen.findByText('First')).toBeVisible();
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Title' }), ' Buy  milk ');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByText('Buy milk')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
});
it.each([
  ['   ', 'Enter a title'],
  ['x'.repeat(101), 'Use 100 characters or fewer'],
])('rejects %j', async (title, message) => {
  render(
    <TestApiProvider>
      <TodosPage />
    </TestApiProvider>,
  );
  await screen.findByText('No to-dos to show');
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});
it('keeps the title when adding fails', async () => {
  render(
    <TestApiProvider handlers={{ 'todos.add': () => Promise.reject(new Error('api down')) }}>
      <TodosPage />
    </TestApiProvider>,
  );
  await screen.findByText('No to-dos to show');
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Call Ada');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the to-do');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Call Ada');
});

it('ignores a second submit while adding and enables Add after completion', async () => {
  const release = { resolve: (): void => undefined };
  const pending = new Promise<void>((resolve) => {
    release.resolve = resolve;
  });
  const add = jest.fn<
    ReturnType<NonNullable<TestApiHandlers['todos.add']>>,
    Parameters<NonNullable<TestApiHandlers['todos.add']>>
  >(async (input, serve) => {
    await pending;
    return serve(input);
  });
  render(
    <TestApiProvider handlers={{ 'todos.add': add }}>
      <TodosPage />
    </TestApiProvider>,
  );
  await screen.findByText('No to-dos to show');
  const user = userEvent.setup();
  const title = screen.getByRole('textbox', { name: 'Title' });
  const button = screen.getByRole('button', { name: 'Add' });
  await user.type(title, 'Buy milk');
  const form = title.closest('form');
  if (!form) {
    throw new Error('Title must belong to the add form');
  }
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
  expect(add).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  await act(async () => release.resolve());
  expect(await screen.findByText('Buy milk')).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  await waitFor(() => expect(button).toBeEnabled());
});
