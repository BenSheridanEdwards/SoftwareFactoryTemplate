// Repository policy rules that no installed plugin expresses (ADR 0019, ADR 0103). Each
// message names the fix, so an agent can act on the error alone.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, posix, relative, sep } from 'node:path';

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const HOOK_NAME = /^use[A-Z0-9]/;
const FOLDER_NAME = /^([a-z0-9]+(-[a-z0-9]+)*|__[a-z]+__)$/;

// The first `src` folder on the path is the package's source root.
const PACKAGE_ROUTES = /^(?:(?!src\/)[^/]+\/)*src\/routes\//;
const UNPREFIXED_CALLBACK_PROPS = /^(render[A-Z].*|children)$/;
const COMPONENT_WRAPPERS = new Set(['memo', 'forwardRef']);

// The package source root is the first `src` folder on the path; `routes/` and
// `features/` under it hold one folder per slice.
const PACKAGE_SOURCE = /^((?:(?!src\/)[^/]+\/)*)src\/(.*)$/;
const SLICE_KINDS = new Set(['routes', 'features']);
const CATCH_ALL_FOLDERS = new Set(['utils', 'helpers', 'lib', 'common', 'shared', 'misc']);

/** The hooks that hold state or effects, by the module that exports them (ADR 0012). */
const STATE_AND_EFFECT_HOOKS = new Map([
  [
    'react',
    new Set([
      'useState',
      'useReducer',
      'useEffect',
      'useLayoutEffect',
      'useInsertionEffect',
      'useActionState',
      'useOptimistic',
      'useSyncExternalStore',
      'useTransition',
    ]),
  ],
  [
    '@tanstack/react-query',
    new Set([
      'useQuery',
      'useQueries',
      'useSuspenseQuery',
      'useSuspenseQueries',
      'useInfiniteQuery',
      'useSuspenseInfiniteQuery',
      'useMutation',
      'useMutationState',
    ]),
  ],
  [
    'react-hook-form',
    new Set(['useForm', 'useFieldArray', 'useController', 'useWatch', 'useFormState']),
  ],
]);

const isFunctionNode = (node) =>
  node?.type === 'FunctionDeclaration' ||
  node?.type === 'FunctionExpression' ||
  node?.type === 'ArrowFunctionExpression';

function wrappedFunction(init) {
  if (isFunctionNode(init)) {
    return init;
  }

  if (init?.type !== 'CallExpression') {
    return null;
  }

  const callee = init.callee.type === 'MemberExpression' ? init.callee.property : init.callee;

  return callee.type === 'Identifier' && COMPONENT_WRAPPERS.has(callee.name)
    ? (init.arguments.find(isFunctionNode) ?? null)
    : null;
}

const unwrapExport = (statement) =>
  statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
    ? statement.declaration
    : statement;

/** Each `{ id, init }` a module-scope declaration binds; a function declaration binds itself. */
function bindings(declaration) {
  if (declaration?.type === 'FunctionDeclaration' && declaration.id) {
    return [{ id: declaration.id, fn: declaration }];
  }

  if (declaration?.type !== 'VariableDeclaration') {
    return [];
  }

  return declaration.declarations
    .filter((declarator) => declarator.id.type === 'Identifier')
    .map((declarator) => ({ id: declarator.id, init: declarator.init }));
}

const isTestFile = (path) => /\.test\.tsx?$/.test(path);
const isExport = (statement) => statement.type.startsWith('Export');

/** The props type from `FC<Props>` on the binding, or `forwardRef<Element, Props>`. */
function declaredPropsType({ id, init }) {
  const annotationArguments = id.typeAnnotation?.typeAnnotation?.typeArguments?.params;

  return annotationArguments?.[0] ?? init?.typeArguments?.params?.[1];
}

/**
 * Module-scope components of a non-test `.tsx` file, exported ones first:
 * `{ name, node, fn, propsType }` per PascalCase function.
 */
function moduleComponents(program, filename) {
  if (extname(filename) !== '.tsx' || isTestFile(filename)) {
    return [];
  }

  const ordered = [...program.body.filter(isExport), ...program.body.filter((s) => !isExport(s))];

  return ordered
    .flatMap((statement) => bindings(unwrapExport(statement)))
    .flatMap((binding) => {
      const fn = binding.fn ?? wrappedFunction(binding.init);
      const propsType = fn?.params[0]?.typeAnnotation?.typeAnnotation ?? declaredPropsType(binding);
      const component = { name: binding.id.name, node: binding.id, fn, propsType };

      return component.fn && PASCAL_CASE.test(component.name) ? [component] : [];
    });
}

const repositoryPath = (context) => relative(context.cwd, context.filename).split(sep).join('/');

function functionName(fn) {
  if (fn.id) {
    return fn.id.name;
  }

  const parent = fn.parent;

  return parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier'
    ? parent.id.name
    : null;
}

const oneComponentPerFile = {
  meta: {
    type: 'problem',
    messages: {
      extra:
        'Move `{{name}}` into its own file `{{name}}.tsx`. Each file holds one React component.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        moduleComponents(program, context.filename)
          .slice(1)
          .forEach((component) => {
            context.report({ node: component.node, messageId: 'extra', data: component });
          });
      },
    };
  },
};

const importedName = (specifier) => specifier.imported.name ?? specifier.imported.value;

const stateAndEffectsInHooks = {
  meta: {
    type: 'problem',
    messages: {
      outsideHook:
        'Move `{{hook}}` into a named custom hook (for example `useTodos` in ' +
        '`useTodos.ts`) and call that hook here. State, effects, server state and form ' +
        'state live only in `use*` hooks.',
      reexport:
        'Call `{{hook}}` inside a named custom hook instead of re-exporting it. A re-export ' +
        'hides the hook from this rule.',
    },
    schema: [],
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {};
    }

    const hookNames = new Map();
    const hookNamespaces = new Map();

    const restrictedHook = (callee) => {
      if (callee.type === 'Identifier') {
        return hookNames.get(callee.name);
      }

      if (
        callee.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.property.type === 'Identifier' &&
        hookNamespaces.get(callee.object.name)?.has(callee.property.name)
      ) {
        return callee.property.name;
      }

      return undefined;
    };

    return {
      ExportNamedDeclaration(node) {
        const hooks = STATE_AND_EFFECT_HOOKS.get(node.source?.value);

        (hooks ? node.specifiers : []).forEach((specifier) => {
          const hook = specifier.local.name ?? specifier.local.value;

          if (hooks.has(hook)) {
            context.report({ node: specifier, messageId: 'reexport', data: { hook } });
          }
        });
      },
      ExportAllDeclaration(node) {
        if (STATE_AND_EFFECT_HOOKS.has(node.source.value)) {
          context.report({ node, messageId: 'reexport', data: { hook: node.source.value } });
        }
      },
      ImportDeclaration(node) {
        const hooks = STATE_AND_EFFECT_HOOKS.get(node.source.value);

        if (!hooks) {
          return;
        }

        node.specifiers.forEach((specifier) => {
          if (specifier.type !== 'ImportSpecifier') {
            hookNamespaces.set(specifier.local.name, hooks);
          } else if (hooks.has(importedName(specifier))) {
            hookNames.set(specifier.local.name, importedName(specifier));
          }
        });
      },
      CallExpression(node) {
        const hook = restrictedHook(node.callee);

        if (!hook) {
          return;
        }

        const owner = context.sourceCode.getAncestors(node).findLast(isFunctionNode);

        const name = owner ? functionName(owner) : null;

        if (!(name && HOOK_NAME.test(name))) {
          context.report({ node, messageId: 'outsideHook', data: { hook } });
        }
      },
    };
  },
};

