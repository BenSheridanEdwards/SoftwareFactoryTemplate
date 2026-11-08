import {
  activeTodos,
  checkTitle,
  doneIds,
  findTodo,
  newTodo,
  normaliseTitle,
  removeTodo,
  replaceTodo,
  TITLE_MAX_LENGTH,
  withDone,
  withTitle,
} from './domain.ts';

const first = newTodo('1', 'First');
const second = withDone(newTodo('2', 'Second'), true);
const third = newTodo('3', 'Third');

it.each([
  ['  Buy   milk  ', 'Buy milk'],
  ['Buy\tmilk', 'Buy milk'],
  ['Buy\n\nmilk', 'Buy milk'],
  ['\u00a0Buy\u00a0\u00a0milk\u00a0', 'Buy milk'],
])('normalises %j to %j', (title, normalised) => {
  expect(normaliseTitle(title)).toBe(normalised);
});

it('accepts a title of 1 to 100 characters after normalising it', () => {
  expect(TITLE_MAX_LENGTH).toBe(100);
  expect(checkTitle(' a ')).toEqual({ ok: true, value: 'a' });
  expect(checkTitle(` ${'b'.repeat(100)} `)).toEqual({ ok: true, value: 'b'.repeat(100) });
  expect(checkTitle(`${'c'.repeat(50)}   ${'c'.repeat(49)}`)).toEqual({
    ok: true,
    value: `${'c'.repeat(50)} ${'c'.repeat(49)}`,
  });
});

it.each([
  ['', 'Enter a title'],
  [' \t\n ', 'Enter a title'],
  ['d'.repeat(101), 'Use 100 characters or fewer'],
])('rejects %j with %j', (title, message) => {
  expect(checkTitle(title)).toEqual({ ok: false, problem: { kind: 'invalid-title', message } });
});

it('makes a new to-do active', () => {
  expect(newTodo('1', 'First')).toEqual({ id: '1', title: 'First', done: false });
});

it('marks a to-do done or active and renames it without changing the original', () => {
  const todo = Object.freeze(newTodo('1', 'First'));
  expect(withDone(todo, true)).toEqual({ id: '1', title: 'First', done: true });
  expect(withDone(withDone(todo, true), false)).toEqual(todo);
  expect(withTitle(todo, 'Renamed')).toEqual({ id: '1', title: 'Renamed', done: false });
  expect(todo).toEqual({ id: '1', title: 'First', done: false });
});

it('finds, replaces in place and removes a to-do by id', () => {
  const todos = Object.freeze([first, second, third]);
  expect(findTodo(todos, '2')).toBe(second);
  expect(findTodo(todos, 'missing')).toBeUndefined();
  expect(replaceTodo(todos, withTitle(second, 'Changed'))).toEqual([
    first,
    { ...second, title: 'Changed' },
    third,
  ]);
  expect(removeTodo(todos, '2')).toEqual([first, third]);
  expect(todos).toEqual([first, second, third]);
});

it('splits the done to-dos from the active ones in list order', () => {
  const todos = [withDone(first, true), second, third];
  expect(doneIds(todos)).toEqual(['1', '2']);
  expect(activeTodos(todos)).toEqual([third]);
});
