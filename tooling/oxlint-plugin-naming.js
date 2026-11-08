// Identifier naming, ported from Biome `style/useNamingConvention` with
// `strictCase` and `requireAscii` when Oxlint took over general lint (ADR 0126).
// Leading and trailing underscores are ignored, as in Biome.
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;
const PASCAL = /^[A-Z][a-zA-Z0-9]*$/;
const CONSTANT = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const CONSECUTIVE_CAPITALS = /[A-Z]{2}/;
const ASCII = /^[\x20-\x7e]*$/;

const strict = (format) => (name) => format.test(name) && !CONSECUTIVE_CAPITALS.test(name.slice(1));
const FORMATS = {
  camelCase: strict(CAMEL),
  PascalCase: (name) => PASCAL.test(name) && (name.length === 1 || strict(PASCAL)(name)),
  CONSTANT_CASE: (name) => CONSTANT.test(name),
};
const KINDS = {
  constant: ['camelCase', 'PascalCase', 'CONSTANT_CASE'],
  variable: ['camelCase', 'PascalCase'],
  function: ['camelCase', 'PascalCase'],
  parameter: ['camelCase', 'PascalCase'],
  type: ['PascalCase'],
  enumMember: ['PascalCase', 'CONSTANT_CASE', 'camelCase'],
};
const LABELS = {
  constant: 'top-level constant',
  variable: 'variable',
  function: 'function',
  parameter: 'parameter',
  type: 'type',
  enumMember: 'enum member',
};

// The message id for a name that breaks the convention, or null.
const issueOf = (name, kind) => {
  if (name === '') return null;
  if (!ASCII.test(name)) return 'ascii';
  return KINDS[kind].some((format) => FORMATS[format](name)) ? null : 'format';
};

const isTopLevelConst = (node) =>
  node.parent?.kind === 'const' &&
  ['Program', 'ExportNamedDeclaration'].includes(node.parent.parent?.type);

const namingConvention = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      format:
        'Rename the {{kind}} `{{name}}` to {{formats}}. Names use camelCase for values, PascalCase for components and types, and CONSTANT_CASE only for top-level constants.',
      ascii: 'Rename `{{name}}` with ASCII letters and digits only.',
    },
  },
  create(context) {
    const check = (identifier, kind) => {
      if (identifier?.type !== 'Identifier') return;
      const issue = issueOf(identifier.name.replace(/^_+|_+$/g, ''), kind);
      if (!issue) return;
      context.report({
        node: identifier,
        messageId: issue,
        data: { kind: LABELS[kind], name: identifier.name, formats: KINDS[kind].join(' or ') },
      });
    };
    const checkParams = (node) => node.params.forEach((param) => check(param, 'parameter'));
    return {
      VariableDeclarator: (node) => check(node.id, isTopLevelConst(node) ? 'constant' : 'variable'),
      FunctionDeclaration: (node) => {
        check(node.id, 'function');
        checkParams(node);
      },
      FunctionExpression: checkParams,
      ArrowFunctionExpression: checkParams,
      ClassDeclaration: (node) => check(node.id, 'type'),
      TSTypeAliasDeclaration: (node) => check(node.id, 'type'),
      TSInterfaceDeclaration: (node) => check(node.id, 'type'),
      TSEnumDeclaration: (node) => check(node.id, 'type'),
      TSTypeParameter: (node) => check(node.name, 'type'),
      TSEnumMember: (node) => check(node.id, 'enumMember'),
    };
  },
};

export default {
  meta: { name: 'naming' },
  rules: { 'naming-convention': namingConvention },
};
