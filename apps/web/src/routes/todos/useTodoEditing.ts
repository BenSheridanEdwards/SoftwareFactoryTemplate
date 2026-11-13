import { useState } from 'react';
import type { Todo } from './useTodos';

/** The one to-do being edited, if any. */
export function useTodoEditing() {
  const [editingId, setEditingId] = useState<Todo['id'] | null>(null);
  return {
    editingId,
    startEditing: (id: Todo['id']) => setEditingId(id),
    stopEditing: () => setEditingId(null),
  };
}
