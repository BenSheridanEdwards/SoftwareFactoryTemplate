/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, matchesGlob, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import policy, { colourLiterals, siblingTypes } from '../tooling/oxlint-plugin-policy.js';
import { findNegativePhrasing, findSlop } from './check-doc-phrasing.mjs';

const ROOT = resolve(__dirname, '..');
const command = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts['lint:policy'];
const oxlintCommand = command.split(' && ')[0];
interface Diagnostic {
  code: string;
  severity: string;
  message: string;
  filename: string;
}
interface Fixture {
  path: string;
  caseRoot?: string;
  source: string;
  code?: string;
  codes?: string[];
  message?: string;
  messageContains?: string;
  reactOnly?: boolean;
}
const policyPaths = [
  'apps/web/src/App.tsx',
  'apps/api/src/router.ts',
  'packages/ui/src/Button.tsx',
  'showcase/todo-01/web/src/App.tsx',
  'showcase/todo-01/api/src/features/todo/procedures.ts',
];
const roots = [
  'apps/web',
  'apps/api',
  'packages/ui',
  'showcase/todo-01/web',
  'showcase/todo-01/api',
];
const longComment = '// one\n// two\n// three\n// four\n// five';
const policyFixtures: Fixture[] = [
  ...[
    ['deletion', 'delete value.name;'],
    ['push', 'items.push(value);'],
    ['pop', 'items.pop();'],
    ['shift', 'items.shift();'],
    ['unshift', 'items.unshift(value);'],
    ['splice', 'items.splice(0, 1);'],
    ['fill', 'items.fill(value);'],
    ['copyWithin', 'items.copyWithin(0, 1);'],
    ['assign', 'Object.assign(target, source);'],
  ].map(([name, source]) => ({
    path: `apps/api/src/mutation-${name}.ts`,
    source: source ?? '',
    code: 'policy(no-mutation)',
  })),
  { path: 'apps/api/src/newObject.ts', source: 'const value = Object.assign({}, source);' },
  {
    path: 'apps/api/src/collections.ts',
    source:
      'collection.set(key, value); collection.add(value); collection.delete(key); collection.clear();',
  },
  { path: 'apps/api/src/computed.ts', source: "items['push'](value);" },
  {
    path: 'apps/api/src/classExpression.ts',
    source: 'const value = class {};',
    code: 'policy(no-classes)',
  },
  { path: 'apps/api/src/this.ts', source: 'const value = this;', code: 'policy(no-classes)' },
  {
    path: 'apps/api/src/tagged.ts',
    source: "class NotFound extends Schema.TaggedErrorClass<NotFound>()('NotFound', {}) {}",
  },
  {
    path: 'apps/web/src/features/ownership/useItems.ts',
    source: 'function useItems(items) { items.splice(0, 1); }',
    codes: ['policy(no-mutation)', 'react-doctor(no-prop-callback-in-render)'],
  },
  {
    path: 'apps/web/src/features/ownership/useComputedItems.ts',
    source: "function useComputedItems(items) { items['splice'](0, 1); }",
    codes: [
      'react-doctor(no-mutating-array-method-on-prop-or-hook-result)',
      'react-doctor(no-prop-callback-in-render)',
    ],
  },
  {
    path: 'apps/web/src/features/ownership/integrations.ts',
    source: 'function useItems(items) { items.splice(0, 1); }',
    codes: [
      'react-doctor(no-mutating-array-method-on-prop-or-hook-result)',
      'react-doctor(no-prop-callback-in-render)',
    ],
  },
  ...roots.flatMap((root) => [
    { path: `${root}/src/binding.ts`, source: 'let value = 1;', code: 'policy(no-let)' },
    { path: `${root}/src/constant.ts`, source: 'const value = 1;' },
    {
      path: `${root}/src/mutate.ts`,
      source: 'const value = {}; value.name = 1;',
      code: 'policy(no-mutation)',
    },
    { path: `${root}/src/immutable.ts`, source: 'const value = { ...other, name: 1 };' },
    { path: `${root}/src/plainClass.ts`, source: 'class Value {}', code: 'policy(no-classes)' },
    { path: `${root}/src/function.ts`, source: 'function value() { return {}; }' },
    {
      path: `${root}/src/branch.ts`,
      source: 'switch (value) { case 1: break; }',
      code: 'policy(no-switch)',
    },
    { path: `${root}/src/lookup.ts`, source: 'const value = { one: 1 }[key];' },
  ]),
  { path: 'apps/api/src/ref.ts', source: 'const ref = {}; ref.current = 1;' },
  { path: 'apps/api/src/framework.ts', source: 'class NotFound extends Error {}' },
  { path: 'apps/api/src/mutation.ts', source: 'const value = 1;' },
  { path: 'apps/api/src/mutation.test.ts', source: 'const value = {}; value.name = 1;' },
  { path: 'apps/api/src/mutation.spec.ts', source: 'const value = {}; value.name = 1;' },
  {
    path: 'apps/api/src/features/example/integrations.ts',
    source: 'const value = {}; value.name = 1;',
  },
  {
    path: 'apps/api/src/features/example/integrations/client.ts',
    source: 'const value = {}; value.name = 1;',
  },
  ...policyPaths.map((path) => {
    const component = path.endsWith('.tsx');
    const api = path.includes('/api/');
    return {
      path,
      source: `${longComment}
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import value from '../../../../../../outside';
useState(0);
function useBrokenForm() { return useForm(); }
${api ? 'procedure.input(schema);' : ''}
${
  component
    ? `export function Wrong({ save }: { save: () => void }) {
  function saveValue() { return save(); }
  return <button aria-label="Save" />;
}
function ExtraPage() { return <p />; }`
    : 'export function useWrong() {}'
}
`,
      codes: [
        'policy(no-large-comments)',
        'policy(state-and-effects-in-hooks)',
        'policy(form-uses-effect-schema)',
        'policy(slice-isolation)',
        'react-hooks(rules-of-hooks)',
        ...(api ? ['policy(procedure-input-schema)'] : []),
        ...(component
          ? [
              'policy(one-component-per-file)',
              'policy(handler-names)',
              'policy(callback-prop-names)',
              'policy(pages-in-routes)',
              'policy(file-matches-export)',
              ...(path.includes('packages/ui') ? [] : ['policy(use-ui-primitives)']),
            ]
          : ['policy(file-matches-export)']),
      ],
    };
  }),
  ...roots.flatMap((root) => [
    {
      path: `${root}/src/routes/slop/useSlop.ts`,
      source:
        'declare const useQuery: () => { data: string; isError: boolean };\nexport function useSlop() {\n  const list = useQuery();\n  return { text: list.data, failed: list.isError };\n}\n',
      code: 'policy(one-status-from-hooks)',
    },
    {
      path: `${root}/src/routes/slop/limit.ts`,
      source:
        "export const MAX_LENGTH = 100;\nexport const TOO_LONG = 'Use 100 characters or fewer';\n",
      code: 'policy(message-uses-its-limit)',
    },
    {
      path: `${root}/src/routes/slop/reexport.ts`,
      source: "export type { Slop } from './slop';\n",
      code: 'policy(import-types-from-their-owner)',
    },
    {
      path: `${root}/src/routes/slop/keep.ts`,
      source:
        'export const saved = (save: () => Promise<void>) => save().catch(() => undefined);\n',
      code: 'policy(keep-rejections)',
    },
    {
      path: `${root}/src/routes/slop/slop.ts`,
      source: 'export interface Slop {\n  readonly id: string;\n}\n',
    },
    {
      path: `${root}/src/routes/slop/slop.test.ts`,
      source:
        "interface Slop {\n  readonly id: string;\n}\nexport const id = (found?: Slop) => found?.id ?? '';\n",
      codes: ['policy(test-imports-the-type)', 'policy(test-unwraps-values)'],
    },
  ]),
  ...roots.flatMap((root) => [
    {
      path: `${root}/src/BadFolder/value.ts`,
      source: 'export const value = 1;',
      code: 'policy(folder-names)',
    },
    {
      path: `${root}/src/utils/value.ts`,
      source: 'export const value = 1;',
      code: 'policy(role-named-folders)',
    },
    {
      path: `${root}/src/missing.test.ts`,
      source: 'export const value = 1;',
      code: 'policy(test-beside-subject)',
    },
    {
      path: `${root}/src/export.ts`,
      source: 'export function useWrong() {}',
      code: 'policy(file-matches-export)',
    },
    {
      path: `${root}/src/ceilings.ts`,
      source: `${longComment}\nif (a) { if (b) { if (c) { if (d) { if (e) { work(); } } } } }`,
      codes: ['policy(no-large-comments)', 'eslint(max-depth)'],
    },
  ]),
  ...[
    '/* one\n two\n three\n four\n five */',
    '/**\n * one\n * two\n * three\n */',
    '// one\n/* two */\n// three\n/* four */\n// five',
    '/* one */\n/* two */\n/* three */\n/* four */\n/* five */',
    'work(); // one\n// two\n// three\n// four\n// five',
  ].map((source, index) => ({
    path: `apps/web/src/comment${index}.ts`,
    source,
    code: 'policy(no-large-comments)',
    messageContains: '4 lines or fewer',
  })),
  {
    path: 'apps/web/src/separated.ts',
    source:
      '// one\n// two\n// three\n// four\nwork();\n/* one\n two\n three\n four */\n\n// separate\nwork(); // another\nwork(); // separate again',
  },
  {
    path: 'apps/web/src/disabled.ts',
    source: `/* ${'eslint'}-disable policy/no-large-comments */\n\n${longComment}`,
    code: 'policy(no-large-comments)',
  },
  {
    path: 'apps/web/src/Fixture.tsx',
    source: `export function Fixture() { return <Badge />; }\n// ${'eslint'}-disable-next-line policy/one-component-per-file -- a stated reason\nfunction Badge() { return <span />; }`,
    code: 'policy(one-component-per-file)',
  },
  ...['apps/web', 'showcase/todo-01/web'].flatMap((root) => [
    ...[
      '<button aria-label="Save" />',
      '<input aria-label="Name" />',
      '<input type="text" aria-label="Name" />',
      '<input type="checkbox" {...props} />',
      'React.createElement("input", { type: "checkbox", [key]: "text" })',
      'make("button", {})',
      'React.createElement("input", { type: "text" })',
      'React.createElement("input", { type: "checkbox", ...props })',
    ].map((control, index) => ({
      path: `${root}/src/control${index}.tsx`,
      source: `import React, { createElement as make } from 'react'; const control = ${control};`,
      code: 'policy(use-ui-primitives)',
    })),
    {
      path: `${root}/src/allowed.tsx`,
      source: `import { Button, TextField } from '@repo/ui';
const controls = [<Button />, <TextField label="Name" />, <input type="checkbox" aria-label="Done" />, <input type={'radio'} aria-label="Choice" />];`,
    },
  ]),
  { path: 'packages/ui/src/native.tsx', source: 'const control = <button aria-label="Save" />;' },
  ...['apps/web', 'packages/ui', 'showcase/todo-01/web'].flatMap((root) => [
    ...[
      'w-[13px]',
      'bg-[#fff]',
      '[mask:none]',
      'data-[open]:p-4',
      'w-(--x)',
      'bg-(--color-ink)',
    ].map((value, index) => ({
      path: `${root}/src/arbitrary${index}.tsx`,
      source: `const view = <p className="p-4 ${value}">Hi</p>;`,
      codes: [value, ...colourLiterals(value)].map(() => 'policy(no-arbitrary-styles)'),
      messageContains: `\`${value}\``,
    })),
    {
      path: `${root}/src/inline.tsx`,
      source: 'const view = <p style={{ margin: 0 }}>Hi</p>;',
      code: 'policy(no-arbitrary-styles)',
      message:
        'Style with Tailwind classes on the theme scale; remove the inline `style` prop (ADR 0114).',
    },
    ...['#0b1020', '#FFF', 'rgb(0 0 0)', 'oklch(0.5 0.1 200)'].map((value, index) => ({
      path: `${root}/src/colour${index}.tsx`,
      source: `const view = <p className={'p-4 ${value}'}>Hi</p>;`,
      code: 'policy(no-arbitrary-styles)',
      messageContains: 'colour literal',
    })),
    {
      path: `${root}/src/template.tsx`,
      source:
        'const view = (wide: boolean) => <p className={`p-4 $' +
        '{wide ? "w-full" : ""} w-[13px]`}>Hi</p>;',
      codes: ['policy(no-arbitrary-styles)', 'policy(no-arbitrary-styles)'],
    },
    {
      path: `${root}/src/constant.tsx`,
      source:
        "import { cn } from '@repo/ui';\nconst CARD = cn('p-4 w-(--x)');\nconst view = <p className={cn(CARD, 'flex')}>Hi</p>;",
      code: 'policy(no-arbitrary-styles)',
    },
    {
      path: `${root}/src/chained.tsx`,
      source:
        "import { cn } from '@repo/ui';\nconst BASE = cn('bg-[#fff]');\nconst CARD = cn(BASE, 'p-4');\nconst view = <p class={CARD}>Hi</p>;",
      codes: [
        'policy(no-arbitrary-styles)',
        'policy(no-arbitrary-styles)',
        'react-doctor(no-unknown-property)',
      ],
    },
    {
      path: `${root}/src/scale.tsx`,
      source: [
        "import { cn } from '@repo/ui';",
        "const ISSUE = 'Issue #123';",
        "const field = form.querySelector('input[name=email]');",
        "const path = 'items[0]';",
        "const NOTE = 'w-[13px] #fff rgb(0 0 0) w-(--x)';",
        "const CARD = cn('mx-auto max-w-160 p-4 text-ink hover:bg-raised sm:py-12');",
        'const view = <p className={CARD} title={ISSUE}>Pick #add or #bead, item [a b]</p>;',
      ].join('\n'),
    },
  ]),
  { path: 'apps/api/src/brackets.ts', source: "export const message = 'w-[13px] #fff';" },
  {
    path: 'apps/web/src/inline.test.tsx',
    source: "const view = <p style={{ margin: 0 }} className='w-[13px]'>Hi</p>;",
  },
  { path: 'apps/web/src/App.test.tsx', source: 'const control = <button aria-label="Save" />;' },
];
const contractFixtures: Fixture[] = [
  ...[
    ['todos/TodosPage.tsx', "import { ArchivePage } from '../archive';"],
    ['archive/ArchivePage.tsx', "import { TodosPage } from '../todos';"],
  ].flatMap(([file, crossing], index) => {
    const path = `apps/web/src/routes/${file}`;
    const source = file.startsWith('todos/')
      ? readFileSync(join(ROOT, path), 'utf8')
      : 'export function ArchivePage() {\n  return <p>archive</p>;\n}\n';
    return [
      { caseRoot: `contract-route-clean-${index}`, path, source },
      {
        caseRoot: `contract-route-cross-${index}`,
        path,
        source: `${source}\n${crossing}\n`,
        code: 'policy(slice-isolation)',
      },
    ];
  }),
  ...[
    "import { archiveTodo } from '../archive/domain.ts';",
    "import { archiveRouter } from '../archive/index.ts';",
  ].map((source, index) => ({
    caseRoot: `contract-todos-source-${index}`,
    path: 'apps/api/src/features/todos/application.ts',
    source: `${readFileSync(join(ROOT, 'apps/api/src/features/todos/application.ts'), 'utf8')}\n${source}\n`,
    code: 'policy(slice-isolation)',
  })),
  {
    path: 'apps/api/src/features/todos/application.ts',
    source: readFileSync(join(ROOT, 'apps/api/src/features/todos/application.ts'), 'utf8'),
  },
  ...['domain.ts', 'index.ts'].map((entry) => ({
    caseRoot: `contract-todos-${entry}`,
    path: 'apps/api/src/features/archive/application.ts',
    source: `import { value } from '../todos/${entry}';`,
    code: 'policy(slice-isolation)',
  })),
  {
    path: 'apps/api/src/todos-consumer.ts',
    source: "import { todosRouter } from './features/todos/procedures.ts';",
    code: 'eslint(no-restricted-imports)',
  },
  {
    path: 'apps/api/src/todos-public.ts',
    source: "import { todosRouter } from './features/todos/index.ts';",
  },
  ...[
    ['an alias', "export { useQuery as useQ } from '@tanstack/react-query';"],
    ['everything', "export * from 'react-hook-form';"],
  ].map(([_label, source]) => ({
    path: 'apps/web/src/routes/todos/hooks.ts',
    source: source,
    codes: ['policy(state-and-effects-in-hooks)', 'policy(import-types-from-their-owner)'],
  })),
  ...[
    ['a route imports another route', 'apps/web/src/routes/a/A.tsx', "import { B } from '../b';"],
    [
      'a backend feature imports another feature',
      'apps/api/src/features/a/application.ts',
      "import { formatB } from '../b/domain.ts';",
    ],
    [
      'a web feature imports another feature',
      'apps/web/src/features/a/useA.ts',
      "import { b } from '../b/b';",
    ],
    [
      'a showcase route imports another route',
      'showcase/todo-01/web/src/routes/a/A.tsx',
      "import { B } from '../b';",
    ],
    ['a route requires another route', 'apps/web/src/routes/a/a.ts', "const b = require('../b');"],
    [
      'a route imports another route through a template literal',
      'apps/web/src/routes/a/a.ts',
      'const b = import(`../b`);',
    ],
    [
      'a route import-equals another route',
      'apps/web/src/routes/a/a.ts',
      "import b = require('../b');",
    ],
    [
      'a relative import leaves its package',
      'apps/web/src/routes/a/A.tsx',
      "import type { AppRouter } from '../../../../api/src/router.ts';",
    ],
  ].map(([_label, filename, source]) => ({
    path: filename,
    source: `${source}\nexport const value = 1;\n`,
    code: 'policy(slice-isolation)',
  })),
  ...[
    ['apps/web/src/features/loose.ts'],
    ['apps/web/src/routes/loose.ts'],
    ['apps/api/src/features/loose.ts'],
    ['showcase/todo-01/web/src/features/loose.ts'],
  ].map(([filename]) => ({
    path: filename,
    source: "import { a } from './a';\nimport { b } from './b';\nexport const loose = [a, b];\n",
    code: 'policy(slice-isolation)',
    messageContains: 'into a folder of its own',
  })),
  {
    path: 'apps/web/src/routes/todos/value.ts',
    source: [
      "import { Button } from '@repo/ui';",
      "import { useTrpc } from '../../api-client';",
      "import { nameInput } from '../../features/name-input';",
      "import { todoFormSchema } from './todoFormSchema';",
      'export const value = [Button, useTrpc, nameInput, todoFormSchema];',
    ].join('\n'),
  },
  ...[
    ['a cast instead of a schema', '.input((value) => value as { name: string })'],
    ['a bare Effect schema', '.input(addInputSchema)'],
    ['another standard schema', '.input(z.object({ name: z.string() }))'],
    ['a cast through a computed member', "['input']((value) => value as { name: string })"],
    ['the Effect 3 adapter', '.input(Schema.standardSchemaV1(addInputSchema))'],
  ].map(([_label, input]) => ({
    path: 'apps/api/src/features/todos/procedures.ts',
    source: `
import { Schema } from 'effect';
import { z } from 'zod';
import { procedure } from '../../trpc.ts';
const addInputSchema = Schema.Struct({ name: Schema.String });
export const add = procedure${input}.query(({ input }) => input);
export const unused = [z, addInputSchema];
`,
    code: 'policy(procedure-input-schema)',
  })),
  {
    path: 'apps/api/src/features/todos/procedures.ts',
    source: `
import * as Schema from 'effect/Schema';
import { procedure } from '../../trpc.ts';
const addInputSchema = Schema.Struct({ name: Schema.String });
export const add = procedure.input(Schema.toStandardSchemaV1(addInputSchema)).query(({ input }) => input);
`,
  },
  {
    path: 'apps/api/src/features/todos/procedures.ts',
    source: `
import { Schema } from 'effect';
import { procedure } from '../../trpc.ts';
const addInputSchema = Schema.Struct({ name: Schema.String });
export const add = procedure.input(Schema.toStandardSchemaV1(addInputSchema)).query(({ input }) => input);
`,
  },
  ...[
    ['no options', 'useForm()'],
    ['no resolver', "useForm({ defaultValues: { name: '' } })"],
    ['another resolver', 'useForm({ resolver: zodResolver(schema) })'],
    ['options built elsewhere', 'useForm(options)'],
    [
      'a spread after the resolver',
      'useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema)), ...options })',
    ],
    [
      'a standard schema not built by Effect',
      'useForm({ resolver: standardSchemaResolver(schema) })',
    ],
    [
      'a resolver that submits the raw input',
      'useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(schema), undefined, { raw: true }) })',
    ],
    ['the Effect 3 resolver', 'useForm({ resolver: effectTsResolver(schema) })'],
  ].map(([_label, call]) => ({
    path: 'apps/web/src/routes/todos/useNameForm.ts',
    source: `
import { effectTsResolver } from '@hookform/resolvers/effect-ts';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Schema } from 'effect';
import { useForm } from 'react-hook-form';
declare const schema: never;
declare const options: never;
export function useNameForm() {
  return [${call}, zodResolver, effectTsResolver, standardSchemaResolver, Schema];
}
`,
    code: 'policy(form-uses-effect-schema)',
  })),
  {
    path: 'apps/web/src/routes/todos/useTodoForm.ts',
    source: `
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';
export function useTodoForm() {
  return useForm({
    resolver: standardSchemaResolver(Schema.toStandardSchemaV1(todoFormSchema)),
    defaultValues: { name: '' },
  });
}
`,
  },
  {
    path: 'apps/web/src/routes/todos/useTodoForm.ts',
    source: `
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { toStandardSchemaV1 } from 'effect/Schema';
import { useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';
export function useTodoForm() {
  return useForm({
    resolver: standardSchemaResolver(toStandardSchemaV1(todoFormSchema)),
    defaultValues: { name: '' },
  });
}
`,
  },
  ...[
    ['useQuery', '@tanstack/react-query', 'useQuery(options);'],
    ['useSuspenseQuery', '@tanstack/react-query', 'useSuspenseQuery(options);'],
    ['useInfiniteQuery', '@tanstack/react-query', 'useInfiniteQuery(options);'],
    ['useQueries', '@tanstack/react-query', 'useQueries(options);'],
    ['useSuspenseQueries', '@tanstack/react-query', 'useSuspenseQueries(options);'],
    ['useSuspenseInfiniteQuery', '@tanstack/react-query', 'useSuspenseInfiniteQuery(options);'],
    ['useMutation', '@tanstack/react-query', 'useMutation(options);'],
    ['useMutationState', '@tanstack/react-query', 'useMutationState(options);'],
    ['useTransition', 'react', 'useTransition();'],
    ['useForm', 'react-hook-form', 'useForm(options);'],
    ['useFieldArray', 'react-hook-form', 'useFieldArray(options);'],
    ['useController', 'react-hook-form', 'useController(options);'],
    ['useWatch', 'react-hook-form', 'useWatch(options);'],
    ['useFormState', 'react-hook-form', 'useFormState(options);'],
  ].map(([hook, source, call]) => ({
    path: 'apps/web/src/routes/todos/TodosPage.tsx',
    source: `
import { ${hook} } from '${source}';
declare const options: never;
export function TodosPage() {
  ${call}
  return <p>todos</p>;
}
`,
    codes: [
      'policy(state-and-effects-in-hooks)',
      ...(hook === 'useForm' ? ['policy(form-uses-effect-schema)'] : []),
    ],
  })),
  {
    path: 'apps/web/src/routes/todos/useTodos.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useTodos() {
  return useQuery(options);
}
`,
  },
].map((fixture, index) => ({ ...fixture, caseRoot: `contract-${index}` }));
const statusMessage = (hook: string, fields: string, root: string) =>
  `Return one \`status\` union from \`${hook}\` in place of ${fields} from \`${root}\`, for example \`{ status: 'loading' } | { status: 'failed' } | { status: 'loaded'; todos }\`, so the page renders exactly one state.`;
const presentMessage = (expression: string) =>
  `Unwrap \`${expression}\` with \`present(${expression})\`, a Jest global that an E2E spec imports from \`./fixtures\`, so a missing value fails the test here instead of standing in as \`''\`.`;
const unwrapMessage = (expression: string) =>
  `Unwrap \`${expression}\` with \`unwrap(${expression})\`, a Jest global, so a failure fails the test here with its problem instead of standing in as \`''\`.`;
const subject = (caseRoot: string, path: string, source = 'export const value = 1;\n') => ({
  caseRoot,
  path,
  source,
});
const slopFixtures: Fixture[] = [
  // policy/one-status-from-hooks: r5, r4 and regen rebuilds, then the reference shape.
  {
    path: 'apps/web/src/routes/todos/useTodos.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useTodos() {
  const list = useQuery(options);
  return { todos: list.data, loadFailed: list.isError, failure: null };
}
`,
    code: 'policy(one-status-from-hooks)',
    message: statusMessage('useTodos', '`data`, `isError`', 'list'),
  },
  {
    path: 'apps/web/src/routes/todos/useTodos.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useTodos() {
  const list = useQuery(options);
  const todos = list.data ?? [];
  return { todos, loading: list.isPending };
}
`,
    code: 'policy(one-status-from-hooks)',
    messageContains: '`data`, `isPending` from `list`',
  },
  {
    path: 'apps/web/src/routes/greeting/useGreeting.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export const useGreeting = () => {
  const query = useQuery(options);
  return { message: query.data?.message, failed: query.isError };
};
`,
    code: 'policy(one-status-from-hooks)',
    messageContains: 'from `useGreeting`',
  },
  // r7 and r8 map the query's status through a lookup object.
  {
    path: 'apps/web/src/routes/todos/useTodos.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
const LIST_STATES = { pending: 'loading', error: 'failed', success: 'loaded' } as const;
export function useTodos() {
  const list = useQuery(options);
  const todos = list.data ?? [];
  return { todos, listState: LIST_STATES[list.status] };
}
`,
    code: 'policy(one-status-from-hooks)',
    message: statusMessage('useTodos', '`data`, `status`', 'list'),
  },
  {
    path: 'apps/web/src/routes/todos/useTodos.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
const LIST_STATUS = { pending: 'loading', error: 'failed', success: 'ready' } as const;
type ListStatus = (typeof LIST_STATUS)[keyof typeof LIST_STATUS];
export function useTodos() {
  const list = useQuery(options);
  const listStatus: ListStatus = LIST_STATUS[list.status];
  return { todos: list.data ?? [], listStatus };
}
`,
    code: 'policy(one-status-from-hooks)',
    message: statusMessage('useTodos', '`data`, `status`', 'list'),
  },
  {
    path: 'apps/web/src/routes/todos/useSuspenseTodos.ts',
    source: `
import { useInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query';
declare const options: never;
declare const trpc: { todos: { list: { useQuery: () => { data: string[]; isError: boolean } } } };
export function useSuspenseTodos() {
  const list = useSuspenseQuery(options);
  return { loading: list.isPending, failed: list.isError };
}
function usePages() {
  const pages = useInfiniteQuery(options);
  return { pages: pages.data, done: pages.isSuccess };
}
function useClassic() {
  const list = trpc.todos.list.useQuery();
  return { todos: list.data, failed: list.isError };
}
export const hooks = [usePages, useClassic];
`,
    codes: [
      'policy(one-status-from-hooks)',
      'policy(one-status-from-hooks)',
      'policy(one-status-from-hooks)',
    ],
  },
  // Reads that are not two states of one query pass.
  {
    path: 'apps/web/src/routes/todos/useRefreshing.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useRefreshing() {
  const list = useQuery(options);
  return { list: list.data, refreshing: list.isFetching };
}
`,
  },
  {
    path: 'apps/web/src/routes/todos/useSave.ts',
    source: `
import { useMutation } from '@tanstack/react-query';
declare const options: never;
export function useSave() {
  const save = useMutation(options);
  return { submitting: save.isPending, problem: save.error, saved: save.data, failed: save.isError };
}
`,
  },
  {
    path: 'apps/web/src/routes/todos/useListStatus.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useListStatus() {
  const list = useQuery(options);
  return { status: list.status, problem: list.error };
}
`,
  },
  {
    path: 'apps/web/src/routes/todos/useFlatList.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
type View = { status: 'loading'; data: undefined } | { status: 'loaded'; data: string[] };
declare const toView: (query: unknown) => View;
export function useFlatList() {
  const view = toView(useQuery(options));
  return { status: view.status, data: view.data };
}
`,
  },
  {
    path: 'apps/web/src/routes/todos/useStatus.ts',
    source: `
export const useStatus = (list: { status: string; data: string[] }) => ({
  status: list.status,
  todos: list.data,
});
`,
  },
  // Each name resolves in its own scope, not to a same-named binding elsewhere.
  {
    path: 'apps/web/src/routes/todos/useShadowed.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function earlier(list: { data: string[] }) {
  const todos = list.data;
  return todos;
}
export function useShadowed(todos: string[]) {
  const list = useQuery(options);
  return { todos, failed: list.isError };
}
function useSummary(list: { data: string[]; isError: boolean }) {
  return { todos: list.data, failed: list.isError };
}
export const hooks = [useSummary];
`,
  },
  {
    path: 'apps/web/src/routes/todos/useOwnScope.ts',
    source: `
