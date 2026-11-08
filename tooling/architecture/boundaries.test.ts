/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FALLOW_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/fallow');
const RULE_PACK = 'tooling/architecture/contract.rules.jsonc';
const WEB = 'apps/web/src';
const API = 'apps/api/src';
const TODOS = `${API}/features/todos`;

/** A clean copy of the reference result's role layout: every import follows the contract. */
const LAYOUT = {
  'package.json': '{ "name": "root", "private": true, "type": "module" }\n',
  'apps/web/package.json':
    '{ "name": "@repo/web", "private": true, "type": "module", "dependencies": { "@repo/ui": "workspace:*" }, "devDependencies": { "@repo/api": "workspace:*" } }\n',
  'apps/web/index.html': '<script type="module" src="/src/main.tsx"></script>\n',
  [`${WEB}/main.tsx`]:
    "import { App } from './App';\nimport { ApiProvider } from './api-client';\nimport { Button } from '@repo/ui';\nexport const root = [App, ApiProvider, Button];\n",
  [`${WEB}/App.tsx`]: "import { todos } from './routes/todos';\nexport const App = todos;\n",
  [`${WEB}/api-client/index.ts`]:
    "import type { AppRouter } from '@repo/api';\nexport const ApiProvider = 1;\nexport type Router = AppRouter;\n",
  [`${WEB}/routes/todos/index.ts`]:
    "import { ApiProvider } from '../../api-client';\nimport { nameInput } from '../../features/name-input';\nimport { Button } from '@repo/ui';\nexport const todos = [ApiProvider, nameInput, Button];\n",
  [`${WEB}/routes/settings/index.ts`]: 'export const settings = 1;\n',
  [`${WEB}/features/name-input/index.ts`]:
    "import { Button } from '@repo/ui';\nexport const nameInput = Button;\n",
  [`${WEB}/features/status/index.ts`]: 'export const status = 1;\n',
  'packages/ui/package.json':
    '{ "name": "@repo/ui", "private": true, "type": "module", "exports": { ".": "./src/index.ts" } }\n',
  'packages/ui/src/index.ts': 'export const Button = 1;\n',
  'apps/api/package.json':
    '{ "name": "@repo/api", "private": true, "type": "module", "exports": { ".": { "types": "./src/router.ts" } } }\n',
  [`${API}/server.ts`]:
    "import { createServer } from 'node:http';\nimport { appRouter } from './router.ts';\nexport const server = [createServer, appRouter];\n",
  [`${API}/router.ts`]:
    "import { todosRouter } from './features/todos/index.ts';\nimport { router } from './trpc.ts';\nexport const appRouter = router(todosRouter);\nexport type AppRouter = typeof appRouter;\n",
  [`${API}/trpc.ts`]: 'export const router = (value: unknown) => value;\n',
  [`${TODOS}/index.ts`]: "export { todosRouter } from './procedures.ts';\n",
  [`${TODOS}/procedures.ts`]:
    "import type { Todo } from './domain.ts';\nimport { addTodo } from './application.ts';\nimport { router } from '../../trpc.ts';\nexport const todosRouter = router((name: string): Todo => addTodo(name));\n",
  [`${TODOS}/application.ts`]:
    "import { formatTitle, type Todo } from './domain.ts';\nimport { remember } from './integrations.ts';\nexport const addTodo = (name: string): Todo => ({ message: formatTitle(remember(name)) });\n",
  [`${TODOS}/domain.ts`]:
    'export interface Todo { readonly message: string }\nexport const formatTitle = (name: string) => "Hello, " + name;\n',
  [`${TODOS}/integrations.ts`]:
    "import type { Todo } from './domain.ts';\nexport const remember = (name: string) => { void fetch('https://example.com'); return name; };\nexport type Remembered = Todo;\n",
};

/** The workspace links pnpm would create, so `@repo/*` resolves as it does in the repo. */
const WORKSPACE_LINKS = {
  'node_modules/@repo/api': 'apps/api',
  'node_modules/@repo/ui': 'packages/ui',
};

interface ArchitectureReport {
  boundary_violations?: { from_zone: string; to_zone: string }[];
  boundary_coverage_violations?: { path: string }[];
  policy_violations?: { pack: string; rule_id: string }[];
}

