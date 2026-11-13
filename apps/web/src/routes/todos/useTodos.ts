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
} as const;

/** A failed read, the first or a re-read after a change, hides any older list. */
function toTodoList(query: { data: readonly Todo[] | undefined; isError: boolean }): TodoList {
  if (query.isError) {
    return { status: 'failed' };
  }
  return query.data ? { status: 'loaded', todos: query.data } : { status: 'loading' };
}

/**
 * The to-do list and its changes through the api. A change shows only once
 * the api has answered and the list is re-read, and `busy` holds until then.
 */
export function useTodos() {
  const trpc = useTrpc();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  // The list is read when the page opens and after a successful change only.
  const list = useQuery(
    trpc.todos.list.queryOptions(undefined, {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  );
  const changeOptions = (change: keyof typeof FAILURES) => ({
    onMutate: () => setFailure(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.todos.list.queryKey() }),
    onError: () => setFailure(FAILURES[change]),
  });
  const add = useMutation(trpc.todos.add.mutationOptions(changeOptions('add')));

  return {
    list: toTodoList(list),
    failure,
    busy: add.isPending,
    // A second submit can land before the render that disables Add; it sends nothing.
    addTodo: (title: Todo['title'], onAdded: () => void) => {
      if (queryClient.isMutating() > 0) {
        return;
      }
      add.mutate({ title }, { onSuccess: onAdded });
    },
  };
}
