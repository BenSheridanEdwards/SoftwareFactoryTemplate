import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ComponentProps } from 'react';
import type { RouterInputs, RouterOutputs } from '../../api-client';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

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

type Seed = NonNullable<ComponentProps<typeof TestApiProvider>['seed']>;

/** Adds each to-do in order through the real router, then marks the done ones. */
function withTodos(...todos: readonly { readonly title: string; readonly done?: true }[]): Seed {
  return async (api) => {
    const added = await todos.reduce(
      async (previous, { title }) => [...(await previous), await api.todos.add.mutate({ title })],
      Promise.resolve<readonly Todo[]>([]),
    );
    await Promise.all(
      added
        .filter((_, index) => todos[index]?.done)
        .map(({ id }) => api.todos.setDone.mutate({ id, done: true })),
    );
  };
}

type TodoProcedure = keyof RouterInputs['todos'];

/** A handler that records each call and answers it from the real router. */
const recorded = <Name extends TodoProcedure>() =>
  jest.fn(
    (
      input: RouterInputs['todos'][Name],
      serve: (input: RouterInputs['todos'][Name]) => Promise<RouterOutputs['todos'][Name]>,
    ) => serve(input),
  );

function renderPage(api: { readonly handlers?: TestApiHandlers; readonly seed?: Seed } = {}) {
  const view = render(
    <TestApiProvider {...api}>
      <TodosPage />
    </TestApiProvider>,
  );
  return { ...view, user: userEvent.setup() };
}

const titles = () =>
  within(screen.getByRole('list', { name: 'To-dos' }))
    .getAllByRole('checkbox')
    .map((box) => box.closest('label')?.textContent);

const failed = () => Promise.reject(new Error('api down'));

it('marks a to-do done and active again, disabling changes while it waits', async () => {
  const held = { release: (): void => undefined };
  const setDone = recorded<'setDone'>().mockImplementationOnce(
    (input, serve) =>
      new Promise((resolve) => {
        held.release = () => resolve(serve(input));
      }),
  );
  const { user } = renderPage({
    seed: withTodos({ title: 'First' }),
    handlers: { 'todos.setDone': setDone },
  });
  const box = await screen.findByRole('checkbox', { name: 'First' });

  await user.click(box);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled());
  expect(screen.getByRole('checkbox', { name: 'First' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Delete First' })).toBeDisabled();
  act(() => held.release());
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'First' })).toBeChecked());
  expect(screen.getByText('First')).toHaveClass('line-through');
  await user.click(screen.getByText('First'));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'First' })).not.toBeChecked());
  expect(setDone).toHaveBeenLastCalledWith(
    { id: expect.any(String), done: false },
    expect.any(Function),
  );
});

it('edits a title, keeps one edit open at a time and cancels without saving', async () => {
  const rename = recorded<'rename'>();
  const { user, container } = renderPage({
    seed: withTodos({ title: 'First' }, { title: 'Second' }),
    handlers: { 'todos.rename': rename },
  });
  await screen.findByRole('list', { name: 'To-dos' });

  await user.click(screen.getByRole('button', { name: 'Edit First' }));
  await user.type(screen.getByRole('textbox', { name: 'New title' }), ' draft');
  await user.click(screen.getByRole('button', { name: 'Edit Second' }));
  expect(screen.getByRole('textbox', { name: 'New title' })).toHaveValue('Second');
  expect(await axe(container)).toHaveNoViolations();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('textbox', { name: 'New title' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Edit First' }));
  await user.clear(screen.getByRole('textbox', { name: 'New title' }));
  await user.type(screen.getByRole('textbox', { name: 'New title' }), ' Buy  bread ');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(titles()).toEqual(['Buy bread', 'Second']));
  expect(rename).toHaveBeenCalledTimes(1);
  expect(rename).toHaveBeenCalledWith(
    { id: expect.any(String), title: 'Buy bread' },
    expect.any(Function),
  );
});

it('keeps the edit open with the typed title when saving fails', async () => {
  const { user } = renderPage({
    seed: withTodos({ title: 'First' }),
    handlers: { 'todos.rename': failed },
  });
  await user.click(await screen.findByRole('button', { name: 'Edit First' }));

  await user.type(screen.getByRole('textbox', { name: 'New title' }), ' again');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the to-do');
  expect(screen.getByRole('textbox', { name: 'New title' })).toHaveValue('First again');
});

it('deletes a to-do and shows the latest failure only', async () => {
  const { user } = renderPage({
    seed: withTodos({ title: 'First' }, { title: 'Second' }),
    handlers: { 'todos.setDone': failed },
  });
  await screen.findByRole('list', { name: 'To-dos' });

  await user.click(screen.getByRole('checkbox', { name: 'First' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not update the to-do');
  await user.click(screen.getByRole('button', { name: 'Delete Second' }));

  await waitFor(() => expect(titles()).toEqual(['First']));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('keeps a to-do when deletion fails', async () => {
  const { user } = renderPage({
    seed: withTodos({ title: 'First' }),
    handlers: { 'todos.delete': failed },
  });
  await user.click(await screen.findByRole('button', { name: 'Delete First' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the to-do');
  expect(titles()).toEqual(['First']);
});

it('filters the list and clears every done to-do', async () => {
  const clearDone = recorded<'clearDone'>();
  const { user } = renderPage({
    seed: withTodos(
      { title: 'First', done: true },
      { title: 'Second' },
      { title: 'Third', done: true },
    ),
    handlers: { 'todos.clearDone': clearDone },
  });
  await screen.findByRole('list', { name: 'To-dos' });

  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(titles()).toEqual(['First', 'Third']);
  await user.click(screen.getByRole('button', { name: 'Active' }));
  expect(titles()).toEqual(['Second']);
  expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(screen.getByRole('button', { name: 'Clear done' }));

  await waitFor(() => expect(screen.getByRole('button', { name: 'Clear done' })).toBeDisabled());
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByText('No to-dos to show')).toBeVisible();
  expect(clearDone).toHaveBeenCalledTimes(1);
});
