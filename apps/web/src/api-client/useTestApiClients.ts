import type { AppRouter } from '@repo/api';
import type { QueryClient } from '@tanstack/react-query';
import {
  createTRPCClient,
  getUntypedClient,
  type TRPCClient,
  unstable_localLink,
} from '@trpc/client';
import { useState } from 'react';
import { handlerLink, serveThrough, type TestApiHandlers } from './testApiHandlers';
import { createTestAppRouter } from './testAppRouter';
import { createQueryClient } from './trpc';

/** Calls the test's real router makes before the page's first call is answered. */
export type TestApiSeed = (api: TRPCClient<AppRouter>) => Promise<void>;

/**
 * One query client and one tRPC client for the life of a test render. Each
 * render gets a new app router over empty in-memory stores; `seed` fills it.
 */
export function useTestApiClients(
  handlers: TestApiHandlers,
  seed: TestApiSeed,
): {
  readonly queryClient: QueryClient;
  readonly trpcClient: TRPCClient<AppRouter>;
} {
  const [clients] = useState(() => {
    const api = createTRPCClient<AppRouter>({
      links: [
        unstable_localLink({ router: createTestAppRouter(), createContext: async () => ({}) }),
      ],
    });
    const serve = serveThrough(getUntypedClient(api), seed(api));
    return {
      queryClient: createQueryClient(),
      trpcClient: createTRPCClient<AppRouter>({ links: [handlerLink(handlers, serve)] }),
    };
  });
  return clients;
}