import { useQuery } from '@tanstack/react-query';
declare const options: never;
export function useOwnScope() {
  const list = useQuery(options);
  const todos = list.data;
  return { todos, failed: list.isError };
}
export function later(todos: string[]) {
  const list = { data: todos, isError: false };
  return list;
}
`,
    code: 'policy(one-status-from-hooks)',
    message: statusMessage('useOwnScope', '`data`, `isError`', 'list'),
  },
  {
    path: 'apps/web/src/routes/todos/useTodos.ts',
    source: `
import { useMutation, useQuery } from '@tanstack/react-query';
declare const options: never;
type TodoList = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; todos: string[] };
function toTodoList(query: { data: string[] | undefined; isError: boolean }): TodoList {
  if (query.data) {
    return { status: 'loaded', todos: query.data };
  }
  return query.isError ? { status: 'failed' } : { status: 'loading' };
}
function summary(query: { data: string[]; isError: boolean }) {
  return { todos: query.data, failed: query.isError };
}
export function useTodos() {
  const list = useQuery(options);
  const add = useMutation(options);
  return {
    list: toTodoList(list),
    busy: [add].some((change) => change.isPending),
    saving: add.isPending,
    count: list.data?.length,
    summary,
  };
}
`,
  },
  {
    caseRoot: 'slop-status-test',
    path: 'apps/web/src/routes/todos/useTodos.test.ts',
    source:
      'export function useFake(list: { data: string; isError: boolean }) {\n  return { todos: list.data, failed: list.isError };\n}\n',
  },
  subject('slop-status-test', 'apps/web/src/routes/todos/useTodos.ts'),
  // policy/test-unwraps-values: the reference's api test and E2E spec, then present() and unwrap().
  {
    caseRoot: 'slop-unwrap-api',
    path: 'apps/api/src/features/todos/application.test.ts',
    source: `
