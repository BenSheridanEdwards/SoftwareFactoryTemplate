import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type RouterOutputs, useTrpc } from '../../api-client';

export type Todo = RouterOutputs['todos']['list'][number];

type TodoList =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'loaded'; readonly todos: readonly Todo[] };

const FAILURES = {
  add: 'Could not add the to-do',
  setDone: 'Could not update the to-do',
  rename: 'Could not save the to-do',
  delete: 'Could not delete the to-do',
  clearDone: 'Could not clear the done to-dos',
} as const;

function toTodoList(query: { data: readonly Todo[] | undefined; isError: boolean }): TodoList {
  if (query.data) {
    return { status: 'loaded', todos: query.data };
  }
  return query.isError ? { status: 'failed' } : { status: 'loading' };
}

/**
 * The to-do list and its changes through the api. A change shows only once
 * the api has answered and the list is re-read, and `busy` holds until then.
 */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const list = useQuery(trpc.todos.list.queryOptions());
  const changeOptions = (change: keyof typeof FAILURES) => ({
    onMutate: () => setFailure(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() }),
    onError: () => setFailure(FAILURES[change]),
  });
  const add = useMutation(trpc.todos.add.mutationOptions(changeOptions('add')));
  const setDone = useMutation(trpc.todos.setDone.mutationOptions(changeOptions('setDone')));
  const rename = useMutation(trpc.todos.rename.mutationOptions(changeOptions('rename')));
  const remove = useMutation(trpc.todos.delete.mutationOptions(changeOptions('delete')));
  const clearDone = useMutation(trpc.todos.clearDone.mutationOptions(changeOptions('clearDone')));

  return {
    list: toTodoList(list),
    failure,
    busy: [add, setDone, rename, remove, clearDone].some((change) => change.isPending),
    addTodo: (title: Todo['title'], onAdded: () => void) =>
      add.mutate({ title }, { onSuccess: onAdded }),
    setTodoDone: (id: Todo['id'], done: Todo['done']) => setDone.mutate({ id, done }),
    renameTodo: (id: Todo['id'], title: Todo['title'], onRenamed: () => void) =>
      rename.mutate({ id, title }, { onSuccess: onRenamed }),
    deleteTodo: (id: Todo['id']) => remove.mutate({ id }),
    clearDoneTodos: () => clearDone.mutate(),
  };
}
