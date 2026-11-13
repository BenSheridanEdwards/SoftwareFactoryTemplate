import { Button, cn } from '@repo/ui';
import type { Todo } from './useTodos';

export interface TodoItemProps {
  readonly todo: Todo;
  readonly busy: boolean;
  readonly onToggle: (id: Todo['id'], done: Todo['done']) => void;
  readonly onEdit: (id: Todo['id']) => void;
  readonly onDelete: (id: Todo['id']) => void;
}

export function TodoItem({ todo, busy, onToggle, onEdit, onDelete }: TodoItemProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="size-5 shrink-0 cursor-pointer accent-focus focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed"
          checked={todo.done}
          disabled={busy}
          onChange={() => onToggle(todo.id, !todo.done)}
        />
        <span className={cn('min-w-0 wrap-anywhere', todo.done && 'text-muted line-through')}>
          {todo.title}
        </span>
      </label>
      <Button aria-label={`Edit ${todo.title}`} disabled={busy} onClick={() => onEdit(todo.id)}>
        Edit
      </Button>
      <Button aria-label={`Delete ${todo.title}`} disabled={busy} onClick={() => onDelete(todo.id)}>
        Delete
      </Button>
    </div>
  );
}