const isCallbackHook = (init) => {
  const callee = init?.type === 'CallExpression' ? init.callee : undefined;

  return (callee?.type === 'MemberExpression' ? callee.property : callee)?.name === 'useCallback';
};

/** The identifiers of functions declared directly in a component body. */
function localFunctions(body) {
  if (body.type !== 'BlockStatement') {
    return [];
  }

  return body.body
    .flatMap(bindings)
    .filter(({ fn, init }) => fn || isFunctionNode(init) || isCallbackHook(init))
    .map(({ id }) => id);
}

const handlerNames = {
  meta: {
    type: 'problem',
    messages: {
      prefix:
        'Rename `{{name}}` to `handle{{suffix}}`. Functions defined inside a component start ' +
        'with `handle`; callback props start with `on`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        moduleComponents(program, context.filename).forEach(({ fn }) => {
          localFunctions(fn.body).forEach((identifier) => {
            if (!/^handle[A-Z]/.test(identifier.name)) {
              const suffix = identifier.name.charAt(0).toUpperCase() + identifier.name.slice(1);
              context.report({
                node: identifier,
                messageId: 'prefix',
                data: { name: identifier.name, suffix },
              });
            }
          });
        });
      },
    };
  },
};

const isFunctionType = (type) =>
  type?.type === 'TSFunctionType' ||
  (type?.type === 'TSUnionType' && type.types.some(isFunctionType)) ||
  (type?.type === 'TSParenthesizedType' && isFunctionType(type.typeAnnotation));

const isNamed = (name) => (statement) => unwrapExport(statement)?.id?.name === name;

function declaredMembers(program, declaration) {
  if (declaration?.type === 'TSInterfaceDeclaration') {
    const inherited = (declaration.extends ?? []).flatMap((heritage) =>
      typeMembers(program, { type: 'TSTypeReference', typeName: heritage.expression }),
    );

    return [...declaration.body.body, ...inherited];
  }

  if (declaration?.type === 'TSTypeAliasDeclaration') {
    return typeMembers(program, declaration.typeAnnotation);
  }

  return [];
}

/** The members of a props type: an inline literal, or an interface or alias in the same file. */
function typeMembers(program, annotation) {
  if (annotation?.type === 'TSTypeLiteral') {
    return annotation.members;
  }

  if (annotation?.type === 'TSIntersectionType') {
    return annotation.types.flatMap((type) => typeMembers(program, type));
  }

  if (annotation?.type !== 'TSTypeReference' || annotation.typeName.type !== 'Identifier') {
    return [];
  }

  const statement = program.body.find(isNamed(annotation.typeName.name));

  return statement ? declaredMembers(program, unwrapExport(statement)) : [];
}

const isCallbackMember = (member) =>
  member.type === 'TSMethodSignature' ||
  (member.type === 'TSPropertySignature' && isFunctionType(member.typeAnnotation?.typeAnnotation));

const isMisnamedCallback = (member) =>
  isCallbackMember(member) &&
  member.key?.type === 'Identifier' &&
  !UNPREFIXED_CALLBACK_PROPS.test(member.key.name) &&
  !/^on[A-Z]/.test(member.key.name);

const callbackPropNames = {
  meta: {
    type: 'problem',
    messages: {
      prefix:
        'Rename the callback prop `{{name}}` to start with `on` (for example `on{{suffix}}`). ' +
        'Callback props start with `on`; the handler a component defines starts with `handle`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const members = moduleComponents(program, context.filename).flatMap(({ propsType }) =>
          typeMembers(program, propsType),
        );

        members.filter(isMisnamedCallback).forEach((member) => {
          const name = member.key.name;
          const suffix = name.charAt(0).toUpperCase() + name.slice(1);
          context.report({ node: member, messageId: 'prefix', data: { name, suffix } });
        });
      },
    };
  },
};

const pagesInRoutes = {
  meta: {
    type: 'problem',
    messages: {
      location:
        'Move `{{name}}` to `src/routes/<route-name>/{{name}}.tsx` in its package. Page ' +
        'components live in `src/routes/`, which composes features and the ui kit.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        if (PACKAGE_ROUTES.test(repositoryPath(context))) {
          return;
        }

        moduleComponents(program, context.filename).forEach((component) => {
          if (component.name.endsWith('Page')) {
            context.report({ node: component.node, messageId: 'location', data: component });
          }
        });
      },
    };
  },
};

function exportedHooks(program) {
  return program.body
    .filter((statement) => statement.type === 'ExportNamedDeclaration')
    .flatMap((statement) => bindings(statement.declaration))
    .filter(({ id, fn, init }) => HOOK_NAME.test(id.name) && (fn || isFunctionNode(init)))
    .map(({ id }) => id);
}

const fileMatchesExport = {
  meta: {
    type: 'problem',
    messages: {
      mismatch:
        'Rename this file to `{{expected}}`, or move `{{name}}` into `{{expected}}`. A component ' +
        'or hook lives in the file of the same name.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const path = repositoryPath(context);

        if (isTestFile(path)) {
          return;
        }

        const extension = extname(path);
        const [component] = moduleComponents(program, context.filename);
        const named = [component?.node, ...exportedHooks(program)].filter(Boolean);

        named
          .filter(({ name }) => name !== basename(path, extension))
          .forEach((node) => {
            context.report({
              node,
              messageId: 'mismatch',
              data: { name: node.name, expected: `${node.name}${extension}` },
            });
          });
      },
    };
  },
};

