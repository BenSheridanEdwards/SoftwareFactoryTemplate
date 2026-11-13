import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { TestApiHandlers } from './testApiHandlers';
import { TrpcProvider } from './trpc';
import { type TestApiSeed, useTestApiClients } from './useTestApiClients';

export interface TestApiProviderProps {
  readonly handlers?: TestApiHandlers;
  readonly seed?: TestApiSeed;
  readonly children: ReactNode;
}

const NO_HANDLERS: TestApiHandlers = {};
const seedNothing: TestApiSeed = () => Promise.resolve();

/**
 * Route and hook tests' providers: a new real app router per render. `seed`
 * fills it first; a handler answers its procedure instead, for example to fail.
 */
export function TestApiProvider({
  handlers = NO_HANDLERS,
  seed = seedNothing,
  children,
}: TestApiProviderProps) {
  const { queryClient, trpcClient } = useTestApiClients(handlers, seed);
  return (
    <QueryClientProvider client={queryClient}>
      <TrpcProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TrpcProvider>
    </QueryClientProvider>
  );
}
