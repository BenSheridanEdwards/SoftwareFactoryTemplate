/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OXLINT_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/oxlint');
const BIOME_BIN = resolve(REPOSITORY_ROOT, 'node_modules/.bin/biome');

/**
 * Lints one seeded file with the real Oxlint CLI and the repo's own
 * `oxlint.config.ts`, in a temporary folder laid out like the repo.
 */
function lintSeed(path: string, source: string) {
  const directory = mkdtempSync(join(tmpdir(), 'general-lint-'));
  try {
    const config = pathToFileURL(join(REPOSITORY_ROOT, 'oxlint.config.ts')).href;
    writeFileSync(
      join(directory, 'oxlint.config.ts'),
      `import config from ${JSON.stringify(config)};\nexport default config;\n`,
    );
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), source);
    const run = spawnSync(OXLINT_BIN, ['--no-ignore', '--format', 'json', path], {
      cwd: directory,
      encoding: 'utf8',
    });
    const report: { diagnostics: { code: string }[] } = JSON.parse(run.stdout);
    return { status: run.status, rules: report.diagnostics.map(({ code }) => code) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('naming rules in package sources', () => {
  jest.setTimeout(30_000);

  it.each([
    'apps/web/src/features/x',
    'apps/api/src/features/x',
    'packages/ui/src',
    'showcase/todo-01/web/src/routes/x',
    'showcase/todo-01/api/src/features/x',
  ])('blocks a snake_case identifier and file name in %s', (folder) => {
    const identifier = lintSeed(`${folder}/value.ts`, 'export const bad_name = 1;\n');
    expect(identifier.status).toBe(1);
    expect(identifier.rules).toContain('naming(naming-convention)');

    const fileName = lintSeed(`${folder}/bad_name.ts`, 'export const value = 1;\n');
    expect(fileName.status).toBe(1);
    expect(fileName.rules).toContain('unicorn(filename-case)');
  });

  it.each([
    ['a PascalCase component', 'export function NameInput() { return null; }\n'],
    ['a CONSTANT_CASE top-level constant', 'export const MAX_NAME_LENGTH = 40;\n'],
    ['an underscore-prefixed unused parameter', 'export const value = (_unused: number) => 1;\n'],
  ])('allows %s', (_name, source) => {
    expect(lintSeed('apps/web/src/features/x/value.ts', source)).toEqual({ status: 0, rules: [] });
  });

  it.each([
    ['a consecutive-capital name', 'export const parseHTML = 1;\n'],
    [
      'a CONSTANT_CASE local',
      'export function value() { const LOCAL_VALUE = 1; return LOCAL_VALUE; }\n',
    ],
    ['a camelCase type', 'export type name = string;\n'],
  ])('blocks %s', (_name, source) => {
    expect(lintSeed('apps/web/src/features/x/value.ts', source).rules).toContain(
      'naming(naming-convention)',
    );
  });

  it('leaves the same seed alone outside every package src folder', () => {
    const result = lintSeed('scripts/bad_name.ts', 'export const bad_name = 1;\n');
    expect(result).toEqual({ status: 0, rules: [] });
  });
});

it('rejects var declarations and increment operators everywhere', () => {
  const result = lintSeed('scripts/example.ts', 'export var x = 1; x++;\n');
  expect(result.status).toBe(1);
  expect(result.rules).toContain('eslint(no-var)');
  expect(result.rules).toContain('eslint(no-plusplus)');
});

it.each([
  ['an explicit any', 'export const value: any = 1;\n', 'typescript(no-explicit-any)'],
  ['a non-null assertion', 'export const value = [1][0]!;\n', 'typescript(no-non-null-assertion)'],
  ['a debugger statement', 'debugger;\n', 'eslint(no-debugger)'],
  ['an empty catch block', 'try { JSON.parse("x"); } catch {}\n', 'eslint(no-empty)'],
  ['an unused import', "import { join } from 'node:path';\n", 'eslint(no-unused-vars)'],
  [
    'a value import used only as a type',
    "import { Server } from 'node:http';\nexport type Value = Server;\n",
    'typescript(consistent-type-imports)',
  ],
  ['loose equality', 'export const value = (a: number) => a == 1;\n', 'eslint(eqeqeq)'],
  [
    'an unused leading parameter',
    'export const value = (a: number, b: number) => b;\n',
    'eslint(no-unused-vars)',
  ],
  [
    'an unused catch binding',
    'try { JSON.parse("x"); } catch (error) { JSON.parse("y"); }\n',
    'eslint(no-unused-vars)',
  ],
  ['an empty function', 'export const value = () => {};\n', 'eslint(no-empty-function)'],
  [
    'a comma operator in parentheses',
    'export const value = (a: number) => (a, 1);\n',
    'eslint(no-sequences)',
  ],
  [
    'a function expression bound to a name',
    'export const value = function () { return 1; };\n',
    'eslint(func-style)',
  ],
  [
    'a chained assignment',
    'let a = 0; let b = 0; a = b = 1; export { a, b };\n',
    'eslint(no-multi-assign)',
  ],
  ['an approximate constant', 'export const value = 3.141;\n', 'oxc(approx-constant)'],
  [
    'a constant min-max clamp',
    'export const value = (a: number) => Math.min(Math.max(a, 10), 5);\n',
    'oxc(bad-min-max-func)',
  ],
  [
    'a misrefactored shorthand assignment',
    'let a = 1; const b = 2; a += a + b; export { a };\n',
    'oxc(misrefactored-assign-op)',
  ],
])('rejects %s in any linted file', (_name, source, rule) => {
  expect(lintSeed('scripts/example.ts', source).rules).toContain(rule);
});

it.each([
  [
    'raw HTML',
    'export const value = <div dangerouslySetInnerHTML={{ __html: "x" }} />;\n',
    'react(no-danger)',
  ],
  ['a children prop', 'export const value = <div children="x" />;\n', 'react(no-children-prop)'],
  [
    'a list item without a key',
    'export const value = [1].map((n) => <b>{n}</b>);\n',
    'react(jsx-key)',
  ],
])('rejects %s in any linted React file', (_name, source, rule) => {
  expect(lintSeed('scripts/example.tsx', source).rules).toContain(rule);
});

it.each([
  ['a focused test', "it.only('runs', () => { expect(1).toBe(1); });\n", 'jest(no-focused-tests)'],
  [
    'an export from a test file',
    "it('runs', () => { expect(1).toBe(1); });\nexport const value = 1;\n",
    'jest(no-export)',
  ],
  [
    'a duplicate hook',
    "describe('x', () => {\n  beforeEach(() => { expect(1).toBe(1); });\n  beforeEach(() => { expect(2).toBe(2); });\n  it('runs', () => { expect(1).toBe(1); });\n});\n",
    'jest(no-duplicate-hooks)',
  ],
])('rejects %s in any test file', (_name, source, rule) => {
  expect(lintSeed('scripts/example.test.ts', source).rules).toContain(rule);
});

/**
 * Runs `biome check` with the repo's own `biome.json` on seeded files and
 * returns the lint rules it reports.
 */
function biomeSeed(files: Record<string, string>) {
  const directory = mkdtempSync(join(tmpdir(), 'biome-lint-'));
  try {
    copyFileSync(join(REPOSITORY_ROOT, 'biome.json'), join(directory, 'biome.json'));
    Object.entries(files).forEach(([path, source]) => {
      mkdirSync(dirname(join(directory, path)), { recursive: true });
      writeFileSync(join(directory, path), source);
    });
    const run = spawnSync(
      BIOME_BIN,
      ['check', '--vcs-enabled=false', '--error-on-warnings', '--reporter=json', '.'],
      { cwd: directory, encoding: 'utf8' },
    );
    const report: { diagnostics: { category: string }[] } = JSON.parse(run.stdout);
    return {
      status: run.status,
      rules: report.diagnostics.map(({ category }) => category),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('Biome lints JSON and CSS only', () => {
  it.each([
    [
      'a duplicate JSON key',
      'config.json',
      '{ "a": 1, "a": 2 }\n',
      'lint/suspicious/noDuplicateObjectKeys',
    ],
    [
      'a duplicate JSONC key',
      'config.jsonc',
      '{ "a": 1, "a": 2 }\n',
      'lint/suspicious/noDuplicateObjectKeys',
    ],
    [
      'a duplicate CSS property',
      'styles.css',
      '.box {\n  color: red;\n  color: blue;\n}\n',
      'lint/suspicious/noDuplicateProperties',
    ],
  ])('rejects %s', (_name, path, source, rule) => {
    const result = biomeSeed({ [path]: source });
    expect(result.status).toBe(1);
    expect(result.rules).toContain(rule);
  });

  it('leaves TypeScript lint to Oxlint', () => {
    expect(biomeSeed({ 'value.ts': 'debugger;\nexport var value: any = 1;\n' })).toEqual({
      status: 0,
      rules: [],
    });
  });
});