const folderNames = {
  meta: {
    type: 'problem',
    messages: {
      kebab: 'Rename the folder `{{folder}}` to kebab-case, for example `name-input`.',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(program) {
        const folders = dirname(repositoryPath(context)).split('/').slice(1);

        folders.forEach((folder) => {
          if (!FOLDER_NAME.test(folder)) {
            context.report({ node: program, messageId: 'kebab', data: { folder } });
          }
        });
      },
    };
  },
};

const roleNamedFolders = {
  meta: {
    type: 'problem',
    messages: {
      catchAll:
        'Move the code out of `{{path}}/`: put it in the slice that uses it, or in `@repo/ui` ' +
        'if it is a shared UI primitive. Name each folder for its role (for example ' +
        '`name-input` or `api-client`), never a catch-all such as `{{folder}}`.',
    },
    schema: [],
  },
  create(context) {
    const source = PACKAGE_SOURCE.exec(repositoryPath(context));

    if (!source) {
      return {};
    }

    const folders = posix.dirname(source[2]).split('/');

    return {
      Program(program) {
        folders.forEach((folder, index) => {
          if (CATCH_ALL_FOLDERS.has(folder)) {
            const path = ['src', ...folders.slice(0, index + 1)].join('/');
            context.report({ node: program, messageId: 'catchAll', data: { path, folder } });
          }
        });
      },
    };
  },
};

const testBesideSubject = {
  meta: {
    type: 'problem',
    messages: {
      testsFolder:
        'Move `{{test}}` out of `__tests__/` to sit beside its subject `{{subject}}.ts` or ' +
        '`{{subject}}.tsx`. Each test sits beside its subject as `<Name>.test.ts(x)`.',
      missingSubject:
        'Move this test beside its subject, or rename it to match: no `{{subject}}.ts` or ' +
        '`{{subject}}.tsx` exists. Each test sits beside its subject as `<Name>.test.ts(x)`.',
    },
    schema: [],
  },
  create(context) {
    const path = repositoryPath(context);

    if (!isTestFile(path)) {
      return {};
    }

    // `Foo.a11y.test.tsx` tests `Foo`, and `todo.schema.test.ts` tests `todo.schema`.
    const parts = basename(path)
      .replace(/\.test\.tsx?$/, '')
      .split('.');

    const folders = posix.dirname(path).split('/');
    const subjectFolders = folders.filter((folder) => folder !== '__tests__');
    const subject = [...subjectFolders, parts[0]].join('/');

    const subjectFiles = parts.flatMap((_, index) =>
      ['.ts', '.tsx'].map(
        (extension) =>
          `${[...subjectFolders, parts.slice(0, index + 1).join('.')].join('/')}${extension}`,
      ),
    );

    return {
      Program(program) {
        if (subjectFolders.length < folders.length) {
          context.report({
            node: program,
            messageId: 'testsFolder',
            data: { test: path, subject },
          });
        } else if (!subjectFiles.some((file) => existsSync(join(context.cwd, file)))) {
          context.report({ node: program, messageId: 'missingSubject', data: { subject } });
        }
      },
    };
  },
};

/** The slice a path under a package's `src/` sits in: `{ kind, slice, rest }`, or null. */
function sliceOf(pathInSource) {
  const [kind, slice, ...rest] = pathInSource.split('/');

  return SLICE_KINDS.has(kind) && slice ? { kind, slice, rest } : null;
}

/** A string literal, or a template literal with no expressions, as its text. */
function staticText(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  return node?.type === 'TemplateLiteral' && node.expressions.length === 0
    ? node.quasis[0].value.cooked
    : undefined;
}

/**
 * The static module specifiers a file imports, re-exports or requires: `import`,
 * `export ... from`, `import()`, `require()` and `import x = require()`.
 */
function moduleSources(report) {
  const check = (node, source) => {
    const specifier = staticText(source);

    if (specifier !== undefined) {
      report(node, specifier);
    }
  };

  const checkSource = (node) => check(node, node.source);

  return {
    ImportDeclaration: checkSource,
    ExportNamedDeclaration: checkSource,
    ExportAllDeclaration: checkSource,
    ImportExpression: checkSource,
    TSExternalModuleReference: (node) => check(node, node.expression),
    CallExpression(node) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        check(node, node.arguments[0]);
      }
    },
  };
}

const sliceIsolation = {
  meta: {
    type: 'problem',
    messages: {
      sibling:
        'Remove this import of the sibling slice `{{target}}`. Folders under `src/{{kind}}/` ' +
        'never import each other: compose them in a route, or move the shared code into ' +
        '`packages/ui` or the one slice that owns it.',
      loose:
        'Move `{{file}}` into a folder of its own under `src/{{kind}}/`, for example ' +
        '`src/{{kind}}/<name>/{{file}}`. Every file under `src/{{kind}}/` belongs to one slice.',
      leavesPackage:
        'Import `{{source}}` by its package name instead of a relative path out of ' +
        '`{{packageRoot}}`. A package reaches another only through its name and public exports.',
    },
    schema: [],
  },
  create(context) {
    const path = repositoryPath(context);
    const source = PACKAGE_SOURCE.exec(path);

    if (!source) {
      return {};
    }

    const [, packageRoot, pathInSource] = source;
    const own = sliceOf(pathInSource);

    return {
      Program(program) {
        if (own && own.rest.length === 0) {
          context.report({
            node: program,
            messageId: 'loose',
            data: { file: own.slice, kind: own.kind },
          });
        }
      },
      ...moduleSources((node, specifier) => {
        if (!specifier.startsWith('.')) {
          return;
        }

        const target = posix.join(posix.dirname(path), specifier);

        if (!target.startsWith(packageRoot)) {
          context.report({
            node,
            messageId: 'leavesPackage',
            data: { source: specifier, packageRoot: packageRoot.replace(/\/$/, '') || '.' },
          });

          return;
        }

        const targetSlice = target.startsWith(`${packageRoot}src/`)
          ? sliceOf(target.slice(`${packageRoot}src/`.length))
          : null;

        if (own?.rest.length && targetSlice?.kind === own.kind && targetSlice.slice !== own.slice) {
          context.report({
            node,
            messageId: 'sibling',
            data: { target: `${targetSlice.kind}/${targetSlice.slice}`, kind: own.kind },
          });
        }
      }),
    };
  },
};

