import type { AppRouter } from '@repo/api';

const factories = new Map<'app', () => AppRouter>();

/** Registers the factory from the web Jest setup without a runtime api import. */
export function serveAppRouterInTests(createAppRouter: () => AppRouter): void {
  factories.set('app', createAppRouter);
}

/** A new app router, each feature over an empty in-memory store. */
export function createTestAppRouter(): AppRouter {
  const createAppRouter = factories.get('app');
  if (!createAppRouter) {
    throw new Error(
      'No app router to serve: the web Jest project runs tooling/jest/serve-app-router.ts first.',
    );
  }
  return createAppRouter();
}
