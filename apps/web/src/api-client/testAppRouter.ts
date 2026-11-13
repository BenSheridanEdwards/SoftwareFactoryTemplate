import type { AppRouter } from '@repo/api';

const factories = new Map<'app', () => AppRouter>();

/**
 * Hands the api's router factory to page tests. Web code imports the api by type
 * only, so the web Jest setup (`tooling/jest/serve-app-router.ts`) calls this.
 */
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