/** Local names bound to `name` imported from `source`, including `import * as` namespaces. */
function importTracker(source, name) {
  const locals = new Set();
  const namespaces = new Set();

  return {
    ImportDeclaration(node) {
      if (node.source.value !== source) {
        return;
      }

      node.specifiers.forEach((specifier) => {
        if (specifier.type !== 'ImportSpecifier') {
          namespaces.add(specifier.local.name);
        } else if (importedName(specifier) === name) {
          locals.add(specifier.local.name);
        }
      });
    },
    /** Whether `node` names the import: `name`, an alias of it, or `namespace.name`. */
    names(node) {
      if (node?.type === 'Identifier') {
        return locals.has(node.name);
      }

      return (
        node?.type === 'MemberExpression' &&
        node.object.type === 'Identifier' &&
        namespaces.has(node.object.name) &&
        node.property.type === 'Identifier' &&
        node.property.name === name
      );
    },
  };
}

/**
 * Tracks `Schema.toStandardSchemaV1(<schema>)` with `Schema` from `effect`, or
 * `toStandardSchemaV1` from `effect/Schema`: an Effect Schema handed to a
 * Standard Schema consumer (ADR 0036).
 */
function effectStandardSchema() {
  const schema = importTracker('effect', 'Schema');
  const schemaModule = importTracker('effect/Schema', 'toStandardSchemaV1');

  return {
    ImportDeclaration(node) {
      schema.ImportDeclaration(node);
      schemaModule.ImportDeclaration(node);
    },
    /** Whether `node` is that call. */
    wraps(node) {
      return (
        node?.type === 'CallExpression' &&
        (schemaModule.names(node.callee) ||
          (node.callee.type === 'MemberExpression' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === 'toStandardSchemaV1' &&
            schema.names(node.callee.object)))
      );
    },
  };
}

const API_SOURCE = /(^|\/)api\/src\//;

const procedureInputSchema = {
  meta: {
    type: 'problem',
    messages: {
      schema:
        'Pass the procedure input as `Schema.toStandardSchemaV1(<schema>)` with `Schema` from ' +
        '`effect`, so the procedure validates its input with Effect Schema (ADR 0011).',
    },
    schema: [],
  },
  create(context) {
    if (!API_SOURCE.test(repositoryPath(context)) || isTestFile(context.filename)) {
      return {};
    }

    const standardSchema = effectStandardSchema();

    return {
      ImportDeclaration: standardSchema.ImportDeclaration,
      CallExpression(node) {
        const { callee } = node;

        if (
          callee.type === 'MemberExpression' &&
          (callee.computed ? callee.property.value : callee.property.name) === 'input' &&
          !standardSchema.wraps(node.arguments[0])
        ) {
          context.report({ node, messageId: 'schema' });
        }
      },
    };
  },
};

const formUsesEffectSchema = {
  meta: {
    type: 'problem',
    messages: {
      resolver:
        'Pass `useForm({ resolver: standardSchemaResolver(Schema.toStandardSchemaV1(<schema>)) })` ' +
        'with `standardSchemaResolver` from `@hookform/resolvers/standard-schema` and `Schema` ' +
        'from `effect`, so the form validates with Effect Schema (ADR 0011). Pass the schema ' +
        'as the only argument, so the form submits the decoded value, and write the options ' +
        'inline, with no spread that could replace the resolver.',
    },
    schema: [],
  },
  create(context) {
    const useForm = importTracker('react-hook-form', 'useForm');
    const resolver = importTracker('@hookform/resolvers/standard-schema', 'standardSchemaResolver');
    const standardSchema = effectStandardSchema();

    const isEffectResolver = (property) =>
      property.type === 'Property' &&
      !property.computed &&
      (property.key.name ?? property.key.value) === 'resolver' &&
      property.value.type === 'CallExpression' &&
      resolver.names(property.value.callee) &&
      property.value.arguments.length === 1 &&
      standardSchema.wraps(property.value.arguments[0]);

    return {
      ImportDeclaration(node) {
        useForm.ImportDeclaration(node);
        resolver.ImportDeclaration(node);
        standardSchema.ImportDeclaration(node);
      },
      CallExpression(node) {
        if (!useForm.names(node.callee)) {
          return;
        }

        const [options] = node.arguments;

        const valid =
          options?.type === 'ObjectExpression' &&
          options.properties.some(isEffectResolver) &&
          !options.properties.some((property) => property.type === 'SpreadElement');

        if (!valid) {
          context.report({ node, messageId: 'resolver' });
        }
      },
    };
  },
};

// Sarah Fim's "anti-slop" factory bans a comment longer than a few lines:
// prefer self-explanatory code (NORTH_STAR §1). The scaffold ships one necessary
// four-line comment (`web/src/api-client/trpc.ts`), copied verbatim into every
// frozen trial result (ADR 0034, ADR 0035), so the enforced ceiling is four
// lines; a fifth line fails. ADR 0050 records the threshold.
const MAX_COMMENT_LINES = 4;

const noLargeComments = {
  meta: {
    type: 'suggestion',
    messages: {
      tooLong:
        'This comment spans {{lines}} lines. Keep a comment to {{max}} lines or fewer: delete it ' +
        'for self-explanatory code, or move a long rationale into a doc or an ADR.',
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode;
    const span = (first, last) => last.loc.end.line - first.loc.start.line + 1;

    const report = (first, last) =>
      context.report({
        loc: { start: first.loc.start, end: last.loc.end },
        messageId: 'tooLong',
        data: { lines: span(first, last), max: MAX_COMMENT_LINES },
      });

    return {
      Program() {
        let run = [];

        const flushRun = () => {
          if (run.length > 0 && span(run[0], run[run.length - 1]) > MAX_COMMENT_LINES) {
            report(run[0], run[run.length - 1]);
          }

          run = [];
        };

        source.getAllComments().forEach((comment) => {
          const previous = run.at(-1);

          if (
            previous &&
            (comment.loc.start.line > previous.loc.end.line + 1 ||
              source.text.slice(previous.range[1], comment.range[0]).trim())
          ) {
            flushRun();
          }

          run.push(comment);
        });

        flushRun();
      },
    };
  },
};

const useUiPrimitives = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { primitive: 'Use {{primitive}} from @repo/ui for this control.' },
  },
  create(context) {
    if (repositoryPath(context).startsWith('packages/ui/') || isTestFile(context.filename)) {
      return {};
    }

    const element = importTracker('react', 'createElement');

    const check = (node, tag, type) => {
      if (tag === 'button' || (tag === 'input' && !['checkbox', 'radio'].includes(type))) {
        context.report({
          node,
          messageId: 'primitive',
          data: { primitive: tag === 'button' ? 'Button' : 'TextField' },
        });
      }
    };

    return {
      ImportDeclaration: element.ImportDeclaration,
      JSXOpeningElement(node) {
        const type = node.attributes.findLast(
          (attribute) => attribute.type === 'JSXSpreadAttribute' || attribute.name.name === 'type',
        )?.value;

        check(node, node.name.name, type?.value ?? type?.expression?.value);
      },
      CallExpression(node) {
        if (element.names(node.callee)) {
          const type = node.arguments[1]?.properties?.findLast(
            (property) =>
              property.type === 'SpreadElement' ||
              property.computed ||
              property.key?.name === 'type' ||
              property.key?.value === 'type',
          );

          check(node, node.arguments[0]?.value, type?.computed ? undefined : type?.value?.value);
        }
      },
    };
  },
};

