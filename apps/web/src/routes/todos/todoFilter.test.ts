import { filterTodos, TODO_FILTERS } from './todoFilter';

const todos = [
  { id: '1', title: 'First', done: false },
  { id: '2', title: 'Second', done: true },
  { id: '3', title: 'Third', done: false },
];

it('offers All, Active and Done, in that order', () => {
  expect(TODO_FILTERS.map(({ label }) => label)).toEqual(['All', 'Active', 'Done']);
});

it.each([
  ['all', ['First', 'Second', 'Third']],
  ['active', ['First', 'Third']],
  ['done', ['Second']],
] as const)('keeps list order for the %s filter', (filter, titles) => {
  expect(filterTodos(todos, filter).map(({ title }) => title)).toEqual(titles);
});
