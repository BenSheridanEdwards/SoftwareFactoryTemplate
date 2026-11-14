import { createTodosRouter } from './features/todos/index.ts';
import { router } from './trpc.ts';

export function createAppRouter() {
  return router({
    todos: createTodosRouter(),
  });
}

export const appRouter = createAppRouter();

export type AppRouter = typeof appRouter;
