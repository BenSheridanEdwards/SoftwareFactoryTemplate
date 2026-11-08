import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { ComponentProps } from 'react';
import {
  type RouterInputs,
  type RouterOutputs,
  type TestApiHandlers,
  TestApiProvider,
} from '../../api-client';
import { TodosPage } from './TodosPage';
import type { Todo } from './useTodos';

type Seed = NonNullable<ComponentProps<typeof TestApiProvider>['seed']>;
type Handler<Path extends keyof TestApiHandlers> = NonNullable<TestApiHandlers[Path]>;

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

it('loads, then shows the empty message on the All filter', async () => {
  const held = { release: (): void => undefined };
  const list = jest.fn<ReturnType<Handler<'todos.list'>>, Parameters<Handler<'todos.list'>>>(
    (input, serve) =>
      new Promise((resolve) => {
        held.release = () => resolve(serve(input));
      }),
  );
  const { container } = renderPage({ handlers: { 'todos.list': list } });

  expect(screen.getByRole('status')).toHaveTextContent('Loading to-dos…');
  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument();
  await act(async () => held.release());

  expect(await screen.findByText('No to-dos to show')).toBeVisible();
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Clear done' })).toBeDisabled();
  expect(await axe(container)).toHaveNoViolations();
});

it('says so when the list fails to load', async () => {
  renderPage({ handlers: { 'todos.list': failed } });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the to-dos');
  expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
});

it('adds a normalised title, then empties the field', async () => {
  const add = recorded<'add'>();
  const list = recorded<'list'>();
  const { user } = renderPage({
    seed: withTodos({ title: 'First' }),
    handlers: { 'todos.add': add, 'todos.list': list },
  });
  await screen.findByRole('list', { name: 'To-dos' });

  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Buy   milk ');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  await waitFor(() => expect(titles()).toEqual(['First', 'Buy milk']));
  expect(add).toHaveBeenCalledWith({ title: 'Buy milk' }, expect.any(Function));
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  expect(list).toHaveBeenCalledTimes(2);
});

it.each([
  ['   ', 'Enter a title'],
  ['d'.repeat(101), 'Use 100 characters or fewer'],
])('rejects the title %j and sends nothing', async (title, message) => {
  const add = recorded<'add'>();
  const { user } = renderPage({ handlers: { 'todos.add': add } });
  await screen.findByText('No to-dos to show');

  await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(add).not.toHaveBeenCalled();
});

it('keeps the typed title and says so when adding fails', async () => {
  const { user } = renderPage({ handlers: { 'todos.add': failed } });
  await screen.findByText('No to-dos to show');

  await user.type(screen.getByRole('textbox', { name: 'Title' }), ' Call  Ada');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the to-do');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(' Call  Ada');
});

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
  expect(screen.getByRole('button', { name: 'Clear done' })).toBeEnabled();
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

it.each([
  ['todos.delete', 'Delete First', 'Could not delete the to-do'],
  ['todos.clearDone', 'Clear done', 'Could not clear the done to-dos'],
] as const)('says so when %s fails', async (procedure, button, message) => {
  const { user } = renderPage({
    seed: withTodos({ title: 'First', done: true }),
    handlers: { [procedure]: failed },
  });
  await screen.findByRole('list', { name: 'To-dos' });

  await user.click(screen.getByRole('button', { name: button }));

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
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
