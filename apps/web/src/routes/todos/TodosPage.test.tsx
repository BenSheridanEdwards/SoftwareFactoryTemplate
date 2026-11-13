import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '../../api-client';
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