// A Tailwind arbitrary value, property or variant: `w-[13px]`, `[mask:none]`, `data-[open]:p-4`, `w-(--x)`.
const ARBITRARY_CLASS = /\S*(?:\[[^\s\]]*\]|-\([^\s)]*\))\S*/g;
const COLOUR_LITERAL =
  /(?<![\w&])#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi;

/** The Tailwind arbitrary-value tokens in a class list. Pure; shared with `scripts/check-styles.mjs`. */
export const arbitraryClasses = (text) => text.match(ARBITRARY_CLASS) ?? [];

/** The hex and colour-function literals in a text. Pure; shared with `scripts/check-styles.mjs`. */
export const colourLiterals = (text) => text.match(COLOUR_LITERAL) ?? [];

const STYLE_MESSAGES = {
  merge:
    'Build class constants and compose complete strings with cn from @repo/ui; remove concatenation, interpolation and other helpers (ADR 0121).',
  arbitrary:
    'Replace the Tailwind arbitrary value `{{value}}` with a class on the theme scale or a `@repo/ui` token (ADR 0114).',
  colour:
    'Replace the colour literal `{{value}}` with a `@repo/ui` colour token class such as `bg-surface` or `text-ink` (ADR 0114).',
  style:
    'Style with Tailwind classes on the theme scale; remove the inline `style` prop (ADR 0114).',
};

/** Class-value nodes, excluding predicates and call targets. */
const classChildren = (node) => {
  if (node.type === 'ConditionalExpression') return [node.consequent, node.alternate];
  if (node.type === 'LogicalExpression' && node.operator === '&&') return [node.right];
  if (node.type === 'CallExpression')
    return [
      ...(node.callee.type === 'MemberExpression' ? [node.callee.object] : []),
      ...node.arguments,
    ];
  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value?.type === 'string');
};

/** Both sides of || and ?? can yield a class value. */
const descendants = (node) => [node, ...classChildren(node).flatMap(descendants)];

const isStringLiteral = (node) => node.type === 'Literal' && typeof node.value === 'string';
const classLiteral = (node) => {
  if (isStringLiteral(node)) return [[node, node.value]];
  return node.type === 'TemplateElement' ? [[node, node.value.cooked ?? '']] : [];
};
const isCnImport = (definition) =>
  definition.type === 'ImportBinding' &&
  definition.node.type === 'ImportSpecifier' &&
  importedName(definition.node) === 'cn' &&
  definition.parent.importKind !== 'type' &&
  definition.node.importKind !== 'type';

const isClassComposition = (node, isUiCn) =>
  (node.type === 'BinaryExpression' && node.operator === '+') ||
  (node.type === 'TemplateLiteral' && node.expressions.length > 0) ||
  (node.type === 'CallExpression' && !isUiCn(node.callee));

const noArbitraryStyles = {
  meta: { type: 'problem', schema: [], messages: STYLE_MESSAGES },
  create(context) {
    if (isTestFile(context.filename) || API_SOURCE.test(repositoryPath(context))) {
      return {};
    }

    const check = (node, text) => {
      [
        ...arbitraryClasses(text).map((value) => ({ messageId: 'arbitrary', value })),
        ...colourLiterals(text).map((value) => ({ messageId: 'colour', value })),
      ].forEach(({ messageId, value }) => {
        context.report({ node, messageId, data: { value } });
      });
    };
    const constants = new Map();
    const classValues = [];

    const isUiCn = (node) => {
      if (node.type !== 'Identifier' || node.name !== 'cn') return false;
      const reference = context.sourceCode
        .getScope(node)
        .references.find(({ identifier }) => identifier === node);
      return (
        reference?.resolved?.defs.some((definition) => {
          const source = definition.parent?.source?.value;
          if (!isCnImport(definition)) return false;
          return (
            source === '@repo/ui' ||
            (repositoryPath(context).startsWith('packages/ui/') &&
              source.startsWith('.') &&
              posix
                .normalize(posix.join(posix.dirname(repositoryPath(context)), source))
                .replace(/\.ts$/, '') === 'packages/ui/src/cn')
          );
        }) ?? false
      );
    };

    // Resolve class constants before deduplicating nodes shared by attributes and cn calls.
    const classNodes = (node, seen) =>
      descendants(node).flatMap((child) => {
        if (child.type !== 'Identifier' || !constants.has(child.name) || seen.has(child.name))
          return [child];
        return [child, ...classNodes(constants.get(child.name), new Set([...seen, child.name]))];
      });

    return {
      'VariableDeclaration[kind="const"] > VariableDeclarator[id.type="Identifier"]': (node) => {
        if (node.init) constants.set(node.id.name, node.init);
      },
      'CallExpression[callee.name="cn"]': (node) => classValues.push(node),
      JSXAttribute(node) {
        if (node.name.name === 'style') context.report({ node, messageId: 'style' });
        if (['className', 'class'].includes(node.name.name) && node.value) {
          classValues.push(node.value);
        }
      },
      'Program:exit': () => {
        new Set(classValues.flatMap((value) => classNodes(value, new Set()))).forEach((node) => {
          const constant = node.type === 'Identifier' && constants.get(node.name);
          if (
            isClassComposition(node, isUiCn) ||
            (constant && (isStringLiteral(constant) || constant.type === 'TemplateLiteral'))
          ) {
            context.report({ node, messageId: 'merge' });
          }
          classLiteral(node).forEach(([literal, text]) => {
            check(literal, text);
          });
        });
      },
    };
  },
};

// Rules mined from nine agent rebuilds of the reference feature (ADR 0124).

const isSpecFile = (path) => /\.(test|spec)\.tsx?$/.test(path);