declare const addTodo: (input: { title: string }) => { ok: true; value: { id: string } } | { ok: false };
const added = addTodo({ title: 'Second' });
export const id = added.ok ? added.value.id : '';
export const ids = ['First'].map((title) => {
  const next = addTodo({ title });
  return !next.ok ? '' : next.value.id;
});
export const first = ids[0] ?? '';
`,
    codes: [
      'policy(test-unwraps-values)',
      'policy(test-unwraps-values)',
      'policy(test-unwraps-values)',
    ],
    message: unwrapMessage('added'),
  },
  subject('slop-unwrap-api', 'apps/api/src/features/todos/application.ts'),
  {
    path: 'apps/web/e2e/todos.spec.ts',
    source: `
declare const setDoneThroughApi: (id: string) => Promise<void>;
declare const second: { id: string } | undefined;
export const done = setDoneThroughApi(second?.id ?? '');
`,
    code: 'policy(test-unwraps-values)',
    message: presentMessage('second?.id'),
  },
  {
    path: 'showcase/todo-01/web/e2e/todos.spec.ts',
    source: "declare const id: string | undefined;\nexport const value = id ?? '';\n",
    code: 'policy(test-unwraps-values)',
  },
  {
    caseRoot: 'slop-unwrap-valid',
    path: 'apps/api/src/features/todos/application.test.ts',
    source: `
