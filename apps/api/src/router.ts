import { createTodosRouter } from './features/todos/index.ts';
import { router } from './trpc.ts';

/** The app router, each feature over its own new in-memory store. */
export function createAppRouter() {
  return router({
    todos: createTodosRouter(),
  });
}

export const appRouter = createAppRouter();

export type AppRouter = typeof appRouter;
