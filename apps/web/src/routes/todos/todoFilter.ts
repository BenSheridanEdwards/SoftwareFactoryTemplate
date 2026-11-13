import type { Todo } from './useTodos';

export type TodoFilter = 'all' | 'active' | 'done';

export const TODO_FILTERS: readonly { readonly value: TodoFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
];

const MATCHES: Readonly<Record<TodoFilter, (todo: Todo) => boolean>> = {
  all: () => true,
  active: (todo) => !todo.done,
  done: (todo) => todo.done,
};

/** The to-dos `filter` matches, in list order. */
export function filterTodos(todos: readonly Todo[], filter: TodoFilter): readonly Todo[] {
  return todos.filter(MATCHES[filter]);
}