declare const present: <Value>(value: Value | null | undefined) => Value;
declare const unwrap: <Value>(outcome: { ok: true; value: Value } | { ok: false }) => Value;
declare const added: { ok: true; value: { id: string } } | { ok: false };
declare const ids: string[];
declare const message: string | undefined;
declare const response: { ok: boolean; status: number };
declare const other: { value: string };
export const id = unwrap(added).id;
export const fallback = added.ok ? added.value.id : undefined;
export const verdict = response.ok ? 'passed' : 'failed';
export const code = !response.ok ? '' : response.status;
export const elsewhere = response.ok ? other.value : '';
export const first = present(ids[0]);
export const shown = message ?? 'waiting';
`,
  },
  subject('slop-unwrap-valid', 'apps/api/src/features/todos/application.ts'),
  {
    path: 'apps/api/src/features/todos/fallback.ts',
    source: "declare const id: string | undefined;\nexport const value = id ?? '';\n",
  },
  {
    path: 'apps/web/e2e/fixtures.ts',
    source: "export { expect, type Page } from '@playwright/test';\n",
  },
  // policy/test-imports-the-type: the reference's page test, then an imported type.
  {
    caseRoot: 'slop-type-page',
    path: 'apps/web/src/routes/todos/TodosPage.test.tsx',
    source: `
interface Todo {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}
export const todos: readonly Todo[] = [];
`,
    code: 'policy(test-imports-the-type)',
    message:
      'Import `Todo` from `./useTodos` in place of this copy, so the test follows the real shape when it changes.',
  },
  subject('slop-type-page', 'apps/web/src/routes/todos/TodosPage.tsx'),
  subject(
    'slop-type-page',
    'apps/web/src/routes/todos/useTodos.ts',
    'export type Todo = { id: string; title: string; done: boolean };\nexport const useTodos = () => [];\n',
  ),
  {
    caseRoot: 'slop-type-api',
    path: 'apps/api/src/features/todos/procedures.test.ts',
    source:
      "type Problem = { kind: string };\nexport const problem: Problem = { kind: 'not-found' };\n",
    code: 'policy(test-imports-the-type)',
    messageContains: 'Import `Problem` from `./domain.ts`',
  },
  subject('slop-type-api', 'apps/api/src/features/todos/procedures.ts'),
  subject(
    'slop-type-api',
    'apps/api/src/features/todos/domain.ts',
    'export interface Problem {\n  readonly kind: string;\n}\n',
  ),
  // Only a declaration at the start of a line exports a type; text in strings and comments does not.
  {
    caseRoot: 'slop-type-text',
    path: 'apps/web/src/routes/todos/TodosPage.test.tsx',
    source: `
interface Todo {
  readonly id: string;
}
type Problem = { readonly message: string };
export const cases: readonly [Todo, Problem] = [{ id: '1' }, { message: 'Enter a title' }];
`,
  },
  subject('slop-type-text', 'apps/web/src/routes/todos/TodosPage.tsx'),
  subject(
    'slop-type-text',
    'apps/web/src/routes/todos/useTodos.ts',
    "// export type Problem = string;\nexport const sample = 'export interface Todo { id: string }';\nexport const useTodos = () => [];\n",
  ),
  // Each test in a folder reads the same scan of its siblings.
  ...['TodoItem', 'TodoList'].map((name) => ({
    caseRoot: 'slop-type-folder',
    path: `apps/web/src/routes/todos/${name}.test.tsx`,
    source: "type Todo = { readonly id: string };\nexport const todo: Todo = { id: '1' };\n",
    code: 'policy(test-imports-the-type)',
  })),
  subject('slop-type-folder', 'apps/web/src/routes/todos/TodoItem.tsx'),
  subject('slop-type-folder', 'apps/web/src/routes/todos/TodoList.tsx'),
  subject(
    'slop-type-folder',
    'apps/web/src/routes/todos/useTodos.ts',
    'export type Todo = { id: string };\nexport const useTodos = () => [];\n',
  ),
  {
    caseRoot: 'slop-type-valid',
    path: 'apps/web/src/routes/todos/TodosPage.test.tsx',
    source: `
