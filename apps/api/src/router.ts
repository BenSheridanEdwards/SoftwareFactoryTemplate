import { greetingRouter } from './features/greeting/index.ts';
import { recentGreetingsRouter } from './features/recent-greetings/index.ts';
import { createTodosRouter } from './features/todos/index.ts';
import { router } from './trpc.ts';

export function createAppRouter() {
  return router({
    todos: createTodosRouter(),
    greeting: greetingRouter,
    recentGreetings: recentGreetingsRouter,
  });
}

export const appRouter = createAppRouter();

export type AppRouter = typeof appRouter;
