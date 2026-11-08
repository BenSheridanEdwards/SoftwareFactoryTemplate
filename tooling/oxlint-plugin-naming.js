// Identifier naming, ported from Biome `style/useNamingConvention` with
// `strictCase` and `requireAscii` when Oxlint took over general lint (ADR 0126).
// Leading and trailing `_` and `$` are ignored, as in Biome.
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;
const PASCAL = /^[A-Z][a-zA-Z0-9]*$/;
const CONSTANT = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const UPPER = /^[A-Z][A-Z0-9]*$/;
const CONSECUTIVE_CAPITALS = /[A-Z]{2}/;
const ASCII = /^[\x20-\x7e]*$/;
// Biome skips a quoted name that is not an identifier, such as `'Content-Type'`.
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

const strict = (format) => (name) => format.test(name) && !CONSECUTIVE_CAPITALS.test(name.slice(1));
const FORMATS = {
  camelCase: strict(CAMEL),
  PascalCase: (name) => PASCAL.test(name) && (name.length === 1 || strict(PASCAL)(name)),
  CONSTANT_CASE: (name) => CONSTANT.test(name),
  UPPERCASE: (name) => UPPER.test(name),
};
const KINDS = {
  constant: ['camelCase', 'PascalCase', 'CONSTANT_CASE'],
  variable: ['camelCase', 'PascalCase'],
  function: ['camelCase', 'PascalCase'],
  globalFunction: ['camelCase', 'PascalCase', 'UPPERCASE'],
  parameter: ['camelCase', 'PascalCase'],
  catchParameter: ['camelCase'],
  type: ['PascalCase'],
  enumMember: ['PascalCase'],
  namespace: ['camelCase', 'PascalCase'],
  alias: ['camelCase', 'PascalCase', 'CONSTANT_CASE'],
  member: ['camelCase'],
  constantMember: ['camelCase', 'CONSTANT_CASE'],
};
const LABELS = {
  constant: 'top-level constant',
  variable: 'variable',
  function: 'function',
  globalFunction: 'top-level function',
  parameter: 'parameter',
  catchParameter: 'catch parameter',
  type: 'type',
  enumMember: 'enum member',
  namespace: 'namespace',
  alias: 'import or export alias',
  member: 'member',
  constantMember: 'static or readonly member',
};

// The message id for a name that breaks the convention, or null.
const issueOf = (name, kind) => {
  if (name === '') return null;
  if (!ASCII.test(name)) return 'ascii';
  return KINDS[kind].some((format) => FORMATS[format](name)) ? null : 'format';
};

// Declarations at module level or in a namespace body are global, as in Biome.
const GLOBAL_PARENTS = ['Program', 'TSModuleBlock'];
const isGlobal = (declaration) =>
  GLOBAL_PARENTS.includes(declaration.parent?.type) ||
  (Boolean(declaration.parent?.type?.startsWith('Export')) &&
    GLOBAL_PARENTS.includes(declaration.parent.parent?.type));
const isGlobalConst = (declarator) =>
  ['const', 'var'].includes(declarator.parent?.kind) && isGlobal(declarator.parent);

// `declare module 'x'` and `declare global` describe names owned elsewhere.
const isAmbientModule = (node) =>
  node.type === 'TSModuleDeclaration' && (node.id?.type === 'Literal' || node.kind === 'global');
const insideAmbientModule = (node) =>
  Boolean(node.parent) && (isAmbientModule(node.parent) || insideAmbientModule(node.parent));

// The kind of a destructured or defaulted binding, from the declaration that
// owns it; null for an assignment target, which declares nothing.
const PATTERN_STEPS = [
  'ObjectPattern',
  'ArrayPattern',
  'AssignmentPattern',
  'RestElement',
  'Property',
];
const parameter = () => 'parameter';
const OWNER_KINDS = {
  FunctionDeclaration: parameter,
  FunctionExpression: parameter,
  ArrowFunctionExpression: parameter,
  TSParameterProperty: () => 'member',
  CatchClause: () => 'catchParameter',
  VariableDeclarator: (declarator) => (isGlobalConst(declarator) ? 'constant' : 'variable'),
};
const bindingKindOf = ({ parent }) => {
  if (!parent) return null;
  if (PATTERN_STEPS.includes(parent.type)) return bindingKindOf(parent);
  return OWNER_KINDS[parent.type]?.(parent) ?? null;
};

// The name of a non-computed key, or null when Biome skips it.
const quotedName = ({ value }) =>
  typeof value === 'string' && IDENTIFIER.test(value) ? value : null;
const KEY_NAMES = {
  Identifier: ({ name }) => name,
  PrivateIdentifier: ({ name }) => name,
  Literal: quotedName,
};
const keyName = ({ computed, key }) => (computed ? null : (KEY_NAMES[key?.type]?.(key) ?? null));

