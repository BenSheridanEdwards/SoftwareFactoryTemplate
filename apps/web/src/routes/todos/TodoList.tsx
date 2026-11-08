import { TodoEditForm } from './TodoEditForm';
import { TodoItem } from './TodoItem';
import type { Todo } from './useTodos';

export interface TodoListProps {
  readonly todos: readonly Todo[];
  readonly editingId: Todo['id'] | null;
  readonly busy: boolean;
  readonly onToggle: (id: Todo['id'], done: Todo['done']) => void;
  readonly onEdit: (id: Todo['id']) => void;
  readonly onDelete: (id: Todo['id']) => void;
  readonly onSave: (id: Todo['id'], title: Todo['title']) => void;
  readonly onCancel: () => void;
}

export function TodoList({ todos, editingId, busy, onSave, onCancel, ...actions }: TodoListProps) {
  if (todos.length === 0) {
    return <p className="text-muted">No to-dos to show</p>;
  }
  return (
    <ul aria-label="To-dos" className="flex flex-col divide-y divide-line">
      {todos.map((todo) => (
        <li key={todo.id} className="py-3">
          {todo.id === editingId ? (
            <TodoEditForm todo={todo} busy={busy} onSave={onSave} onCancel={onCancel} />
          ) : (
            <TodoItem todo={todo} busy={busy} {...actions} />
          )}
        </li>
      ))}
    </ul>
  );
}
