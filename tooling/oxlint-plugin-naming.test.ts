/** @jest-environment node */
import naming from './oxlint-plugin-naming.js';

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
  parent: { kind, parent: { type: parentType } },
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

it('accepts PascalCase, CONSTANT_CASE and camelCase enum members', () => {
  ['Ready', 'READY', 'ready'].forEach((name) => {
    expect(visit('TSEnumMember', { id: identifier(name) })).toEqual([]);
  });
  expect(visit('TSEnumMember', { id: identifier('not_ready') })).toHaveLength(1);
});
