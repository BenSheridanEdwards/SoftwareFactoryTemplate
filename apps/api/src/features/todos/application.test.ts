beforeEach(() => jest.resetModules());

const application = () => import('./application.ts');

it('starts empty and lists to-dos oldest first', async () => {
  const { addTodo, listTodos } = await application();
  expect(listTodos()).toEqual([]);
  addTodo({ title: 'First' });
  addTodo({ title: '  Second  ' });
  expect(listTodos().map(({ title }) => title)).toEqual(['First', 'Second']);
});

it('adds an active to-do with a fresh id and a normalised title', async () => {
  const { addTodo } = await application();
  const first = addTodo({ title: '  Buy   milk ' });
  const second = addTodo({ title: 'Buy milk' });
  expect(first).toEqual({
    ok: true,
    value: { id: expect.any(String), title: 'Buy milk', done: false },
  });
  expect(first.ok && second.ok && first.value.id !== second.value.id).toBe(true);
});

it('stores nothing for an invalid title', async () => {
  const { addTodo, listTodos } = await application();
  expect(addTodo({ title: '   ' })).toEqual({
    ok: false,
    problem: { kind: 'invalid-title', message: 'Enter a title' },
  });
  expect(listTodos()).toEqual([]);
});

it('marks, renames and deletes a to-do in place', async () => {
  const { addTodo, deleteTodo, listTodos, renameTodo, setTodoDone } = await application();
  addTodo({ title: 'First' });
  const added = addTodo({ title: 'Second' });
  addTodo({ title: 'Third' });
  const { id } = unwrap(added);

  expect(setTodoDone({ id, done: true })).toEqual({
    ok: true,
    value: { id, title: 'Second', done: true },
  });
  expect(renameTodo({ id, title: ' Changed  title ' })).toEqual({
    ok: true,
    value: { id, title: 'Changed title', done: true },
  });
  expect(listTodos().map(({ title }) => title)).toEqual(['First', 'Changed title', 'Third']);
  expect(deleteTodo({ id })).toEqual({ ok: true, value: { id } });
  expect(listTodos().map(({ title }) => title)).toEqual(['First', 'Third']);
});

it('checks a new title before it looks for the to-do', async () => {
  const { renameTodo } = await application();
  expect(renameTodo({ id: 'missing', title: ' ' })).toEqual({
    ok: false,
    problem: { kind: 'invalid-title', message: 'Enter a title' },
  });
});

it('answers not found for an unknown id', async () => {
  const { deleteTodo, renameTodo, setTodoDone } = await application();
  const missing = { ok: false, problem: { kind: 'not-found', message: 'No to-do has that id' } };
  expect(setTodoDone({ id: 'missing', done: true })).toEqual(missing);
  expect(renameTodo({ id: 'missing', title: 'Anything' })).toEqual(missing);
  expect(deleteTodo({ id: 'missing' })).toEqual(missing);
});

it('clears the done to-dos and returns their ids', async () => {
  const { addTodo, clearDoneTodos, listTodos, setTodoDone } = await application();
  const ids = ['First', 'Second', 'Third'].map((title) => unwrap(addTodo({ title })).id);
  setTodoDone({ id: present(ids[0]), done: true });
  setTodoDone({ id: present(ids[2]), done: true });

  expect(clearDoneTodos()).toEqual({ ids: [ids[0], ids[2]] });
  expect(listTodos().map(({ title }) => title)).toEqual(['Second']);
  expect(clearDoneTodos()).toEqual({ ids: [] });
});