/** `ChainExpression` and `TSNonNullExpression` wrappers removed. */
const unwrapChain = (node) =>
  node?.type === 'ChainExpression' || node?.type === 'TSNonNullExpression'
    ? unwrapChain(node.expression)
    : node;

/** `{ root, node, names }` for a member chain such as `query.data?.message`, or null. */
function memberChain(node) {
  const current = unwrapChain(node);

  if (current?.type === 'Identifier') {
    return { root: current.name, node: current, names: [] };
  }

  if (current?.type !== 'MemberExpression' || current.computed) {
    return null;
  }

  const inner = memberChain(current.object);

  return inner && { ...inner, names: [...inner.names, current.property.name] };
}

/** The variable `name` names where `node` sits, found through the scope chain, or undefined. */
function variableAt(context, node, name) {
  const lookup = (scope) => (scope ? (scope.set.get(name) ?? lookup(scope.upper)) : undefined);

  return lookup(context.sourceCode.getScope(node));
}

/** The initialiser of the `const` an identifier names in its own scope, or null. */
function constInit(context, identifier) {
  const [definition, ...others] = variableAt(context, identifier, identifier.name)?.defs ?? [];

  return others.length === 0 &&
    definition?.type === 'Variable' &&
    definition.parent?.kind === 'const' &&
    definition.node.id.type === 'Identifier'
    ? definition.node.init
    : null;
}

const QUERY_HOOKS = new Set(['useQuery', 'useSuspenseQuery', 'useInfiniteQuery']);

/** `useQuery(…)`, `useSuspenseQuery(…)`, `useInfiniteQuery(…)` or a client's `x.useQuery(…)`. */
const isQueryCall = (node) => {
  const callee = node?.type === 'CallExpression' ? unwrapChain(node.callee) : null;
  const name = callee?.type === 'MemberExpression' ? callee.property.name : callee?.name;

  return QUERY_HOOKS.has(name);
};

// `error` and `isFetching` describe a state rather than choose one, so they stay out.
const QUERY_STATUS_FIELDS = new Set([
  'data',
  'status',
  'isPending',
  'isLoading',
  'isError',
  'isSuccess',
]);

/** What a value reads through: the left of `a ?? b`, or the key of a lookup such as `STATES[list.status]`. */
const READS_THROUGH = {
  LogicalExpression: (node) => node.left,
  MemberExpression: (node) => (node.computed ? node.property : null),
};

/** The expression a value reads, following one `const` binding resolved in its own scope. */
function readExpression(context, node, follow) {
  const value = unwrapChain(node);
  const inner = READS_THROUGH[value?.type]?.(value);

  if (inner) {
    return readExpression(context, inner, follow);
  }

  const bound = follow && value?.type === 'Identifier' ? constInit(context, value) : null;

  return bound ? readExpression(context, bound, false) : value;
}

/** The query state a value reads (`list.data ?? []` reads `data` of `list`), or null; only a query hook's result counts. */
function statusField(context, node) {
  const chain = memberChain(readExpression(context, node, true));
  const field = chain?.names[0];

  return QUERY_STATUS_FIELDS.has(field) && isQueryCall(constInit(context, chain.node))
    ? { root: chain.root, field }
    : null;
}

/** The object a function returns: a `return { ... }` or an arrow's `({ ... })` body. */
const returnedObject = (node) =>
  node.type === 'ReturnStatement'
    ? node.argument
    : node.type === 'ArrowFunctionExpression' && node.body;

const oneStatusFromHooks = {
  meta: {
    type: 'problem',
    messages: {
      status:
        "Return one `status` union from `{{hook}}` in place of {{fields}} from `{{root}}`, for example `{ status: 'loading' } | { status: 'failed' } | { status: 'loaded'; todos }`, so the page renders exactly one state.",
    },
    schema: [],
  },
  create(context) {
    if (isSpecFile(context.filename)) {
      return {};
    }

    const check = (node) => {
      const object = unwrapChain(returnedObject(node));
      const owner = context.sourceCode.getAncestors(node).findLast(isFunctionNode);
      const fn = node.type === 'ArrowFunctionExpression' ? node : owner;
      const hook = fn ? functionName(fn) : null;

      if (object?.type !== 'ObjectExpression' || !(hook && HOOK_NAME.test(hook))) {
        return;
      }

      const reads = object.properties
        .filter((property) => property.type === 'Property')
        .map((property) => statusField(context, property.value))
        .filter(Boolean);

      [...new Set(reads.map(({ root }) => root))]
        .map((root) => [
          root,
          [...new Set(reads.filter((read) => read.root === root).map(({ field }) => field))],
        ])
        .filter(([, fields]) => fields.length > 1)
        .forEach(([root, fields]) => {
          context.report({
            node: object,
            messageId: 'status',
            data: { hook, root, fields: fields.map((field) => `\`${field}\``).join(', ') },
          });
        });
    };

    return { ReturnStatement: check, ArrowFunctionExpression: check };
  },
};

const isEmptyString = (node) => node?.type === 'Literal' && node.value === '';

/** The value `x.ok ? x.value… : ''` reads, as source text, or null. */
function placeholderOutcome(node) {
  const negated = node.test.type === 'UnaryExpression' && node.test.operator === '!';
  const test = memberChain(negated ? node.test.argument : node.test);
  const fallback = negated ? node.consequent : node.alternate;

  return test?.names.at(-1) === 'ok' && fallback.type === 'Literal' ? { ...test, fallback } : null;
}

const testUnwrapsValues = {
  meta: {
    type: 'problem',
    messages: {
      present:
        'Unwrap `{{expression}}` with `present({{expression}})`, a Jest global that an E2E spec imports from `./fixtures`, so a missing value fails the test here instead of standing in as `{{fallback}}`.',
      unwrap:
        'Unwrap `{{expression}}` with `unwrap({{expression}})`, a Jest global, so a failure fails the test here with its problem instead of standing in as `{{fallback}}`.',
    },
    schema: [],
  },
  create(context) {
    if (!isSpecFile(context.filename)) {
      return {};
    }

    const report = (node, messageId, expression, fallback) =>
      context.report({
        node,
        messageId,
        data: { expression, fallback: context.sourceCode.getText(fallback) },
      });

    return {
      'LogicalExpression[operator="??"]'(node) {
        if (isEmptyString(node.right)) {
          report(node, 'present', context.sourceCode.getText(node.left), node.right);
        }
      },
      ConditionalExpression(node) {
        const outcome = placeholderOutcome(node);

        if (outcome) {
          report(
            node,
            'unwrap',
            [outcome.root, ...outcome.names.slice(0, -1)].join('.'),
            outcome.fallback,
          );
        }
      },
    };
  },
};

