import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { type TestApiHandlers, TestApiProvider } from '../../api-client';
import { TodosPage } from './TodosPage';

interface Todo {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

/** An in-memory api for the page, with a hook to fail or hold any call. */
function fakeApi(initial: readonly Todo[]) {
  const state = { todos: [...initial], next: initial.length + 1 };
  const change = <Value,>(apply: () => Value) => Promise.resolve().then(apply);
  const handlers = {
    'todos.list': jest.fn(() => state.todos),
    'todos.add': jest.fn(({ title }: { title: string }) =>
      change(() => {
        const todo = { id: String(state.next), title, done: false };
        state.next += 1;
        state.todos = [...state.todos, todo];
        return todo;
      }),
    ),
    'todos.setDone': jest.fn(({ id, done }: { id: string; done: boolean }) =>
      change(() => {
        state.todos = state.todos.map((todo) => (todo.id === id ? { ...todo, done } : todo));
        return state.todos.find((todo) => todo.id === id) ?? { id, title: '', done };
      }),
    ),
    'todos.rename': jest.fn(({ id, title }: { id: string; title: string }) =>
      change(() => {
        state.todos = state.todos.map((todo) => (todo.id === id ? { ...todo, title } : todo));
        return state.todos.find((todo) => todo.id === id) ?? { id, title, done: false };
      }),
    ),
    'todos.delete': jest.fn(({ id }: { id: string }) =>
      change(() => {
        state.todos = state.todos.filter((todo) => todo.id !== id);
        return { id };
      }),
    ),
    'todos.clearDone': jest.fn(() =>
      change(() => {
        const ids = state.todos.filter((todo) => todo.done).map((todo) => todo.id);
        state.todos = state.todos.filter((todo) => !todo.done);
        return { ids };
      }),
    ),
  } satisfies TestApiHandlers;
  return handlers;
}

function renderPage(handlers: TestApiHandlers) {
  const view = render(
    <TestApiProvider handlers={handlers}>
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
  const pending = { answer: (_todos: Todo[]): void => undefined };
  const list = jest.fn(
    () =>
      new Promise<Todo[]>((resolve) => {
        pending.answer = resolve;
      }),
  );
  const { container } = renderPage({ 'todos.list': list });

  expect(screen.getByRole('status')).toHaveTextContent('Loading to-dos…');
  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument();
  await act(async () => pending.answer([]));

  expect(await screen.findByText('No to-dos to show')).toBeVisible();
  expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Clear done' })).toBeDisabled();
  expect(await axe(container)).toHaveNoViolations();
});

it('says so when the list fails to load', async () => {
  renderPage({ 'todos.list': failed });

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the to-dos');
  expect(screen.queryByRole('group', { name: 'Filter' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
});

it('adds a normalised title, then empties the field', async () => {
  const api = fakeApi([{ id: '1', title: 'First', done: false }]);
  const { user } = renderPage(api);
  await screen.findByRole('list', { name: 'To-dos' });

  await user.type(screen.getByRole('textbox', { name: 'Title' }), '  Buy   milk ');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  await waitFor(() => expect(titles()).toEqual(['First', 'Buy milk']));
  expect(api['todos.add']).toHaveBeenCalledWith({ title: 'Buy milk' });
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('');
  expect(api['todos.list']).toHaveBeenCalledTimes(2);
});

it.each([
  ['   ', 'Enter a title'],
  ['d'.repeat(101), 'Use 100 characters or fewer'],
])('rejects the title %j and sends nothing', async (title, message) => {
  const api = fakeApi([]);
  const { user } = renderPage(api);
  await screen.findByText('No to-dos to show');

  await user.type(screen.getByRole('textbox', { name: 'Title' }), title);
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(api['todos.add']).not.toHaveBeenCalled();
});

it('keeps the typed title and says so when adding fails', async () => {
  const { user } = renderPage({ ...fakeApi([]), 'todos.add': failed });
  await screen.findByText('No to-dos to show');

  await user.type(screen.getByRole('textbox', { name: 'Title' }), ' Call  Ada');
  await user.click(screen.getByRole('button', { name: 'Add' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the to-do');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(' Call  Ada');
});

it('marks a to-do done and active again, disabling changes while it waits', async () => {
  const api = fakeApi([{ id: '1', title: 'First', done: false }]);
  const held = { release: (): void => undefined };
  const setDone = api['todos.setDone'].getMockImplementation();
  api['todos.setDone'].mockImplementationOnce(
    (input) =>
      new Promise((resolve) => {
        held.release = () => resolve(setDone?.(input) ?? failed());
      }),
  );
  const { user } = renderPage(api);
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
  expect(api['todos.setDone']).toHaveBeenLastCalledWith({ id: '1', done: false });
});

it('edits a title, keeps one edit open at a time and cancels without saving', async () => {
  const api = fakeApi([
    { id: '1', title: 'First', done: false },
    { id: '2', title: 'Second', done: false },
  ]);
  const { user, container } = renderPage(api);
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
  expect(api['todos.rename']).toHaveBeenCalledTimes(1);
  expect(api['todos.rename']).toHaveBeenCalledWith({ id: '1', title: 'Buy bread' });
});

it('keeps the edit open with the typed title when saving fails', async () => {
  const { user } = renderPage({
    ...fakeApi([{ id: '1', title: 'First', done: false }]),
    'todos.rename': failed,
  });
  await user.click(await screen.findByRole('button', { name: 'Edit First' }));

  await user.type(screen.getByRole('textbox', { name: 'New title' }), ' again');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the to-do');
  expect(screen.getByRole('textbox', { name: 'New title' })).toHaveValue('First again');
});

it('deletes a to-do and shows the latest failure only', async () => {
  const api = fakeApi([
    { id: '1', title: 'First', done: false },
    { id: '2', title: 'Second', done: false },
  ]);
  const { user } = renderPage({ ...api, 'todos.setDone': failed });
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
    ...fakeApi([{ id: '1', title: 'First', done: true }]),
    [procedure]: failed,
  });
  await screen.findByRole('list', { name: 'To-dos' });

  await user.click(screen.getByRole('button', { name: button }));

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(titles()).toEqual(['First']);
});

it('filters the list and clears every done to-do', async () => {
  const api = fakeApi([
    { id: '1', title: 'First', done: true },
    { id: '2', title: 'Second', done: false },
    { id: '3', title: 'Third', done: true },
  ]);
  const { user } = renderPage(api);
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
  expect(api['todos.clearDone']).toHaveBeenCalledTimes(1);
});
