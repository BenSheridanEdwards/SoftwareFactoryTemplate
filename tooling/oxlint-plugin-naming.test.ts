/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import naming from './oxlint-plugin-naming.js';

const OXLINT_BIN = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
  'node_modules/.bin/oxlint',
);

interface Report {
  messageId: string;
  data: Record<string, string>;
}

interface AstNode {
  type?: string;
  name?: string | AstNode;
  kind?: string;
  id?: AstNode;
  params?: AstNode[];
  parent?: AstNode;
}

const identifier = (name: string): AstNode => ({ type: 'Identifier', name });

/** Runs one visitor of the naming rule and returns its reports. */
function visit(selector: string, node: AstNode) {
  const reports: Report[] = [];
  const visitors = naming.rules['naming-convention'].create({
    report: (report: Report) => reports.push(report),
  });
  visitors[selector](node);
  return reports;
}

const declarator = (name: string, kind: string, parentType = 'Program'): AstNode => ({
  id: identifier(name),
  parent: { kind, parent: { type: parentType, parent: { type: 'Program' } } },
});

it.each([
  ['a camelCase local', declarator('nameInput', 'const', 'BlockStatement')],
  ['a PascalCase component', declarator('NameInput', 'const')],
  ['a top-level CONSTANT_CASE constant', declarator('MAX_LENGTH', 'const')],
  [
    'an exported CONSTANT_CASE constant',
    declarator('MAX_LENGTH', 'const', 'ExportNamedDeclaration'),
  ],
  ['an underscore-prefixed name', declarator('_unused', 'const', 'BlockStatement')],
  ['a lone underscore', declarator('_', 'const', 'BlockStatement')],
  ['a destructuring pattern', { id: { type: 'ObjectPattern' }, parent: { kind: 'const' } }],
])('accepts %s', (_name, node) => {
  expect(visit('VariableDeclarator', node)).toEqual([]);
});

it.each([
  ['snake_case', declarator('bad_name', 'const'), 'top-level constant'],
  ['consecutive capitals', declarator('parseHTML', 'const'), 'top-level constant'],
  ['a CONSTANT_CASE local', declarator('LOCAL_VALUE', 'const', 'BlockStatement'), 'variable'],
  ['a CONSTANT_CASE let', declarator('MAX_LENGTH', 'let'), 'variable'],
])('rejects %s', (_name, node, kind) => {
  expect(visit('VariableDeclarator', node)).toEqual([
    expect.objectContaining({ messageId: 'format', data: expect.objectContaining({ kind }) }),
  ]);
});

it('rejects a non-ASCII name', () => {
  expect(visit('VariableDeclarator', declarator('naïve', 'const'))).toEqual([
    expect.objectContaining({ messageId: 'ascii' }),
  ]);
});

it('checks function names and parameters', () => {
  const reports = visit('FunctionDeclaration', {
    id: identifier('load_value'),
    params: [identifier('first_value'), identifier('second'), { type: 'ObjectPattern' }],
  });
  expect(reports.map(({ data }) => data.name)).toEqual(['load_value', 'first_value']);
  expect(visit('ArrowFunctionExpression', { params: [identifier('bad_param')] })).toHaveLength(1);
  expect(visit('FunctionExpression', { params: [identifier('goodParam')] })).toEqual([]);
});

it.each([
  'ClassDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
])('requires a PascalCase %s', (selector) => {
  expect(visit(selector, { id: identifier('Greeting') })).toEqual([]);
  expect(visit(selector, { id: identifier('greeting') })).toEqual([
    expect.objectContaining({ data: expect.objectContaining({ kind: 'type' }) }),
  ]);
});

it('accepts single-letter and PascalCase type parameters', () => {
  expect(visit('TSTypeParameter', { name: identifier('T') })).toEqual([]);
  expect(visit('TSTypeParameter', { name: identifier('Value') })).toEqual([]);
  expect(visit('TSTypeParameter', { name: identifier('value') })).toHaveLength(1);
});

it('accepts only PascalCase enum members', () => {
  expect(visit('TSEnumMember', { id: identifier('Ready') })).toEqual([]);
  ['READY', 'ready', 'not_ready'].forEach((name) => {
    expect(visit('TSEnumMember', { id: identifier(name) })).toHaveLength(1);
  });
});