const EXPORTED_TYPE = /export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/g;

/** Each type name a module exports by declaration, mapped to its module specifier. */
function siblingTypes(directory, keepExtension) {
  return readdirSync(directory)
    .filter((file) => /\.tsx?$/.test(file) && !isSpecFile(file) && !file.endsWith('.d.ts'))
    .flatMap((file) =>
      [...readFileSync(join(directory, file), 'utf8').matchAll(EXPORTED_TYPE)].map((match) => [
        match[1],
        `./${keepExtension ? file : file.replace(/\.tsx?$/, '')}`,
      ]),
    );
}

const testImportsTheType = {
  meta: {
    type: 'problem',
    messages: {
      redeclared:
        'Import `{{name}}` from `{{module}}` in place of this copy, so the test follows the real shape when it changes.',
    },
    schema: [],
  },
  create(context) {
    if (!isSpecFile(context.filename)) {
      return {};
    }

    const exported = new Map(
      siblingTypes(dirname(context.filename), API_SOURCE.test(repositoryPath(context))),
    );

    const check = (node) => {
      const module = exported.get(node.id.name);

      if (module) {
        context.report({
          node: node.id,
          messageId: 'redeclared',
          data: { name: node.id.name, module },
        });
      }
    };

    return { TSInterfaceDeclaration: check, TSTypeAliasDeclaration: check };
  },
};

// A limit below ten is too common in prose ("3 times") to tie to one constant.
const SMALLEST_LIMIT = 10;
const LIMIT_WORDS = new Set(['MAX', 'MAXIMUM', 'MIN', 'MINIMUM', 'LIMIT', 'LENGTH', 'LEN']);

/** `TITLE_MAX_LENGTH` or `maxTitleLength`: a name with a limit word in it. */
const isLimitName = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toUpperCase()
    .split('_')
    .some((word) => LIMIT_WORDS.has(word));

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The limit written as a count of something: `100 characters`, `1,000 items`. */
const countPattern = (value) =>
  new RegExp(
    `(?<![\\w.,])(?:${[...new Set([String(value), value.toLocaleString('en-GB')])].map(escapeRegExp).join('|')})\\s+[A-Za-z]`,
  );

/** An import or export source, or text inside a JSX attribute, holds no message. */
const isMessageText = (context, node) =>
  !context.sourceCode
    .getAncestors(node)
    .some((ancestor) => ancestor.type === 'JSXAttribute' || ancestor.source === node);

const messageUsesItsLimit = {
  meta: {
    type: 'problem',
    messages: {
      limit:
        'Interpolate `{{name}}` into this text in place of {{value}}, so the message changes with the limit.',
    },
    schema: [],
  },
  create(context) {
    if (isSpecFile(context.filename)) {
      return {};
    }

    const limits = [];
    const texts = [];
    const addText = (node, text) => {
      if (isMessageText(context, node)) texts.push([node, text]);
    };

    return {
      'Program > VariableDeclaration[kind="const"] > VariableDeclarator, Program > ExportNamedDeclaration > VariableDeclaration[kind="const"] > VariableDeclarator'(
        node,
      ) {
        const value = node.init?.type === 'Literal' ? node.init.value : undefined;

        if (
          node.id.type === 'Identifier' &&
          isLimitName(node.id.name) &&
          typeof value === 'number' &&
          value >= SMALLEST_LIMIT
        ) {
          limits.push({ name: node.id.name, value, pattern: countPattern(value) });
        }
      },
      Literal(node) {
        if (isStringLiteral(node)) addText(node, node.value);
      },
      TemplateElement(node) {
        addText(node, node.value.cooked ?? '');
      },
      JSXText(node) {
        addText(node, node.value);
      },
      'Program:exit'() {
        texts.forEach(([node, text]) => {
          limits
            .filter(({ pattern }) => pattern.test(text))
            .forEach(({ name, value }) => {
              context.report({ node, messageId: 'limit', data: { name, value: String(value) } });
            });
        });
      },
    };
  },
};

const isSliceModule = (path) => {
  const source = PACKAGE_SOURCE.exec(path);

  return (
    Boolean(source && sliceOf(source[2])?.rest.length) &&
    !/^index\.[cm]?[jt]sx?$/.test(basename(path))
  );
};

const exportedName = (specifier) => specifier.local.name ?? specifier.local.value;

const importTypesFromTheirOwner = {
  meta: {
    type: 'problem',
    messages: {
      reexport:
        'Import `{{names}}` straight from `{{source}}` and remove this re-export; a slice re-exports only from its `index.ts`.',
      reexportAll:
        'Import each name you need straight from `{{source}}` and remove this re-export; a slice re-exports only from its `index.ts`.',
    },
    schema: [],
  },
  create(context) {
    if (!isSliceModule(repositoryPath(context))) {
      return {};
    }

    const imported = new Map();

    return {
      ImportDeclaration(node) {
        node.specifiers.forEach((specifier) => {
          imported.set(specifier.local.name, node.source.value);
        });
      },
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          return;
        }

        const passed = node.specifiers.filter(
          (specifier) => node.source || imported.has(exportedName(specifier)),
        );
        if (passed.length === 0) {
          return;
        }

        context.report({
          node,
          messageId: 'reexport',
          data: {
            names: passed.map(exportedName).join(', '),
            source: node.source?.value ?? imported.get(exportedName(passed[0])),
          },
        });
      },
      ExportAllDeclaration(node) {
        context.report({ node, messageId: 'reexportAll', data: { source: node.source.value } });
      },
    };
  },
};

const ignoresItsError = (handler) =>
  isFunctionNode(handler) && handler.params.every((param) => /^_/.test(param.name ?? ''));

/** What a handler body returns: the arrow's expression, a lone `return`'s argument, or null for nothing. */
function returnedExpression(body) {
  if (body.type !== 'BlockStatement') {
    return body;
  }

  const [only] = body.body;

  if (!only) {
    return null;
  }

  return body.body.length === 1 && only.type === 'ReturnStatement' ? only.argument : body;
}

const SWALLOWED_VALUES = {
  Literal: (node) => node.raw ?? String(node.value),
  Identifier: (node) => (node.name === 'undefined' ? 'undefined' : null),
};

/** The value a rejection handler turns the failure into, as text, or null when it uses the error. */
function swallowedValue(handler) {
  if (!ignoresItsError(handler)) {
    return null;
  }

  const value = returnedExpression(handler.body);

  return value === null ? 'undefined' : (SWALLOWED_VALUES[value.type]?.(value) ?? null);
}

