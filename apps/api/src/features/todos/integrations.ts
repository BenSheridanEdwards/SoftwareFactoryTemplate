import { randomUUID } from 'node:crypto';
import type { Todo } from './domain.ts';

interface TodoState {
  todos: readonly Todo[];
}

/** The to-do list, held in memory for the life of the api process. */
export function createInMemoryTodos() {
  const state: TodoState = { todos: [] };
  return {
    read: (): readonly Todo[] => state.todos,
    write: (todos: readonly Todo[]): void => {
      state.todos = todos;
    },
    newId: (): string => randomUUID(),
  };
}
