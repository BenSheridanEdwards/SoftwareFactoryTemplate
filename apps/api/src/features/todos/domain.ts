import { normaliseTitle, TITLE_MAX_LENGTH, TITLE_MESSAGES } from './rules.ts';

export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

/** The ids of the to-dos a clear deleted, oldest first. */
export interface ClearedTodos {
  readonly ids: readonly Todo['id'][];
}

const MISSING_TODO_MESSAGE = 'No to-do has that id';

export type TodoProblem =
  | { readonly kind: 'invalid-title'; readonly message: string }
  | { readonly kind: 'not-found'; readonly message: string };

export type Outcome<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly problem: TodoProblem };

export const succeed = <Value>(value: Value): Outcome<Value> => ({ ok: true, value });

export const missingTodo: Outcome<never> = {
  ok: false,
  problem: { kind: 'not-found', message: MISSING_TODO_MESSAGE },
};

/** The normalised title when it holds 1 to 100 characters, or why it does not. */
export function checkTitle(title: string): Outcome<string> {
  const normalised = normaliseTitle(title);
  if (normalised.length === 0) {
    return { ok: false, problem: { kind: 'invalid-title', message: TITLE_MESSAGES.blank } };
  }
  if (normalised.length > TITLE_MAX_LENGTH) {
    return { ok: false, problem: { kind: 'invalid-title', message: TITLE_MESSAGES.tooLong } };
  }
  return succeed(normalised);
}

export const newTodo = (id: string, title: string): Todo => ({ id, title, done: false });

export const withDone = (todo: Todo, done: boolean): Todo => ({ ...todo, done });

export const withTitle = (todo: Todo, title: string): Todo => ({ ...todo, title });

export const findTodo = (todos: readonly Todo[], id: string): Todo | undefined =>
  todos.find((todo) => todo.id === id);

/** Puts `changed` where the to-do with its id stands, so it keeps its place. */
export const replaceTodo = (todos: readonly Todo[], changed: Todo): readonly Todo[] =>
  todos.map((todo) => (todo.id === changed.id ? changed : todo));

export const removeTodo = (todos: readonly Todo[], id: string): readonly Todo[] =>
  todos.filter((todo) => todo.id !== id);

export const doneIds = (todos: readonly Todo[]): readonly string[] =>
  todos.filter((todo) => todo.done).map((todo) => todo.id);

export const activeTodos = (todos: readonly Todo[]): readonly Todo[] =>
  todos.filter((todo) => !todo.done);