// Each case names the visitor it exercises, a source file and the names the
// rule reports. Every expectation matches Biome 2.5.1 `useNamingConvention`
// with `strictCase` and `requireAscii` on the same source (ADR 0126).
const CASES: [string, string, string, string[]][] = [
  ['Property', 'a snake_case object key', 'export const o = { full_name: 1 };', ['full_name']],
  ['Property', 'a PascalCase object key', 'export const o = { FullName: 1 };', ['FullName']],
  ['Property', 'a CONSTANT_CASE object key', 'export const o = { MAX_SIZE: 1 };', ['MAX_SIZE']],
  [
    'Property',
    'a quoted key that is a valid identifier',
    "export const o = { 'full_name': 1 };",
    ['full_name'],
  ],
  [
    'Property',
    'quoted keys that are not identifiers',
    "export const headers = { 'Content-Type': 'json', 'aria-label': 'x', 1: 'a' };",
    [],
  ],
  [
    'Property',
    'a shorthand object key',
    "import { an_import } from './other';\nexport const o = { an_import };",
    ['an_import'],
  ],
  [
    'Property',
    'an object method and a CONSTANT_CASE getter',
    'export const o = { my_fn() { return 1; }, get MAX_SIZE() { return 1; } };',
    ['my_fn', 'MAX_SIZE'],
  ],
  ['Property', 'a computed key', "const key = 'a';\nexport const o = { [key]: 1 };", []],
  [
    'PropertyDefinition',
    'a snake_case class property',
    'export class A { my_prop = 1; }',
    ['my_prop'],
  ],
  [
    'PropertyDefinition',
    'a static CONSTANT_CASE class property',
    'export class A { static MAX_SIZE = 1; }',
    [],
  ],
  [
    'PropertyDefinition',
    'a snake_case private field',
    'export class A { #my_field = 1; get value() { return this.#my_field; } }',
    ['my_field'],
  ],
  [
    'PropertyDefinition',
    'a quoted class property that is a valid identifier',
    "export class A { 'my_prop' = 1; }",
    ['my_prop'],
  ],
  [
    'MethodDefinition',
    'a class method that is not camelCase',
    'export class A { My_method() { return 1; } }',
    ['My_method'],
  ],
  [
    'MethodDefinition',
    'a static CONSTANT_CASE getter',
    'export class A { static get MAX_SIZE() { return 1; } }',
    [],
  ],
  [
    'MethodDefinition',
    'an instance CONSTANT_CASE getter',
    'export class A { get MAX_SIZE() { return 1; } }',
    ['MAX_SIZE'],
  ],
  [
    'MethodDefinition',
    'an override member',
    "import { Base } from './other';\nexport class B extends Base { override my_method() { return 2; } }",
    [],
  ],
  [
    'MethodDefinition',
    'an abstract member',
    'export abstract class A { abstract my_method(): void; }',
    ['my_method'],
  ],
  [
    'MethodDefinition',
    'a parameter property',
    'export class A { constructor(private my_x: number) { void this.my_x; } }',
    ['my_x'],
  ],
  [
    'MethodDefinition',
    'a setter parameter',
    'export const o = { set value(new_value: number) { void new_value; } };',
    ['new_value'],
  ],
  [
    'TSPropertySignature',
    'a snake_case interface property',
    'export interface I { full_name: string }',
    ['full_name'],
  ],
  [
    'TSPropertySignature',
    'a snake_case type literal property',
    'export type T = { full_name: string };',
    ['full_name'],
  ],
  [
    'TSPropertySignature',
    'a readonly CONSTANT_CASE property',
    'export interface I { readonly MAX_SIZE: number }',
    [],
  ],
  [
    'TSPropertySignature',
    'a quoted header key',
    "export interface H { 'Content-Type': string }",
    [],
  ],
  [
    'TSPropertySignature',
    'an index signature parameter',
    'export interface I { [my_key: string]: number }',
    ['my_key'],
  ],
  [
    'TSMethodSignature',
    'a snake_case interface method',
    'export interface I { do_it(): void }',
    ['do_it'],
  ],
  [
    'TSMethodSignature',
    'a CONSTANT_CASE interface getter',
    'export interface I { get MAX_SIZE(): number }',
    [],
  ],
  [
    'ImportSpecifier',
    'a snake_case import alias',
    "import { join as join_path } from 'node:path';\nexport const p = join_path('a');",
    ['join_path'],
  ],
  [
    'ImportSpecifier',
    'a named import kept under its own name',
    "import { an_import } from './other';\nexport const p = an_import;",
    [],
  ],
  [
    'ImportDefaultSpecifier',
    'a snake_case default import',
    "import my_default from './other';\nexport const p = my_default;",
    ['my_default'],
  ],
  [
    'ImportNamespaceSpecifier',
    'a CONSTANT_CASE namespace import',
    "import * as MY_LIB from './other';\nexport const p = MY_LIB;",
    ['MY_LIB'],
  ],
  [
    'ExportSpecifier',
    'a snake_case export alias',
    'const a = 1;\nexport { a as my_alias };',
    ['my_alias'],
  ],
  [
    'ExportSpecifier',
    'a CONSTANT_CASE export alias',
    'const a = 1;\nexport { a as MY_ALIAS };',
    [],
  ],
  [
    'ExportAllDeclaration',
    'a CONSTANT_CASE export namespace',
    "export * as MY_NS from './other';",
    ['MY_NS'],
  ],
  [
    'CatchClause',
    'a PascalCase catch parameter',
    'export const f = () => { try { return 1; } catch (ParseError) { return ParseError; } };',
    ['ParseError'],
  ],
  [
    'CatchClause',
    'a camelCase catch parameter',
    'export const f = () => { try { return 1; } catch (error) { return error; } };',
    [],
  ],
  [
    'ObjectPattern',
    'a renamed destructured binding',
    'const o = { a: 1 };\nexport const { a: my_value } = o;',
    ['my_value'],
  ],
  [
    'ObjectPattern',
    'a shorthand destructured property',
    "import { source } from './other';\nexport const { snake_prop } = source;",
    [],
  ],
  [
    'ObjectPattern',
    'a shorthand destructured catch property',
    'export const f = () => { try { return 1; } catch ({ my_msg }) { return my_msg; } };',
    [],
  ],
  [
    'ObjectPattern',
    'a renamed destructured parameter',
    'export const f = ({ a: my_a }: { a: number }) => my_a;',
    ['my_a'],
  ],
  [
    'ArrayPattern',
    'a snake_case array binding',
    'const arr = [1];\nexport const [first_item] = arr;',
    ['first_item'],
  ],
  [
    'AssignmentPattern',
    'a snake_case parameter with a default',
    'export const f = (my_param = 1) => my_param;',
    ['my_param'],
  ],
  [
    'AssignmentPattern',
    'a shorthand destructured property with a default',
    "import { source } from './other';\nexport const { snake_prop = 1 } = source;",
    [],
  ],
  [
    'RestElement',
    'a snake_case rest parameter',
    'export const f = (...rest_args: number[]) => rest_args;',
    ['rest_args'],
  ],
  [
    'RestElement',
    'a snake_case object rest binding',
    "import { source } from './other';\nexport const { ...rest_props } = source;",
    ['rest_props'],
  ],
  [
    'FunctionExpression',
    'a snake_case function expression name',
    'export const f = () => function inner_fn() { return 1; };',
    ['inner_fn'],
  ],
  ['FunctionDeclaration', 'a global UPPERCASE function', 'export function GET() { return 1; }', []],
  [
    'FunctionDeclaration',
    'a nested UPPERCASE function',
    'export function f() { function GET() { return 1; } return GET; }',
    ['GET'],
  ],
  [
    'ClassExpression',
    'a snake_case class expression name',
    'export const C = class my_class {};',
    ['my_class'],
  ],
  [
    'TSModuleDeclaration',
    'a snake_case namespace',
    'export namespace my_ns { export const x = 1; }',
    ['my_ns'],
  ],
  [
    'TSModuleDeclaration',
    'a CONSTANT_CASE constant in a namespace',
    'export namespace Ns { export const MAX_SIZE = 1; }',
    [],
  ],
  [
    'TSModuleDeclaration',
    'a declaration inside a declared module',
    "declare module 'x' { interface my_iface { a: number } }\nexport {};",
    [],
  ],
  [
    'TSModuleDeclaration',
    'a member inside a declared module',
    "declare module 'x' { interface I { my_prop: number } }\nexport {};",
    ['my_prop'],
  ],
  [
    'TSModuleDeclaration',
    'a declaration inside declare global',
    'declare global { interface my_window { a: number } }\nexport {};',
    [],
  ],
  ['TSEnumMember', 'a CONSTANT_CASE enum member', 'export enum E { MAX_SIZE = 1 }', ['MAX_SIZE']],
  ['TSEnumMember', 'a PascalCase enum member', 'export enum E { Open = 1 }', []],
  [
    'TSEnumMember',
    'a quoted enum member that is not an identifier',
    "export enum E { 'my-member' = 1 }",
    [],
  ],
  [
    'TSTypeParameter',
    'a camelCase type parameter',
    'export const f = <my_t,>(v: my_t) => v;',
    ['my_t'],
  ],
  ['VariableDeclarator', 'a CONSTANT_CASE let', 'export let MAX_SIZE = 1;', ['MAX_SIZE']],
  [
    'VariableDeclarator',
    'names wrapped in underscores or dollars',
    'export const $value$ = 1;\nexport const _value_ = 2;',
    [],
  ],
  [
    'VariableDeclarator',
    'a PascalCase arrow parameter',
    'export const f = (MyParam: number) => MyParam;',
    [],
  ],
];

