import { useState } from 'react';
import type { TodoFilter } from './todoFilter';

/** The selected filter, which starts at All and lives only in the open page. */
export function useTodoFilter() {
  const [filter, setFilter] = useState<TodoFilter>('all');
  return { filter, setFilter };
}
