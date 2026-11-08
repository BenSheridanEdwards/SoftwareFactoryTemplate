import {
  activeTodos,
  type ClearedTodos,
  checkTitle,
  doneIds,
  findTodo,
  missingTodo,
  newTodo,
  type Outcome,
  removeTodo,
  replaceTodo,
  succeed,
  type Todo,
  withDone,
  withTitle,
} from './domain.ts';
import { createInMemoryTodos } from './integrations.ts';

/**
 * The to-do use cases over a new, empty in-memory list. The api builds one set
 * when it starts; each page test builds its own.
 */
export function createTodoUseCases() {
  const store = createInMemoryTodos();

  function changeTodo(id: string, change: (todo: Todo) => Todo): Outcome<Todo> {
    const todo = findTodo(store.read(), id);
    if (!todo) {
      return missingTodo;
    }
    const changed = change(todo);
    store.write(replaceTodo(store.read(), changed));
    return succeed(changed);
  }

  function listTodos(): readonly Todo[] {
    return store.read();
  }

  function addTodo(request: { readonly title: string }): Outcome<Todo> {
    const title = checkTitle(request.title);
    if (!title.ok) {
      return title;
    }
    const todo = newTodo(store.newId(), title.value);
    store.write([...store.read(), todo]);
    return succeed(todo);
  }

  function setTodoDone(request: { readonly id: string; readonly done: boolean }): Outcome<Todo> {
    return changeTodo(request.id, (todo) => withDone(todo, request.done));
  }

  function renameTodo(request: { readonly id: string; readonly title: string }): Outcome<Todo> {
    const title = checkTitle(request.title);
    if (!title.ok) {
      return title;
    }
    return changeTodo(request.id, (todo) => withTitle(todo, title.value));
  }

  function deleteTodo(request: { readonly id: string }): Outcome<{ readonly id: string }> {
    const todos = store.read();
    if (!findTodo(todos, request.id)) {
      return missingTodo;
    }
    store.write(removeTodo(todos, request.id));
    return succeed({ id: request.id });
  }

  function clearDoneTodos(): ClearedTodos {
    const todos = store.read();
    store.write(activeTodos(todos));
    return { ids: doneIds(todos) };
  }

  return { listTodos, addTodo, setTodoDone, renameTodo, deleteTodo, clearDoneTodos };
}