/** The argument that handles a rejection: `.catch(onRejected)`, `.then(onFulfilled, onRejected)`. */
const REJECTION_HANDLER = new Map([
  ['catch', 0],
  ['then', 1],
]);

const keepRejections = {
  meta: {
    type: 'problem',
    messages: {
      swallowed:
        'Handle the failure where it shows (`onError`, a `failure` state) and let the promise reject; returning `{{value}}` hides the error from callers and tests.',
    },
    schema: [],
  },
  create(context) {
    if (isSpecFile(context.filename)) {
      return {};
    }

    const resolve = (node) =>
      node?.type === 'Identifier' ? (constInit(context, node) ?? node) : node;

    return {
      CallExpression(node) {
        const method =
          node.callee.type === 'MemberExpression' && !node.callee.computed
            ? node.callee.property.name
            : undefined;
        const handler = node.arguments[REJECTION_HANDLER.get(method) ?? node.arguments.length];
        const value = handler && swallowedValue(resolve(handler));

        if (value) context.report({ node, messageId: 'swallowed', data: { value } });
      },
    };
  },
};

export default {
  meta: { name: 'policy' },
  rules: {
    'no-let': {
      meta: { type: 'suggestion', schema: [] },
      create: (context) => ({
        'VariableDeclaration[kind="let"]': (node) =>
          context.report({
            node,
            message:
              'Bind with `const`; derive the value with a function, early return, a lookup object or `map`/`reduce`.',
          }),
      }),
    },
    'no-mutation': {
      meta: { type: 'suggestion', schema: [] },
      create(context) {
        const filename = context.physicalFilename ?? context.filename;
        if (
          /\.(test|spec)\.tsx?$/.test(filename) ||
          /\/features\/[^/]+\/integrations(\.ts|\/)/.test(filename)
        )
          return {};
        const report = (node) =>
          context.report({
            node,
            message:
              "Build a new value (`map`, `filter`, `toSorted`, spread, `Object.fromEntries`) instead of mutating; keep state in a hook or the feature's integrations.",
          });
        return {
          'AssignmentExpression[left.type="MemberExpression"]': (node) => {
            if (node.left.property.name !== 'current') report(node);
          },
          'UnaryExpression[operator="delete"]': report,
          CallExpression(node) {
            const callee = node.callee;
            if (callee.type !== 'MemberExpression') return;
            if (
              !callee.computed &&
              [
                'push',
                'pop',
                'shift',
                'unshift',
                'splice',
                'sort',
                'reverse',
                'fill',
                'copyWithin',
              ].includes(callee.property.name)
            )
              report(node);
            if (
              callee.object.name === 'Object' &&
              callee.property.name === 'assign' &&
              node.arguments[0]?.type !== 'ObjectExpression'
            )
              report(node);
          },
        };
      },
    },
    'no-classes': {
      meta: { type: 'suggestion', schema: [] },
      create: (context) =>
        Object.fromEntries(
          [
            'ClassDeclaration[superClass=null]',
            'ClassExpression[superClass=null]',
            'ThisExpression',
          ].map((selector) => [
            selector,
            (node) =>
              context.report({
                node,
                message:
                  'Use functions and plain objects; a class is allowed only to extend a framework base such as `Schema.TaggedErrorClass` or `Error`.',
              }),
          ]),
        ),
    },
    'no-switch': {
      meta: { type: 'suggestion', schema: [] },
      create: (context) => ({
        SwitchStatement: (node) =>
          context.report({
            node,
            message:
              'Use a lookup object typed `Record<Union, …>` with `satisfies`, or Effect `Match` for exhaustive branching.',
          }),
      }),
    },
    'no-loops': {
      meta: { type: 'suggestion', schema: [] },
      create: (context) =>
        Object.fromEntries(
          [
            [
              'ForStatement',
              '[ForStatement] Prefer declarative iteration: map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of a for loop.',
            ],
            [
              'ForInStatement',
              '[ForInStatement] Prefer Object.keys/Object.entries with map/filter/reduce/flatMap/some/every/find/Array.from instead of for...in.',
            ],
            [
              'ForOfStatement[await=false]',
              '[ForOfStatement] Prefer map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from instead of for...of.',
            ],
            [
              'WhileStatement',
              '[WhileStatement] Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of while.',
            ],
            [
              'DoWhileStatement',
              '[DoWhileStatement] Prefer declarative iteration (map/filter/reduce/flatMap/some/every/find/Object.entries/Array.from) instead of do...while.',
            ],
          ].map(([selector, message]) => [selector, (node) => context.report({ node, message })]),
        ),
    },
    'no-hand-written-globs': {
      meta: { type: 'suggestion', schema: [] },
      create(context) {
        const path = repositoryPath(context);
        if (!/^(scripts|tooling)\//.test(path) || /\.(test|spec)\.ts$/.test(path)) return {};
        const report = (node, value) => {
          if (typeof value === 'string' && /^\*\*\/?$/.test(value)) {
            context.report({
              node,
              message:
                "Match globs with `matchesGlob` from 'node:path', or ask the tool for its file list (`fallow config`, `jest --listTests`). A hand-written glob translator drifts from the tool (ADR 0041).",
            });
          }
        };
        return {
          Literal: (node) => report(node, node.value),
          'TemplateLiteral[expressions.length=0]': (node) =>
            report(node, node.quasis[0]?.value.cooked),
        };
      },
    },
    'one-component-per-file': oneComponentPerFile,
    'no-large-comments': noLargeComments,
    'use-ui-primitives': useUiPrimitives,
    'no-arbitrary-styles': noArbitraryStyles,
    'state-and-effects-in-hooks': stateAndEffectsInHooks,
    'handler-names': handlerNames,
    'callback-prop-names': callbackPropNames,
    'pages-in-routes': pagesInRoutes,
    'file-matches-export': fileMatchesExport,
    'folder-names': folderNames,
    'role-named-folders': roleNamedFolders,
    'test-beside-subject': testBesideSubject,
    'slice-isolation': sliceIsolation,
    'procedure-input-schema': procedureInputSchema,
    'form-uses-effect-schema': formUsesEffectSchema,
    'one-status-from-hooks': oneStatusFromHooks,
    'test-unwraps-values': testUnwrapsValues,
    'test-imports-the-type': testImportsTheType,
    'message-uses-its-limit': messageUsesItsLimit,
    'import-types-from-their-owner': importTypesFromTheirOwner,
    'keep-rejections': keepRejections,
  },
};
