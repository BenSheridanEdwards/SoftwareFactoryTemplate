import type { AppRouter } from '@repo/api';
import {
  type Operation,
  TRPCClientError,
  type TRPCLink,
  type TRPCUntypedClient,
} from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { RouterInputs, RouterOutputs } from './trpc';

type ProcedurePath = {
  [Router in keyof RouterInputs & string]: `${Router}.${keyof RouterInputs[Router] & string}`;
}[keyof RouterInputs & string];

type Lookup<Tree, Path> = Path extends `${infer Router}.${infer Procedure}`
  ? Router extends keyof Tree
    ? Procedure extends keyof Tree[Router]
      ? Tree[Router][Procedure]
      : never
    : never
  : never;

/**
 * An answer per procedure path, such as `'todos.list'`, typed by the router. Its
 * `serve(input)` asks the real router, so a handler can record, hold or fail a call.
 */
export type TestApiHandlers = {
  readonly [Path in ProcedurePath]?: (
    input: Lookup<RouterInputs, Path>,
    serve: (input: Lookup<RouterInputs, Path>) => Promise<Lookup<RouterOutputs, Path>>,
  ) => Lookup<RouterOutputs, Path> | Promise<Lookup<RouterOutputs, Path>>;
};

/** A value as a tRPC link carries it; `TestApiHandlers` types it at each end. */
type LinkValue = Operation['input'];
type Call = Pick<Operation, 'type' | 'path' | 'input'>;
type Serve = (call: Call) => Promise<LinkValue>;

// The typed tRPC client pairs each path with its input before the link erases it.
// Method variance lets this dispatch interface accept each procedure's handler.
interface TestApiHandler {
  handle(input: LinkValue, serve: (input: LinkValue) => Promise<LinkValue>): LinkValue;
}

/** Answers each call through `client`, as the http api would, once `ready` settles. */
export function serveThrough(client: TRPCUntypedClient<AppRouter>, ready: Promise<void>): Serve {
  const calls = {
    query: ({ path, input }) => client.query(path, input),
    mutation: ({ path, input }) => client.mutation(path, input),
    subscription: ({ path }) =>
      Promise.reject(
        new Error(`TestApiProvider serves queries and mutations, not the subscription ${path}`),
      ),
  } satisfies Record<Operation['type'], Serve>;
  return (call) => ready.then(() => calls[call.type](call));
}

/** A tRPC link that answers each call from its handler in `handlers`, or else from `serve`. */
export function handlerLink(handlers: TestApiHandlers, serve: Serve): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        const handler: TestApiHandler['handle'] | undefined = Object.entries(handlers).find(
          ([path]) => path === op.path,
        )?.[1];
        const answer = (input: LinkValue) => serve({ type: op.type, path: op.path, input });
        Promise.resolve(op.input)
          .then((input) => (handler ? handler(input, answer) : answer(input)))
          .then(
            (data) => {
              observer.next({ result: { type: 'data', data } });
              observer.complete();
            },
            (cause: Error) => observer.error(TRPCClientError.from(cause)),
          );
      });
}
