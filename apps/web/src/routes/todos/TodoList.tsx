import type { Todo } from './useTodos';

interface TodoListProps {
  readonly todos: readonly Todo[];
}
export function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) {
    return <p className="text-muted">No to-dos to show</p>;
  }
  return (
    <ul aria-label="To-dos" className="flex flex-col divide-y divide-line">
      {todos.map((todo) => (
        <li key={todo.id} className="py-3">
          {todo.title}
        </li>
      ))}
    </ul>
  );
}