const namingConvention = {
  meta: {
    type: 'suggestion',
    schema: [],
    messages: {
      format:
        'Rename the {{kind}} `{{name}}` to {{formats}}. Names use camelCase for values and members, PascalCase for components, types and enum members, and CONSTANT_CASE only for top-level constants and static or readonly members.',
      ascii: 'Rename `{{name}}` with ASCII letters and digits only.',
    },
  },
  create(context) {
    const report = (node, name, kind) => {
      const issue = issueOf(name.replace(/^[_$]+|[_$]+$/g, ''), kind);
      if (!issue) return;
      context.report({
        node,
        messageId: issue,
        data: { kind: LABELS[kind], name, formats: KINDS[kind].join(' or ') },
      });
    };
    const check = (identifier, kind) => {
      if (identifier?.type === 'Identifier') report(identifier, identifier.name, kind);
    };
    const checkDeclaration = (node, kind) => {
      if (!insideAmbientModule(node)) check(node.id, kind);
    };
    const checkKey = (node, kind) => {
      const name = keyName(node);
      if (name !== null) report(node.key, name, kind);
    };
    const checkBinding = (node) => {
      const kind = node && bindingKindOf(node);
      if (kind) check(node, kind);
    };
    const checkParams = (node) => node.params.forEach((param) => check(param, 'parameter'));
    const checkClassMember = (node) => {
      if (node.override || node.kind === 'constructor') return;
      const constantAllowed = node.static && node.kind !== 'method' && node.kind !== 'set';
      checkKey(node, constantAllowed ? 'constantMember' : 'member');
    };
    return {
      VariableDeclarator: (node) => {
        if (!insideAmbientModule(node))
          check(node.id, isGlobalConst(node) ? 'constant' : 'variable');
      },
      FunctionDeclaration: (node) => {
        checkDeclaration(node, isGlobal(node) ? 'globalFunction' : 'function');
        checkParams(node);
      },
      FunctionExpression: (node) => {
        check(node.id, 'function');
        checkParams(node);
      },
      ArrowFunctionExpression: checkParams,
      CatchClause: (node) => check(node.param, 'catchParameter'),
      ObjectPattern: (node) =>
        node.properties
          .filter((property) => property.type === 'Property' && !property.shorthand)
          .forEach((property) => checkBinding(property.value)),
      ArrayPattern: (node) => node.elements.forEach(checkBinding),
      AssignmentPattern: (node) => {
        if (!node.parent?.shorthand) checkBinding(node.left);
      },
      RestElement: (node) => checkBinding(node.argument),
      ImportSpecifier: (node) => {
        if (node.local.name !== (node.imported.name ?? node.imported.value)) {
          check(node.local, 'alias');
        }
      },
      ImportDefaultSpecifier: (node) => check(node.local, 'alias'),
      ImportNamespaceSpecifier: (node) => check(node.local, 'namespace'),
      ExportSpecifier: (node) => {
        if (node.exported.name !== node.local.name) check(node.exported, 'alias');
      },
      ExportAllDeclaration: (node) => check(node.exported, 'namespace'),
      Property: (node) => {
        if (node.parent?.type === 'ObjectExpression') checkKey(node, 'member');
      },
      PropertyDefinition: checkClassMember,
      MethodDefinition: checkClassMember,
      TSAbstractPropertyDefinition: checkClassMember,
      TSAbstractMethodDefinition: checkClassMember,
      TSParameterProperty: (node) => checkBinding(node.parameter),
      TSPropertySignature: (node) => checkKey(node, node.readonly ? 'constantMember' : 'member'),
      TSMethodSignature: (node) =>
        checkKey(node, node.kind === 'get' ? 'constantMember' : 'member'),
      TSIndexSignature: (node) => node.parameters.forEach((param) => check(param, 'parameter')),
      ClassDeclaration: (node) => checkDeclaration(node, 'type'),
      ClassExpression: (node) => check(node.id, 'type'),
      TSTypeAliasDeclaration: (node) => checkDeclaration(node, 'type'),
      TSInterfaceDeclaration: (node) => checkDeclaration(node, 'type'),
      TSEnumDeclaration: (node) => checkDeclaration(node, 'type'),
      TSModuleDeclaration: (node) => {
        if (!isAmbientModule(node)) checkDeclaration(node, 'namespace');
      },
      TSTypeParameter: (node) => check(node.name, 'type'),
      TSEnumMember: (node) => {
        const name = node.id?.type === 'Identifier' ? node.id.name : node.id?.value;
        if (typeof name === 'string' && IDENTIFIER.test(name)) report(node.id, name, 'enumMember');
      },
    };
  },
};

export default {
  meta: { name: 'naming' },
  rules: { 'naming-convention': namingConvention },
};