const reported = new Map<string, string[]>();

beforeAll(() => {
  const directory = mkdtempSync(join(tmpdir(), 'naming-plugin-'));
  try {
    writeFileSync(
      join(directory, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off' },
        jsPlugins: [fileURLToPath(new URL('./oxlint-plugin-naming.js', import.meta.url))],
        rules: { 'naming/naming-convention': 'error' },
      }),
    );
    CASES.forEach(([, , source], index) => {
      writeFileSync(join(directory, `case${index}.ts`), `${source}\n`);
    });
    const run = spawnSync(OXLINT_BIN, ['--no-ignore', '--format', 'json', '.'], {
      cwd: directory,
      encoding: 'utf8',
    });
    const report: { diagnostics: { filename: string; message: string; code: string }[] } =
      JSON.parse(run.stdout);
    report.diagnostics
      .filter(({ code }) => code === 'naming(naming-convention)')
      .forEach(({ filename, message }) => {
        const file = basename(filename);
        reported.set(file, [...(reported.get(file) ?? []), message.match(/`([^`]+)`/)?.[1] ?? '']);
      });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);

it.each(
  CASES.map((testCase, index) => [...testCase, index] as const),
)('%s: reports %s as Biome does', (_visitor, _name, _source, names, index) => {
  expect(reported.get(`case${index}.ts`) ?? []).toEqual(names);
});