/** Writes the layout plus `seed` into a temporary repo with the real Fallow config and rule pack. */
function withSeededRepository<Result>(
  seed: Record<string, string>,
  run: (directory: string) => Result,
) {
  const directory = mkdtempSync(join(tmpdir(), 'fallow-contract-'));
  try {
    ['.fallowrc.jsonc', 'pnpm-workspace.yaml', RULE_PACK].forEach((path) => {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      copyFileSync(join(REPOSITORY_ROOT, path), join(directory, path));
    });
    Object.entries({ ...LAYOUT, ...seed }).forEach(([path, source]) => {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), source);
    });
    Object.entries(WORKSPACE_LINKS).forEach(([link, target]) => {
      mkdirSync(dirname(join(directory, link)), { recursive: true });
      symlinkSync(join(directory, target), join(directory, link));
    });
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * Runs the real Fallow architecture gate over the layout plus `seed`. Fallow
 * checks rule-pack calls and imports in files an entry point reaches, so each
 * policy seed edits a reachable file; `fallow audit` fails an unreachable one.
 */
function architectureGate(seed: Record<string, string> = {}) {
  return withSeededRepository(seed, (directory) => {
    const run = spawnSync(FALLOW_BIN, ['architecture', '-q', '--format', 'json'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const report: ArchitectureReport = JSON.parse(run.stdout);
    return {
      status: run.status,
      findings: [
        ...(report.boundary_violations ?? []).map(
          ({ from_zone, to_zone }) => `boundary ${from_zone} -> ${to_zone}`,
        ),
        ...(report.boundary_coverage_violations ?? []).map(({ path }) => `coverage ${path}`),
        ...(report.policy_violations ?? []).map(({ pack, rule_id }) => `policy ${pack}/${rule_id}`),
      ].sort(),
    };
  });
}

describe('Fallow contract over the reference result', () => {
  jest.setTimeout(30_000);

  it('passes the clean layout, including fetch in an integration and Node IO in the api root', () => {
    expect(architectureGate()).toEqual({ status: 0, findings: [] });
  });

  it.each([
    ['value', "import { rule } from './domain.ts';\nexport const stored = rule();\n", 1],
    [
      'type',
      "import type { Item } from './domain.ts';\nexport const stored: Item = { id: 1 };\n",
      0,
    ],
  ])('checks an integration importing its own domain by %s', (_kind, source, status) => {
    expect(
      architectureGate({
        [`${API}/features/x/domain.ts`]:
          'export interface Item { id: number }\nexport const rule = () => ({ id: 1 });\n',
        [`${API}/features/x/integrations.ts`]: source,
      }),
    ).toEqual({
      status,
      findings: status === 0 ? [] : ['boundary api-integrations -> api-domain'],
    });
  });

  it.each([
    [
      'a route imports another route',
      `${WEB}/routes/todos/index.ts`,
      "import { settings } from '../settings';\nexport const todos = settings;\n",
      'boundary web-routes/todos -> web-routes/settings',
    ],
    [
      'a feature imports a route',
      `${WEB}/features/status/index.ts`,
      "import { settings } from '../../routes/settings';\nexport const status = settings;\n",
      'boundary web-features -> web-routes/settings',
    ],
    [
      'the app imports a feature',
      `${WEB}/App.tsx`,
      "import { todos } from './routes/todos';\nimport { status } from './features/status';\nexport const App = [todos, status];\n",
      'boundary web-app -> web-features',
    ],
    [
      'the api client value-imports the router',
      `${WEB}/api-client/index.ts`,
      "import { appRouter } from '@repo/api';\nexport const ApiProvider = appRouter;\n",
      'boundary web-api-client -> api-app',
    ],
    [
      'a route value-imports the router',
      `${WEB}/routes/todos/index.ts`,
      "import { appRouter } from '@repo/api';\nimport { ApiProvider } from '../../api-client';\nimport { nameInput } from '../../features/name-input';\nimport { Button } from '@repo/ui';\nexport const todos = [appRouter, ApiProvider, nameInput, Button];\n",
      'boundary web-routes/todos -> api-app',
    ],
    [
      'the api root value re-exports domain code',
      `${API}/router.ts`,
      "import { todosRouter } from './features/todos/index.ts';\nimport { router } from './trpc.ts';\nexport { formatTitle } from './features/todos/domain.ts';\nexport const appRouter = router(todosRouter);\nexport type AppRouter = typeof appRouter;\n",
      'boundary api-app -> api-domain',
    ],
    [
      'a route type-imports a sibling route',
      `${WEB}/routes/todos/index.ts`,
      "import type { settings } from '../settings';\nexport type Settings = typeof settings;\nexport const todos = 1;\n",
      'boundary web-routes/todos -> web-routes/settings',
    ],
    [
      'a ui primitive imports the api client',
      'packages/ui/src/index.ts',
      "import { ApiProvider } from '../../../apps/web/src/api-client';\nexport const Button = ApiProvider;\n",
      'boundary ui -> web-api-client',
    ],
    [
      'a ui primitive type-imports the api client',
      'packages/ui/src/index.ts',
      "import type { ApiProvider } from '../../../apps/web/src/api-client';\nexport type Provider = typeof ApiProvider;\nexport const Button = 1;\n",
      'boundary ui -> web-api-client',
    ],
    [
      'a ui primitive type-imports the api router',
      'packages/ui/src/index.ts',
      "import type { AppRouter } from '../../../apps/api/src/router.ts';\nexport type Router = AppRouter;\nexport const Button = 1;\n",
      'boundary ui -> api-app',
    ],
    [
      'procedures call domain code',
      `${TODOS}/procedures.ts`,
      "import { formatTitle } from './domain.ts';\nimport { router } from '../../trpc.ts';\nexport const todosRouter = router(formatTitle);\n",
      'boundary api-procedures -> api-domain',
    ],
    [
      'the api root imports application logic',
      `${API}/router.ts`,
      "import { addTodo } from './features/todos/application.ts';\nimport { router } from './trpc.ts';\nexport const appRouter = router(addTodo);\nexport type AppRouter = typeof appRouter;\n",
      'boundary api-app -> api-application',
    ],
    [
      'the domain imports application logic',
      `${TODOS}/domain.ts`,
      "import { addTodo } from './application.ts';\nexport interface Todo { readonly message: string }\nexport const formatTitle = (name: string) => String(addTodo) + name;\n",
      'boundary api-domain -> api-application',
    ],
    [
      'an integration imports application logic',
      `${TODOS}/integrations.ts`,
      "import { addTodo } from './application.ts';\nexport const remember = (name: string) => String(addTodo) + name;\n",
      'boundary api-integrations -> api-application',
    ],
  ])('fails when %s', (_label, path, source, finding) => {
    expect(architectureGate({ [path]: source })).toEqual({ status: 1, findings: [finding] });
  });

  it.each([
    [
      'a route type-imports the api package',
      `${WEB}/routes/settings/index.ts`,
      "import type { AppRouter } from '@repo/api';\nexport const settings = 1;\nexport type Router = AppRouter;\n",
    ],
    [
      'the domain type-imports application logic',
      `${TODOS}/domain.ts`,
      "import type { addTodo } from './application.ts';\nexport interface Todo { readonly message: string }\nexport type AddTodo = typeof addTodo;\nexport const formatTitle = (name: string) => 'Hello, ' + name;\n",
    ],
    [
      'an integration type-imports application logic',
      `${TODOS}/integrations.ts`,
      "import type { addTodo } from './application.ts';\nexport const remember = (name: string) => name;\nexport type AddTodo = typeof addTodo;\n",
    ],
    [
      'the api root type-imports application logic',
      `${API}/router.ts`,
      "import { todosRouter } from './features/todos/index.ts';\nimport type { addTodo } from './features/todos/application.ts';\nimport { router } from './trpc.ts';\nexport const appRouter = router(todosRouter);\nexport type AppRouter = typeof appRouter;\nexport type AddTodo = typeof addTodo;\n",
    ],
    [
      'the app type-imports a feature',
      `${WEB}/App.tsx`,
      "import { todos } from './routes/todos';\nimport type { status } from './features/status';\nexport type Status = typeof status;\nexport const App = todos;\n",
    ],
    [
      'a feature type-imports a route',
      `${WEB}/features/status/index.ts`,
      "import type { settings } from '../../routes/settings';\nexport type Settings = typeof settings;\nexport const status = 1;\n",
    ],
    [
      'the api root re-exports a domain type',
      `${API}/router.ts`,
      "import { todosRouter } from './features/todos/index.ts';\nimport { router } from './trpc.ts';\nexport type { Todo } from './features/todos/domain.ts';\nexport const appRouter = router(todosRouter);\nexport type AppRouter = typeof appRouter;\n",
    ],
  ])('passes when %s, a type-only import between roles', (_label, path, source) => {
    expect(architectureGate({ [path]: source })).toEqual({ status: 0, findings: [] });
  });

  it.each([
    [
      'a loose file directly under features composes several features',
      `${WEB}/features/loose.ts`,
      "import { status } from './status';\nimport { nameInput } from './name-input';\nexport const loose = [status, nameInput];\n",
    ],
    [
      'a loose file sits directly under routes',
      `${WEB}/routes/loose.ts`,
      'export const loose = 1;\n',
    ],
    ['the api grows a stray layer', `${API}/utils/format.ts`, 'export const format = 1;\n'],
    [
      'the api hides a stray layer in an etc folder',
      `${API}/etc/format.ts`,
      'export const format = 1;\n',
    ],
    ['the web app grows a stray layer', `${WEB}/utils/format.ts`, 'export const format = 1;\n'],
    ['a new package appears', 'packages/kit/src/index.ts', 'export const kit = 1;\n'],
  ])('fails when %s, a file outside every role', (_label, path, source) => {
    expect(architectureGate({ [path]: source })).toEqual({
      status: 1,
      findings: [`coverage ${path}`],
    });
  });

  it.each([
    [
      'the domain imports tRPC',
      `${TODOS}/domain.ts`,
      "import { initTRPC } from '@trpc/server';\nexport interface Todo { readonly message: string }\nexport const formatTitle = (name: string) => String(initTRPC) + name;\n",
      ['policy contract/domain-pure'],
    ],
    [
      'the domain imports Effect',
      `${TODOS}/domain.ts`,
      "import { Schema } from 'effect';\nexport interface Todo { readonly message: string }\nexport const formatTitle = (name: string) => String(Schema) + name;\n",
      ['policy contract/domain-pure'],
    ],
    [
      'the domain loads Node through createRequire',
      `${TODOS}/domain.ts`,
      "import { createRequire } from 'node:module';\nexport interface Todo { readonly message: string }\nexport const formatTitle = (name: string) => String(createRequire) + name;\n",
      ['policy contract/domain-pure'],
    ],
    [
      'application logic imports tRPC',
      `${TODOS}/application.ts`,
      "import { TRPCError } from '@trpc/server';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => ({ message: formatTitle(String(TRPCError) + name) });\n",
      ['policy contract/application-without-trpc'],
    ],
    [
      'application logic calls fetch',
      `${TODOS}/application.ts`,
      "import { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => { void fetch('https://example.com'); return { message: formatTitle(name) }; };\n",
      ['policy contract/effects-in-integrations', 'policy contract/io-effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program',
      `${TODOS}/application.ts`,
      "import { Effect } from 'effect';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => ({ message: formatTitle(Effect.runSync(Effect.succeed(name))) });\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program through a namespace import',
      `${TODOS}/application.ts`,
      "import * as E from 'effect/Effect';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => ({ message: formatTitle(E.runSync(E.succeed(name))) });\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program through a named import',
      `${TODOS}/application.ts`,
      "import { runPromiseExit, succeed } from 'effect/Effect';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => { void runPromiseExit(succeed(name)); return { message: formatTitle(name) }; };\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program with services through Effect 4 runPromiseWith',
      `${TODOS}/application.ts`,
      "import { Context, Effect } from 'effect';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => { void Effect.runPromiseWith(Context.empty())(Effect.succeed(name)); return { message: formatTitle(name) }; };\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program through a named Effect 4 runSyncWith import',
      `${TODOS}/application.ts`,
      "import { runSyncWith, succeed } from 'effect/Effect';\nimport { Context } from 'effect';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => ({ message: formatTitle(runSyncWith(Context.empty())(succeed(name))) });\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic runs an Effect program through a ManagedRuntime',
      `${TODOS}/application.ts`,
      "import { Effect, Layer, ManagedRuntime } from 'effect';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => { void ManagedRuntime.make(Layer.empty).runPromise(Effect.succeed(name)); return { message: formatTitle(name) }; };\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic makes a ManagedRuntime through a named import',
      `${TODOS}/application.ts`,
      "import { make } from 'effect/ManagedRuntime';\nimport { Layer } from 'effect';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => ({ message: formatTitle(name + String(make(Layer.empty))) });\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic calls globalThis.fetch',
      `${TODOS}/application.ts`,
      "import { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => { void globalThis.fetch('https://example.com'); return { message: formatTitle(name) }; };\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'application logic imports Node DNS',
      `${TODOS}/application.ts`,
      "import { lookup } from 'node:dns';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => ({ message: formatTitle(name + String(lookup)) });\n",
      ['policy contract/node-io-in-integrations'],
    ],
    [
      'application logic opens an HTTPS request',
      `${TODOS}/application.ts`,
      "import { request } from 'node:https';\nimport { formatTitle, type Todo } from './domain.ts';\nexport const addTodo = (name: string): Todo => { request('https://example.com'); return { message: formatTitle(name) }; };\n",
      ['policy contract/io-effects-in-integrations', 'policy contract/node-io-in-integrations'],
    ],
    [
      'a procedure imports Node file IO',
      `${TODOS}/procedures.ts`,
      "import { readFileSync } from 'node:fs';\nimport { addTodo } from './application.ts';\nimport { router } from '../../trpc.ts';\nexport const todosRouter = router(() => addTodo(String(readFileSync)));\n",
      ['policy contract/node-io-in-integrations'],
    ],
    [
      'a route calls fetch',
      `${WEB}/routes/todos/index.ts`,
      "export const todos = fetch('/trpc/todos.list');\n",
      ['policy contract/effects-in-integrations', 'policy contract/io-effects-in-integrations'],
    ],
    [
      'a route calls self.fetch',
      `${WEB}/routes/todos/index.ts`,
      "export const todos = self.fetch('/trpc/todos.list');\n",
      ['policy contract/effects-in-integrations'],
    ],
    [
      'a route wires its own tRPC client',
      `${WEB}/routes/todos/index.ts`,
      "import { createTRPCClient } from '@trpc/client';\nexport const todos = createTRPCClient;\n",
      ['policy contract/trpc-client-in-api-client'],
    ],
    [
      'a feature imports the tRPC server',
      `${WEB}/features/name-input/index.ts`,
      "import { TRPCError } from '@trpc/server';\nexport const nameInput = TRPCError;\n",
      ['policy contract/trpc-server-off-the-web'],
    ],
    [
      'a ui primitive imports TanStack Query',
      'packages/ui/src/index.ts',
      "import { useQuery } from '@tanstack/react-query';\nexport const Button = useQuery;\n",
      ['policy contract/ui-without-logic'],
    ],
    [
      'a ui primitive imports React Hook Form',
      'packages/ui/src/index.ts',
      "import { useForm } from 'react-hook-form';\nexport const Button = useForm;\n",
      ['policy contract/ui-without-logic'],
    ],
  ])('fails when %s', (_label, path, source, findings) => {
    expect(architectureGate({ [path]: source })).toEqual({ status: 1, findings });
  });

  it('applies the rule pack to a showcase result, which the workspace lists', () => {
    const showcase = 'showcase/x/api';
    const todo = `${showcase}/src/features/todo`;
    const seed = {
      [`${showcase}/package.json`]:
        '{ "name": "@showcase/x-api", "private": true, "type": "module", "exports": { ".": { "types": "./src/router.ts" } } }\n',
      [`${showcase}/src/router.ts`]:
        "import { todoRouter } from './features/todo/index.ts';\nexport const appRouter = todoRouter;\n",
      [`${todo}/index.ts`]: "export { todoRouter } from './procedures.ts';\n",
      [`${todo}/procedures.ts`]:
        "import { addTodo } from './application.ts';\nexport const todoRouter = addTodo;\n",
      [`${todo}/application.ts`]:
        "import { formatTodo } from './domain.ts';\nexport const addTodo = (title: string) => formatTodo(title);\n",
      [`${todo}/domain.ts`]:
        "import { initTRPC } from '@trpc/server';\nexport const formatTodo = (title: string) => String(initTRPC) + title;\n",
    };
    expect(architectureGate(seed)).toEqual({
      status: 1,
      findings: ['policy contract/domain-pure'],
    });
  });

  it('fails a fallow-ignore suppression that gives no reason', () => {
    const seed = {
      [`${WEB}/routes/todos/index.ts`]:
        "import { ApiProvider } from '../../api-client';\n// fallow-ignore-next-line boundary-violation\nimport { settings } from '../settings';\nexport const todos = [ApiProvider, settings];\n",
    };
    const result = withSeededRepository(seed, (directory) =>
      spawnSync(FALLOW_BIN, ['dead-code', '--stale-suppressions', '-q'], {
        cwd: directory,
        encoding: 'utf8',
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('suppression is missing a reason');
  });
});