import type { Todo } from './useTodos';
interface Harness {
  readonly todos: readonly Todo[];
}
export const harness: Harness = { todos: [] };
`,
  },
  subject('slop-type-valid', 'apps/web/src/routes/todos/TodosPage.tsx'),
  subject(
    'slop-type-valid',
    'apps/web/src/routes/todos/useTodos.ts',
    'export type Todo = { id: string };\nexport const useTodos = () => [];\n',
  ),
  // policy/message-uses-its-limit: r5's api domain and web schema, then the reference.
  {
    path: 'apps/api/src/features/todos/domain.ts',
    source: `
const MAX_TITLE_LENGTH = 100;
export const TITLE_MESSAGES = { tooLong: 'Use 100 characters or fewer', blank: 'Enter a title' };
export const fits = (title: string) => title.length <= MAX_TITLE_LENGTH;
`,
    code: 'policy(message-uses-its-limit)',
    message:
      'Interpolate `MAX_TITLE_LENGTH` into this text in place of 100, so the message changes with the limit.',
  },
  {
    path: 'apps/web/src/routes/todos/todoFormSchema.ts',
    source:
      'export const TITLE_MAX_LENGTH = 100;\nexport const tooLong = (count: number) => `Use 100 characters or fewer, not $' +
      '{count}`;\n',
    code: 'policy(message-uses-its-limit)',
  },
  {
    path: 'apps/web/src/routes/todos/limits.ts',
    source: `
export const TITLE_MAX_LENGTH = 100;
const RETRIES = 3;
export const tooLong = \`Use \${TITLE_MAX_LENGTH} characters or fewer\`;
export const retry = 'Try 3 times, up to 1000 items or 100ms';
export const used = RETRIES;
`,
  },
  {
    path: 'apps/web/src/routes/todos/itemLimit.ts',
    source: `
export const MAX_ITEMS = 1000;
export const maxTitleLength = 80;
export const tooMany = 'Keep 1,000 items or fewer';
export const tooLong = \`Use 80 characters, not \${maxTitleLength + 1}\`;
`,
    codes: ['policy(message-uses-its-limit)', 'policy(message-uses-its-limit)'],
    message:
      'Interpolate `MAX_ITEMS` into this text in place of 1000, so the message changes with the limit.',
  },
  {
    path: 'apps/web/src/routes/todos/LimitHint.tsx',
    source: `
export const MAX_LENGTH = 100;
export function LimitHint() {
  return <p>Up to 100 characters</p>;
}
`,
    code: 'policy(message-uses-its-limit)',
  },
  // A number that is not a limit, or not a count of words, passes.
  {
    path: 'apps/web/src/routes/todos/Layout.tsx',
    source: `
import { readings } from './100 readings';
export const COLUMNS = 10;
export const ICON_SIZE = 24;
export const MAX_PERCENT = 100;
export const PORT = 3000;
export const PAGE_SIZE = 20;
export const MAX_LENGTH = 50;
export const done = '100% done';
export const url = 'http://localhost:3000/api';
export const audience = 'Ages 20 and over';
export const hint = 'gap-10 p-4';
export function Layout() {
  return (
    <div className="grid gap-10 p-4" title={readings}>
      <svg viewBox="0 0 24 24" aria-label="An icon" />
      <span title="Up to 50 characters" />
    </div>
  );
}
`,
  },
  {
    caseRoot: 'slop-limit-test',
    path: 'apps/api/src/features/todos/domain.test.ts',
    source: "const LIMIT = 100;\nexport const expected = ['Use 100 characters or fewer', LIMIT];\n",
  },
  subject('slop-limit-test', 'apps/api/src/features/todos/domain.ts'),
  // policy/import-types-from-their-owner: r6's application, then the slice's index.ts.
  {
    path: 'apps/api/src/features/todos/application.ts',
    source: "export type { Outcome, Problem } from './domain.ts';\nexport const value = 1;\n",
    code: 'policy(import-types-from-their-owner)',
    message:
      'Import `Outcome, Problem` straight from `./domain.ts` and remove this re-export; a slice re-exports only from its `index.ts`.',
  },
  {
    path: 'apps/web/src/routes/todos/types.ts',
    source: "export * from './useTodos';\n",
    code: 'policy(import-types-from-their-owner)',
    messageContains: 'Import each name you need straight from `./useTodos`',
  },
  {
    path: 'apps/api/src/features/todos/procedures.ts',
    source:
      "import type { Todo } from './domain.ts';\nconst local = 1;\nexport type { Todo };\nexport { local };\n",
    code: 'policy(import-types-from-their-owner)',
    messageContains: 'Import `Todo` straight from `./domain.ts`',
  },
  {
    path: 'apps/api/src/features/todos/index.ts',
    source: "export { todosRouter } from './procedures.ts';\n",
  },
  {
    path: 'apps/web/src/api-client/trpc.ts',
    source: "export { useQuery } from '@tanstack/react-query';\n",
    code: 'policy(state-and-effects-in-hooks)',
  },
  {
    path: 'apps/web/src/routes/todos/useTodoFilter.ts',
    source: "export type Filter = 'all' | 'done';\nconst all: Filter = 'all';\nexport { all };\n",
  },
  // policy/keep-rejections: r2, r4 and the greeting reference, then a handled failure.
  {
    path: 'apps/web/src/routes/todos/useSucceeded.ts',
    source:
      'export const succeeded = (change: Promise<unknown>) => change.then(() => true, () => false);\n',
    code: 'policy(keep-rejections)',
    message:
      'Handle the failure where it shows (`onError`, a `failure` state) and let the promise reject; returning `false` hides the error from callers and tests.',
  },
  {
    path: 'apps/web/src/routes/todos/useCreate.ts',
    source: `
const succeeded = () => true;
const failed = () => false;
export const create = (save: () => Promise<void>) => save().then(succeeded, failed);
`,
    code: 'policy(keep-rejections)',
  },
  {
    path: 'apps/web/src/routes/greeting/useRecord.ts',
    source: `
declare const record: { mutateAsync: (input: { name: string }) => Promise<void> };
export const recordName = (name: string) => record.mutateAsync({ name }).catch(() => undefined);
export const quiet = (save: () => Promise<void>) => save().catch((_error: unknown) => null);
export const empty = (save: () => Promise<void>) => save().catch(function ignore() {
  return;
});
`,
    codes: ['policy(keep-rejections)', 'policy(keep-rejections)', 'policy(keep-rejections)'],
    messageContains: 'returning `undefined`',
  },
  {
    path: 'apps/web/src/routes/todos/useHandled.ts',
    source: `
declare const report: (error: unknown) => void;
declare const setFailure: (message: string) => void;
export const handled = (save: () => Promise<void>) => [
  save().catch((error: Error) => setFailure(error.message)),
  save().catch(report),
  save().then(() => true),
  save().then(() => true, (error: unknown) => report(error)),
];
`,
  },
  // A handler resolves in its own scope, not to a same-named binding elsewhere.
  {
    path: 'apps/web/src/routes/todos/useScopedHandlers.ts',
    source: `
export function quiet(save: () => Promise<void>) {
  const handle = () => undefined;
  return save().catch(handle);
}
export function loud(save: () => Promise<void>, report: (error: unknown) => void) {
  const handle = (error: unknown) => report(error);
  return save().catch(handle);
}
`,
    code: 'policy(keep-rejections)',
  },
  {
    path: 'apps/web/src/routes/todos/useGivenHandler.ts',
    source: `
export function fallback() {
  const handle = () => false;
  return handle;
}
export function given(save: () => Promise<void>, handle: (error: unknown) => void) {
  return save().catch(handle);
}
`,
  },
  // An ignored rejection that is meant: settle the promise and read the result.
  {
    path: 'apps/web/src/routes/todos/usePrefetch.ts',
    source: `
declare const prefetch: () => Promise<void>;
declare const save: () => Promise<void>;
export const warm = () => void Promise.allSettled([prefetch()]);
export const saved = () => Promise.allSettled([save()]).then(([result]) => result?.status === 'fulfilled');
`,
  },
  {
    caseRoot: 'slop-keep-test',
    path: 'apps/web/src/routes/todos/useHandled.test.ts',
    source:
      'export const settled = (save: () => Promise<void>) => save().catch(() => undefined);\n',
  },
  subject('slop-keep-test', 'apps/web/src/routes/todos/useHandled.ts'),
].map((fixture, index) => ({ ...fixture, caseRoot: fixture.caseRoot ?? `slop-${index}` }));
const mutation = 'function f(item) { item.x = 1; }';
const componentFixtures: Fixture[] = [
  {
    path: 'apps/web/src/features/policy/Fixture.tsx',
    source: `
export function Fixture() {
  return <Badge />;
}
function Badge() {
  return <span>new</span>;
}
`,
    code: 'policy(one-component-per-file)',
    messageContains: 'Move `Badge` into its own file',
  },
  ...[
    ["import { useState } from 'react';", 'useState(0);'],
    ["import { useEffect } from 'react';", 'useEffect(() => {}, []);'],
    ["import { useReducer as useStore } from 'react';", 'useStore((x: number) => x, 0);'],
    ["import * as React from 'react';", 'React.useLayoutEffect(() => {}, []);'],
    ["import { useActionState } from 'react';", 'useActionState(async (x: number) => x, 0);'],
  ].map(([importLine, call]) => ({
    path: 'apps/web/src/features/policy/Fixture.tsx',
    source: `
${importLine}
export function Fixture() {
  ${call}
  return <p>state</p>;
}
`,
    code: 'policy(state-and-effects-in-hooks)',
  })),
  {
    path: 'apps/web/src/features/policy/useTitle.ts',
    source: `
import { useEffect, useState } from 'react';
export function useTitle(title: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return { count, handleIncrement: () => setCount((current) => current + 1) };
}
`,
    codes: ['eslint(no-restricted-globals)', 'policy(no-mutation)'],
  },
  ...[
    'const save = () => onSave();',
    'const save = React.useCallback(() => onSave(), [onSave]);',
  ].map((handler) => ({
    path: 'apps/web/src/features/policy/Fixture.tsx',
    source: `
${handler.includes('React.') ? "import * as React from 'react';\n" : ''}import { Button } from '@repo/ui';
export function Fixture({ onSave }: { onSave: () => void }) {
  ${handler}
  return <Button type="button" onClick={save}>Save</Button>;
}
`,
    code: 'policy(handler-names)',
  })),
  {
    path: 'apps/web/src/features/policy/Fixture.tsx',
    source: `
import { Button } from '@repo/ui';
interface FixtureProps {
  label: string;
  onSave: () => void;
}
export function Fixture({ label, onSave }: FixtureProps) {
  const handleClick = () => onSave();
  return <Button type="button" onClick={handleClick}>{label}</Button>;
}
`,
  },
  ...[
    ['export function Fixture({ save }: { save: () => void }) {', '}'],
    [
      'interface FixtureProps { save(): void }\nexport function Fixture({ save }: FixtureProps) {',
      '}',
    ],
    [
      'type FixtureProps = { label: string } & { save?: () => void };\nexport function Fixture({ save }: FixtureProps) {',
      '};',
    ],
    [
      'interface Base { save(): void }\ninterface FixtureProps extends Base { label: string }\nexport function Fixture({ save }: FixtureProps) {',
      '};',
    ],
    [
      "import type { FC } from 'react';\ninterface FixtureProps { save: () => void }\nexport const Fixture: FC<FixtureProps> = ({ save }) => {",
      '};',
    ],
  ].map(([header, ending]) => ({
    path: 'apps/web/src/features/policy/Fixture.tsx',
    source: `
${header}
  const Button = 'button';
  return <Button type="button" onClick={save}>Save</Button>;
${ending}
`,
    code: 'policy(callback-prop-names)',
  })),
  {
    path: 'apps/web/src/features/policy/Fixture.tsx',
    source: `
import type { ReactNode } from 'react';
interface FixtureProps {
  renderItem: (item: string) => ReactNode;
  children: (open: boolean) => ReactNode;
}
export function Fixture({ renderItem, children }: FixtureProps) {
  return <ul>{renderItem('one')}{children(true)}</ul>;
}
`,
  },
  ...[
    'apps/web/src/features/settings/SettingsPage.tsx',
    'apps/web/src/features/settings/src/routes/SettingsPage.tsx',
    'apps/web/src/routes/settings/SettingsPage.tsx',
  ].map((path) => ({
    path,
    source: path.includes('/features/settings/src/')
      ? 'export function SettingsPage() {\n  return <main>settings</main>;\n}'
      : `
export function SettingsPage() {
  return <main>settings</main>;
}
`,
    code: path.includes('/features/') ? 'policy(pages-in-routes)' : undefined,
  })),
  ...[
    ['apps/web/src/features/policy/Widget.tsx', 'export function Fixture() {\n  return <p />;\n}'],
    ['apps/web/src/features/policy/hooks.ts', 'export function useFixture() {\n  return 1;\n}'],
  ].map(([path, source]) => ({ path, source, code: 'policy(file-matches-export)' })),
  {
    path: 'apps/web/src/features/ThresholdCounter/Fixture.tsx',
    source: 'export function Fixture() {\n  return <p />;\n}',
    code: 'policy(folder-names)',
  },
  {
    path: 'apps/web/src/features/policy/__tests__/value.ts',
    source: 'export const value = 1;',
  },
  ...[
    ['apps/web/src/routes/todos/utils/x.ts', 'src/routes/todos/utils'],
    ['apps/web/src/features/name-input/helpers/x.ts', 'src/features/name-input/helpers'],
    ['apps/api/src/features/todos/lib/x.ts', 'src/features/todos/lib'],
    ['packages/ui/src/common/x.ts', 'src/common'],
    ['showcase/todo-02/web/src/shared/x.ts', 'src/shared'],
    ['apps/web/src/routes/todos/parts/misc/x.ts', 'src/routes/todos/parts/misc'],
  ].map(([path, folder]) => ({
    path,
    source: 'export const x = 1;\n',
    code: 'policy(role-named-folders)',
    messageContains: `\`${folder}/\``,
  })),
  ...['packages/lib/src/x.ts', 'apps/web/src/features/shared-state/x.ts'].map((path) => ({
    path,
    source: 'export const x = 1;\n',
  })),
  ...[
    ['apps/web/src/routes/todos/Foo.test.tsx', 'apps/web/src/routes/todos/Foo'],
    ['apps/web/src/routes/todos/Missing.a11y.test.tsx', 'apps/web/src/routes/todos/Missing'],
    [
      'apps/web/src/routes/todos/__tests__/TodosPage.test.tsx',
      'apps/web/src/routes/todos/TodosPage',
    ],
  ].map(([path, subject]) => ({
    path,
    source: 'export const value = 1;\n',
    code: 'policy(test-beside-subject)',
    messageContains: `\`${subject}.ts\` or`,
  })),
  ...[
    'apps/api/src/features/todos/domain.test.ts',
    'packages/ui/src/Button.test.tsx',
    'apps/web/src/routes/todos/TodosPage.a11y.test.tsx',
    'showcase/todo-01/web/src/routes/todos/useTodos.test.tsx',
    'apps/api/src/features/todos/todo.schema.test.ts',
  ].map((path) => ({ path, source: 'export const value = 1;\n' })),
  {
    path: 'apps/api/src/features/todos/todo.other.test.ts',
    source: 'export const value = 1;\n',
    code: 'policy(test-beside-subject)',
    messageContains: '`apps/api/src/features/todos/todo.ts` or',
  },
  {
    path: 'apps/web/src/features/policy/Fixture.tsx',
    source: `
function Icon() {
  return <span>!</span>;
}
export function Fixture() {
  return <Icon />;
}
`,
    code: 'policy(one-component-per-file)',
    messageContains: 'Move `Icon` into its own file',
  },
  {
    path: 'apps/web/src/App.test.tsx',
    source: `
import { useState } from 'react';
export function Harness() {
  const [value, setValue] = useState(0);
  const bump = () => setValue(value + 1);
  return <button type="button" onClick={bump}>{value}</button>;
}
`,
  },
].map((fixture, index) => ({ ...fixture, caseRoot: `component-${index}` }));
const loops = [
  [
    'ForStatement',
    'for (;;) {}',
    'Prefer declarative iteration: map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of a for loop.',
  ],
  [
    'ForInStatement',
    'for (const key in value) {}',
    'Prefer Object.keys/Object.entries with map/filter/reduce/flatMap/some/every/find/Array.from instead of for...in.',
  ],
  [
    'ForOfStatement',
    'for (const value of values) {}',
    'Prefer map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of for...of.',
  ],
  [
    'WhileStatement',
    'while (value) {}',
    'Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of while.',
  ],
  [
    'DoWhileStatement',
    'do {} while (value);',
    'Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of do...while.',
  ],
];
// Oxlint-specific fixtures cover globals, preserve-manual-memoization, static-components
// and async use-memo: their React examples emit different or no native diagnostics.
// Source: oxc-project/oxc at oxlint_v1.89.0, crates/oxc_linter/src/rules/react/*.rs.
const reactFixtures: Fixture[] = [
  ...[
    [
      'rules-of-hooks',
      "import { useState } from 'react'; export function Toggle({ enabled }: { enabled: boolean }) { if (enabled) { useState(0); } return <p>toggle</p>; }",
      "import { useState } from 'react'; export function Toggle({ enabled }: { enabled: boolean }) { useState(0); return <p>{String(enabled)}</p>; }",
    ],
    [
      'exhaustive-deps',
      "import { useEffect } from 'react'; export function useCount(count) { useEffect(() => { console.log(count); }, []); }",
      "import { useEffect } from 'react'; export function useCount(count) { useEffect(() => { console.log(count); }, [count]); }",
    ],
    [
      'error-boundaries',
      'export function Fixture() { try { return <Child />; } catch (error) { return <div>Error</div>; } }',
      'export function Fixture() { return <ErrorBoundary><Child /></ErrorBoundary>; }',
    ],
    [
      'globals',
      'let someGlobal = false; function Component() { const setGlobal = () => { someGlobal = true; }; setGlobal(); return <div>{String(someGlobal)}</div>; }',
      'export function Fixture({ userId }) { return <div>{userId}</div>; }',
    ],
    [
      'immutability',
      'export function Fixture({ user }) { user.name = "Bob"; return <div>{user.name}</div>; }',
      'export function Fixture({ user }) { const updated = { ...user, name: "Bob" }; return <div>{updated.name}</div>; }',
    ],
    [
      'incompatible-library',
      "import { useForm } from 'react-hook-form'; export function useFixture() { const { watch } = useForm(); return watch('name'); }",
      'export function useFixture(name) { return name; }',
    ],
    [
      'preserve-manual-memoization',
      "import { useCallback } from 'react'; function useFoo(props) { const x = []; useHook(); x.push(props); return useCallback(() => { doSomething(); doSomethingElse(); return [x]; }, [x]); }",
      "import { useMemo } from 'react'; export function useFixture({ a, b }) { return useMemo(() => ({ a, b }), [a, b]); }",
    ],
    [
      'purity',
      'export function Fixture() { const ticket = Math.random(); return <p>{ticket}</p>; }',
      'export function Fixture({ ticket }) { return <p>{ticket}</p>; }',
    ],
    [
      'refs',
      "import { useRef } from 'react'; export function useFixture() { const ref = useRef(0); return ref.current; }",
      "import { useRef } from 'react'; export function useFixture() { return useRef(0); }",
    ],
    [
      'set-state-in-effect',
      "import { useEffect, useState } from 'react'; export function useMirror(value) { const [copy, setCopy] = useState(value); useEffect(() => { setCopy(value); }, [value]); return copy; }",
      'export function useMirror(value) { return value; }',
    ],
    [
      'set-state-in-render',
      "import { useState } from 'react'; export function useFixture(value) { const [count, setCount] = useState(0); setCount(value); return count; }",
      "import { useState } from 'react'; export function useFixture(value) { return useState(value); }",
    ],
    [
      'static-components',
      'function Example(props) { const Component = createComponent(); return <Component />; }',
      'export function Fixture() { return <div>Hello</div>; }',
    ],
    [
      'void-use-memo',
      "import { useMemo } from 'react'; export function useFixture(items) { return useMemo(() => { items.filter(Boolean); }, [items]); }",
      "import { useMemo } from 'react'; export function useFixture(items) { return useMemo(() => items.filter(Boolean), [items]); }",
    ],
    [
      'use-memo',
      "import { useMemo } from 'react'; function Component({ a }) { const x = useMemo(async () => { await a; }, [a]); return <div>{x}</div>; }",
      "import { useMemo } from 'react'; function Component({ a }) { const x = useMemo(() => a + 1, [a]); return <div>{x}</div>; }",
    ],
    [
      'unsupported-syntax',
      'export function Fixture() { const value = eval("1 + 1"); return <div>{value}</div>; }',
      'export function Fixture() { const value = 1 + 1; return <div>{value}</div>; }',
    ],
  ].flatMap(([rule, invalid, valid], index) => [
    {
      path: `apps/web/src/react${index}/Fixture.tsx`,
      source: invalid ?? '',
      code: `${['rules-of-hooks', 'exhaustive-deps'].includes(rule ?? '') ? 'react-hooks' : 'react'}(${rule})`,
      codes:
        rule === 'preserve-manual-memoization'
          ? ['react(preserve-manual-memoization)', 'react-hooks(exhaustive-deps)']
          : rule === 'use-memo'
            ? ['react(use-memo)', 'react(void-use-memo)']
            : undefined,
      reactOnly: true,
    },
    { path: `apps/web/src/react-valid${index}/Fixture.tsx`, source: valid ?? '', reactOnly: true },
  ]),
];
const fixtures: Fixture[] = [
  { path: 'apps/api/src/native.ts', source: 'const x = items.toSorted();' },
  {
    path: 'apps/api/src/native.test.ts',
    source: 'const x = items.sort();',
    code: 'unicorn(no-array-sort)',
  },
  ...[
    [
      'eslint(no-else-return)',
      'function f(a) { if (a) return 1; else if (a.b) return 2; }',
      'function f(a) { if (a) return 1; if (a.b) return 2; }',
    ],
    ['eslint(no-lonely-if)', 'if (a) f(); else { if (b) g(); }', 'if (a) f(); else if (b) g();'],
    ['eslint(no-nested-ternary)', 'const x = a ? b : c ? d : e;', 'const x = a ? b : c;'],
    [
      'unicorn(no-array-for-each)',
      'items.forEach(item => save(item));',
      'items.map(item => item.name);',
    ],
    ['unicorn(no-array-sort)', 'const x = items.sort();', 'const x = items.toSorted();'],
    ['unicorn(no-array-reverse)', 'const x = items.reverse();', 'const x = items.toReversed();'],
    [
      'unicorn(prefer-array-find)',
      'const x = items.filter(item => item.ok)[0];',
      'const x = items.find(item => item.ok);',
    ],
    [
      'unicorn(prefer-array-some)',
      'const x = items.filter(item => item.ok).length > 0;',
      'const x = items.some(item => item.ok);',
    ],
    [
      'unicorn(prefer-array-flat)',
      'const x = items.flatMap(item => item);',
      'const x = items.flat();',
    ],
    [
      'unicorn(prefer-object-from-entries)',
      'const x = items.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});',
      'const x = Object.fromEntries(items);',
    ],
    ['eslint(no-restricted-globals)', 'const x = document.title;', 'const x = title;'],
    [
      'eslint(no-restricted-globals)',
      'function f() { return window.location; }',
      'function f() { return location; }',
    ],
  ].flatMap(([code, invalid, valid], index) => [
    {
      path: `apps/api/src/native${index}.ts`,
      source: invalid ?? '',
      codes: [
        code,
        ...(['unicorn(no-array-sort)', 'unicorn(no-array-reverse)'].includes(code ?? '')
          ? ['policy(no-mutation)']
          : []),
      ],
    },
    { path: `apps/api/src/native-valid${index}.ts`, source: valid ?? '' },
  ]),
  {
    path: 'scripts/early-return.js',
    source: 'function f(a) { if (a) return 1; else return 2; }',
    code: 'eslint(no-else-return)',
  },
  {
    path: 'apps/web/src/main.tsx',
    source:
      'function start() { const root = document.getElementById("root"); window.start(root); }',
  },
  {
    path: 'showcase/x/web/src/main.tsx',
    source:
      'function start() { const root = document.getElementById("root"); window.start(root); }',
  },
  {
    path: 'apps/api/src/effect.ts',
    source: "import { Effect } from 'effect'; Effect.forEach(items, save);",
  },
  { path: 'scripts/array.ts', source: 'items.forEach(save); items.sort(); items.reverse();' },
  ...reactFixtures,
  {
    path: 'apps/web/src/useRemote.ts',
    source:
      "import { useEffect } from 'react'; export function useRemote() { useEffect(() => { void fetch('/api/service-status'); }, []); }",
    code: 'react-doctor(no-fetch-in-effect)',
  },
  {
    path: 'apps/web/src/Legacy.tsx',
    source:
      "import { Component } from 'react'; export class Legacy extends Component { render() { return <p>Hello</p>; } }",
    code: 'react-doctor(prefer-function-component)',
  },
  { path: 'apps/web/src/image.tsx', source: 'const image = <img src="photo.png" />;' },
  ...policyFixtures,
  ...contractFixtures,
  ...componentFixtures,
  ...slopFixtures,
  ...'ts tsx mts cts js jsx mjs cjs'.split(' ').flatMap((extension) => [
    { path: `scripts/mutation.${extension}`, source: mutation, code: 'eslint(no-param-reassign)' },
    { path: `scripts/copy.${extension}`, source: 'function f(item) { return { ...item, x: 1 }; }' },
  ]),
  ...loops.map(([name, source, message]) => ({
    path: `scripts/${name}.js`,
    source: source ?? '',
    code: 'policy(no-loops)',
    message: `[${name}] ${message}`,
  })),
  {
    path: 'scripts/await.js',
    source: 'async function f(values) { for await (const value of values) {} }',
  },
  ...['apps/web', 'apps/api', 'packages/ui', 'showcase/x/web', 'showcase/x/api'].flatMap((root) => [
    {
      path: `${root}/src/deep.ts`,
      source: 'function f() { if(a) { if(b) { if(c) { if(d) { if(e) { f(); } } } } } }',
      code: 'eslint(max-depth)',
    },
    {
      path: `${root}/src/shallow.ts`,
      source: 'function f() { if(a) { if(b) { if(c) { if(d) { f(); } } } } }',
    },
    ...[
      'features/todos/domain',
      'routes/todos/Page',
      'shared/name/value',
      'api-client/internal',
    ].map((specifier, index) => ({
      path: `${root}/src/import${index}.ts`,
      source: `import value from './${specifier}';`,
      code: 'eslint(no-restricted-imports)',
    })),
  ]),
  {
    path: 'apps/api/src/public.ts',
    source: "import { todosRouter } from './features/todos/index.ts';",
  },
  ...['scripts', 'tooling'].flatMap((root) => [
    {
      path: `${root}/literal.mjs`,
      source: "const value = '**';",
      code: 'policy(no-hand-written-globs)',
    },
    {
      path: `${root}/template.ts`,
      source: 'const value = `**/`;',
      code: 'policy(no-hand-written-globs)',
    },
  ]),
  { path: 'scripts/x.test.ts', source: "const value = '**'; const other = `**/`;" },
  { path: 'scripts/x.spec.ts', source: "const value = '**';" },
  { path: 'scripts/y.mjs', source: 'const value = `**$' + '{text}**`;' },
  { path: 'scripts/unused.ts', source: 'const unused = 1;' },
  { path: 'apps/web/dist/assets/index.js', source: 'while (true) {}' },
  { path: '.cache/types/apps/web/src/App.d.ts', source: 'while (true) {}' },
  {
    path: 'scripts/disable.js',
    source: `// eslint-disable-next-line no-param-reassign\n${mutation}`,
    code: 'eslint(no-param-reassign)',
  },
  {
    path: 'apps/web/src/nested.ts',
    source: mutation,
    codes: ['eslint(no-param-reassign)', 'policy(no-mutation)'],
  },
];
let directory: string;
let diagnostics: Diagnostic[];
let elapsed: number;
function write(path: string, source: string) {
  mkdirSync(dirname(join(directory, path)), { recursive: true });
  writeFileSync(join(directory, path), source);
}
function run(cwd: string, extra: string[] = []) {
  const [executable, ...args] = oxlintCommand.split(' ');
  return spawnSync(executable, [...args, '--format', 'json', ...extra], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(ROOT, 'node_modules/.bin')}:${process.env.PATH}` },
  });
}
function fixturePath({ path, caseRoot = '' }: Fixture) {
  return join(caseRoot, path);
}
function lintTree(cases: Fixture[]) {
  if (new Set(cases.map(fixturePath)).size !== cases.length)
    throw new Error('Duplicate fixture path');
  cases.forEach((fixture) => {
    write(fixturePath(fixture), fixture.source);
  });
  componentFixtures.forEach(({ caseRoot }) => {
    [
      ['apps/api/src/features/todos/domain.ts', 'export const value = 1;\n'],
      ['packages/ui/src/Button.tsx', 'export const value = 1;\n'],
      ['apps/web/src/routes/todos/TodosPage.tsx', 'export const value = 1;\n'],
      ['showcase/todo-01/web/src/routes/todos/useTodos.ts', 'export const useTodos = () => [];\n'],
      ['apps/api/src/features/todos/todo.schema.ts', 'export const schema = 1;\n'],
      ['apps/web/src/App.tsx', 'export const value = 1;\n'],
    ].forEach(([path, source]) => {
      write(join(caseRoot ?? '', path), source);
    });
  });
  write(
    'oxlint.config.ts',
    `import config from ${JSON.stringify(pathToFileURL(join(ROOT, 'oxlint.config.ts')).href)};
export default { ...config, overrides: config.overrides.map(override => ({
  ...override, files: override.files.flatMap(pattern => [pattern, "contract-*/" + pattern, "component-*/" + pattern, "slop-*/" + pattern])
})) };`,
  );
  write('apps/web/.oxlintrc.json', '{"rules":{"no-param-reassign":"off"}}');
  const started = performance.now();
  const result = run(directory);
  elapsed = performance.now() - started;
  expect(result.stderr).toBe('');
  expect(result.status).toBe(1);
  return JSON.parse(result.stdout).diagnostics.filter(
    ({ code }: Diagnostic) => !code.startsWith('better-tailwindcss('),
  );
}
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'oxlint-policy-'));
  diagnostics = lintTree(fixtures);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
it.each(fixtures)('$# $path has the expected policy diagnostics', ({
  path,
  caseRoot,
  code,
  codes,
  message,
  messageContains,
  reactOnly,
}) => {
  const found = diagnostics.filter(
    ({ filename, code }) =>
      filename.replaceAll('\\', '/').replace(`${directory}/`, '') ===
        fixturePath({ path, caseRoot, source: '' }) &&
      (!reactOnly || code.startsWith('react(') || code.startsWith('react-hooks(')),
  );
  expect(found.map(({ code: actual, severity }) => [actual, severity]).sort()).toEqual(
    (codes ?? (code ? [code] : [])).map((rule) => [rule, 'error']).sort(),
  );
  if (message) expect(found[0]?.message).toBe(message);
  if (messageContains)
    expect(found[0]?.message.replaceAll(`${caseRoot}/`, '')).toContain(messageContains);
  if (code === 'policy(role-named-folders)' && caseRoot?.startsWith('component-'))
    expect(found[0]?.message).toContain('`@repo/ui`');
});
it('turns on every policy rule at error in result roots', () => {
  const rules = Object.keys(policy.rules).filter(
    (rule) => !['no-loops', 'no-hand-written-globs'].includes(rule),
  );
  expect(rules).toHaveLength(25);
  roots.forEach((root) => {
    const applicable = rules.filter(
      (rule) =>
        (![
          'one-component-per-file',
          'handler-names',
          'callback-prop-names',
          'pages-in-routes',
        ].includes(rule) ||
          !root.endsWith('/api')) &&
        (rule !== 'use-ui-primitives' || (!root.endsWith('/api') && root !== 'packages/ui')) &&
        (rule !== 'procedure-input-schema' || root.endsWith('/api')) &&
        (rule !== 'no-arbitrary-styles' || !root.endsWith('/api')),
    );
    applicable.forEach((rule) => {
      expect(diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            filename: expect.stringContaining(`${root}/src/`),
            code: `policy(${rule})`,
            severity: 'error',
          }),
        ]),
      );
    });
  });
});
it('scans the type exports of a folder once until a file in it changes', () => {
  const folder = mkdtempSync(join(tmpdir(), 'sibling-types-'));
  try {
    writeFileSync(join(folder, 'useTodos.ts'), 'export type Todo = { id: string };\n');
    const first = siblingTypes(folder, false);
    expect(siblingTypes(folder, false)).toBe(first);
    expect([...first]).toEqual([['Todo', './useTodos']]);
    writeFileSync(join(folder, 'domain.ts'), 'export interface Problem {}\n');
    expect([...siblingTypes(folder, true)]).toEqual([
      ['Problem', './domain.ts'],
      ['Todo', './useTodos.ts'],
    ]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
const minedRules = [
  'one-status-from-hooks',
  'test-unwraps-values',
  'test-imports-the-type',
  'message-uses-its-limit',
  'import-types-from-their-owner',
  'keep-rejections',
];
const mined = Object.entries(policy.rules).filter(([name]) => minedRules.includes(name));
it('ships every rule mined from the rebuilds', () => expect(mined).toHaveLength(minedRules.length));
it.each(mined)('policy/%s states its fix in check:docs phrasing', (_name, rule) => {
  const messages = Object.values('messages' in rule.meta ? rule.meta.messages : {});
  expect(messages).not.toHaveLength(0);
  messages.forEach((message) => {
    expect(findNegativePhrasing(String(message))).toEqual([]);
    expect(findSlop(String(message))).toEqual([]);
  });
});
it('runs the fixture set in under ten seconds', () => expect(elapsed).toBeLessThan(10_000));
it('rejects duplicate fixture paths', () =>
  expect(() =>
    lintTree([
      { path: 'x.js', source: '' },
      { path: 'x.js', source: '' },
    ]),
  ).toThrow('Duplicate fixture path'));
it('lint:policy runs Oxlint alone', () => {
  expect(command).toBe(
    'env -u NAPI_RS_NATIVE_LIBRARY_PATH -u VP_VERSION -u OXLINT_TSGOLINT_PATH oxlint --no-ignore --config oxlint.config.ts --deny-warnings',
  );
});
it('the repository passes the Oxlint policy and covers every source file Git tracks or would track', () => {
  const result = run(ROOT);
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout);
  expect(
    report.diagnostics.filter(({ code }: Diagnostic) =>
      ['policy(role-named-folders)', 'policy(test-beside-subject)'].includes(code),
    ),
  ).toEqual([]);
  expect(report.diagnostics).toEqual([]);
  // Untracked files count too (not ignored ones), so a rebuild passes before it is staged.
  const tracked = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  ).stdout.split('\0');
  const ignored = [
    '**/dist/**',
    'coverage/**',
    'vendor/**',
    'playwright-report/**',
    'test-results/**',
    '.cache/**',
  ];
  const sources = tracked.filter(
    (path) =>
      new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']).has(extname(path)) &&
      !ignored.some((pattern) => matchesGlob(path, pattern)),
  );
  expect(report.number_of_files).toBe(sources.length);
});
