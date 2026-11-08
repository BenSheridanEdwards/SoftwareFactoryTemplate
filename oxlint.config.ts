import { fileURLToPath } from 'node:url';
import { RECOMMENDED_RULES } from 'oxlint-plugin-react-doctor';
import { generalRules } from './tooling/oxlint-general-rules.ts';
import doctor from './tooling/oxlint-plugin-react-doctor.js';

// Each excluded rule repeats a check owned by the native rule named beside it.
const singleOwnerRules = {
  'react-doctor/alt-text': true, // jsx-a11y/alt-text
  'react-doctor/anchor-ambiguous-text': true, // jsx-a11y/anchor-ambiguous-text
  'react-doctor/anchor-has-content': true, // jsx-a11y/anchor-has-content
  'react-doctor/anchor-is-valid': true, // jsx-a11y/anchor-is-valid
  'react-doctor/aria-activedescendant-has-tabindex': true, // jsx-a11y/aria-activedescendant-has-tabindex
  'react-doctor/aria-props': true, // jsx-a11y/aria-props
  'react-doctor/aria-proptypes': true, // jsx-a11y/aria-proptypes
  'react-doctor/aria-role': true, // jsx-a11y/aria-role
  'react-doctor/aria-unsupported-elements': true, // jsx-a11y/aria-unsupported-elements
  'react-doctor/autocomplete-valid': true, // jsx-a11y/autocomplete-valid
  'react-doctor/button-has-type': true, // react/button-has-type
  'react-doctor/click-events-have-key-events': true, // jsx-a11y/click-events-have-key-events
  'react-doctor/heading-has-content': true, // jsx-a11y/heading-has-content
  'react-doctor/html-has-lang': true, // jsx-a11y/html-has-lang
  'react-doctor/iframe-has-title': true, // jsx-a11y/iframe-has-title
  'react-doctor/img-redundant-alt': true, // jsx-a11y/img-redundant-alt
  'react-doctor/interactive-supports-focus': true, // jsx-a11y/interactive-supports-focus
  'react-doctor/label-has-associated-control': true, // jsx-a11y/label-has-associated-control
  'react-doctor/lang': true, // jsx-a11y/lang
  'react-doctor/media-has-caption': true, // jsx-a11y/media-has-caption
  'react-doctor/mouse-events-have-key-events': true, // jsx-a11y/mouse-events-have-key-events
  'react-doctor/no-access-key': true, // jsx-a11y/no-access-key
  'react-doctor/no-aria-hidden-on-focusable': true, // jsx-a11y/no-aria-hidden-on-focusable
  'react-doctor/no-autofocus': true, // jsx-a11y/no-autofocus
  'react-doctor/no-distracting-elements': true, // jsx-a11y/no-distracting-elements
  'react-doctor/no-interactive-element-to-noninteractive-role': true, // jsx-a11y/no-interactive-element-to-noninteractive-role
  'react-doctor/no-noninteractive-element-to-interactive-role': true, // jsx-a11y/no-noninteractive-element-to-interactive-role
  'react-doctor/no-noninteractive-tabindex': true, // jsx-a11y/no-noninteractive-tabindex
  'react-doctor/no-redundant-roles': true, // jsx-a11y/no-redundant-roles
  'react-doctor/no-static-element-interactions': true, // jsx-a11y/no-static-element-interactions
  'react-doctor/prefer-tag-over-role': true, // jsx-a11y/prefer-tag-over-role
  'react-doctor/role-has-required-aria-props': true, // jsx-a11y/role-has-required-aria-props
  'react-doctor/role-supports-aria-props': true, // jsx-a11y/role-supports-aria-props
  'react-doctor/scope': true, // jsx-a11y/scope
  'react-doctor/tabindex-no-positive': true, // jsx-a11y/tabindex-no-positive
  'react-doctor/jsx-key': true, // react/jsx-key
  'react-doctor/no-render-return-value': true, // react/no-render-return-value
  'react-doctor/void-dom-elements-no-children': true, // react/void-dom-elements-no-children
  'react-doctor/no-spread-accumulator-in-reduce': true, // oxc/no-accumulating-spread
  'react-doctor/jsx-no-script-url': true, // react/jsx-no-script-url
  'react-doctor/jsx-no-target-blank': true, // react/jsx-no-target-blank
  'react-doctor/no-danger-with-children': true, // react/no-danger-with-children
  'react-doctor/no-eval': true, // eslint/no-eval
  'react-doctor/no-non-null-assertion-on-maybe-undefined-result': true, // typescript/no-non-null-assertion
  'react-doctor/jsx-no-comment-textnodes': true, // react/jsx-no-comment-textnodes
  'react-doctor/jsx-no-duplicate-props': true, // react/jsx-no-duplicate-props
  'react-doctor/no-array-index-as-key': true, // react/no-array-index-key
  'react-doctor/rules-of-hooks': true, // react-hooks/rules-of-hooks
  'react-doctor/exhaustive-deps': true, // react-hooks/exhaustive-deps
  'react-doctor/no-set-state-in-render': true, // react-hooks/set-state-in-render
  'react-doctor/no-derived-state-effect': true, // react-hooks/set-state-in-effect
  'react-doctor/no-ref-current-in-render': true, // react-hooks/refs
  'react-doctor/no-nested-component-definition': true, // react-hooks/static-components
  'react-doctor/no-unstable-nested-components': true, // react-hooks/static-components
};

const unusedFrameworkPrefixes = [
  'r3f-',
  'three-',
  'motion-',
  'shadcn-',
  'tanstack-',
  'react-router-',
  'zod-v4-',
  'ink-',
  'jotai-',
  'mobx-',
  'redux-',
  'valtio-',
  'zustand-',
  'server-',
  'base-ui-',
  'radix-',
  'react-aria-',
  'styled-components-',
  'webgl-',
  'react-markdown-',
];
const unusedFrameworkRules = [
  'use-lazy-motion',
  'no-conflicting-spring-options',
  'no-static-motion-config-never',
];
const reactDoctorRules = Object.fromEntries(
  Object.entries(RECOMMENDED_RULES)
    .filter(([name]) => !Object.hasOwn(singleOwnerRules, name))
    .filter(
      ([name, severity]) =>
        severity !== 'warn' ||
        !(
          unusedFrameworkPrefixes.some((prefix) => name.startsWith(`react-doctor/${prefix}`)) ||
          unusedFrameworkRules.some((rule) => name === `react-doctor/${rule}`)
        ),
    )
    .map(([name]) => [name, 'error']),
);

export default {
  categories: {
    correctness: 'off',
    suspicious: 'off',
    pedantic: 'off',
    perf: 'off',
    style: 'off',
    restriction: 'off',
    nursery: 'off',
  },
  plugins: ['react', 'unicorn', 'typescript', 'jsx-a11y', 'oxc', 'jest'],
  options: { respectEslintDisableDirectives: false },
  jsPlugins: [
    {
      name: 'better-tailwindcss',
      specifier: import.meta.resolve('eslint-plugin-better-tailwindcss'),
    },
    fileURLToPath(new URL('./tooling/oxlint-plugin-policy.js', import.meta.url)),
    fileURLToPath(new URL('./tooling/oxlint-plugin-naming.js', import.meta.url)),
    {
      name: doctor.meta.name,
      specifier: fileURLToPath(new URL('./tooling/oxlint-plugin-react-doctor.js', import.meta.url)),
    },
  ],
  settings: {
    'react-doctor': { portedRuleMode: 'curated' },
    'better-tailwindcss': {
      cwd: fileURLToPath(new URL('./apps/web', import.meta.url)),
      entryPoint: fileURLToPath(new URL('./packages/ui/src/styles.css', import.meta.url)),
    },
  },
  ignorePatterns: [
    '**/dist/**',
    'coverage/**',
    'vendor/**',
    'playwright-report/**',
    'test-results/**',
    '.cache/**',
  ],
  rules: {
    ...generalRules,
    'no-else-return': ['error', { allowElseIf: false }],
    'no-param-reassign': ['error', { props: true }],
    'policy/no-loops': 'error',
    'policy/no-hand-written-globs': 'error',
  },
  overrides: [
    {
      files: [
        'apps/web/src/**/*.{ts,tsx}',
        'packages/ui/src/**/*.{ts,tsx}',
        'showcase/*/web/src/**/*.{ts,tsx}',
      ],
      excludeFiles: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
      rules: {
        'better-tailwindcss/enforce-consistent-class-order': 'error',
        'better-tailwindcss/no-unknown-classes': 'error',
        'better-tailwindcss/no-conflicting-classes': 'error',
        'better-tailwindcss/no-duplicate-classes': 'error',
        'better-tailwindcss/no-deprecated-classes': 'error',
        'better-tailwindcss/enforce-shorthand-classes': 'error',
        'better-tailwindcss/no-concatenated-classes': 'error',
      },
    },
    {
      files: ['{apps,packages}/*/src/**/*.{ts,tsx}', 'showcase/*/*/src/**/*.{ts,tsx}'],
      rules: {
        'policy/no-let': 'error',
        'policy/no-mutation': 'error',
        'policy/no-classes': 'error',
        'policy/no-switch': 'error',
        'no-lonely-if': 'error',
        'no-nested-ternary': 'error',
        'unicorn/no-array-for-each': 'error',
        'unicorn/no-array-sort': 'error',
        'unicorn/no-array-reverse': 'error',
        'unicorn/prefer-array-find': 'error',
        'unicorn/prefer-array-some': 'error',
        'unicorn/prefer-array-flat': 'error',
        'unicorn/prefer-object-from-entries': 'error',
        ...reactDoctorRules,
        'react/rules-of-hooks': 'error',
        'react/exhaustive-deps': 'error',
        'react/error-boundaries': 'error',
        'react/globals': 'error',
        'react/immutability': 'error',
        'react/incompatible-library': 'error',
        'react/preserve-manual-memoization': 'error',
        'react/purity': 'error',
        'react/refs': 'error',
        'react/set-state-in-effect': 'error',
        'react/set-state-in-render': 'error',
        'react/static-components': 'error',
        'react/use-memo': 'error',
        'react/void-use-memo': 'error',
        'react/unsupported-syntax': 'error',
        'react-doctor/prefer-function-component': 'error',
        'policy/one-component-per-file': 'error',
        'policy/no-large-comments': 'error',
        'policy/use-ui-primitives': 'error',
        'policy/no-arbitrary-styles': 'error',
        'policy/state-and-effects-in-hooks': 'error',
        'policy/handler-names': 'error',
        'policy/callback-prop-names': 'error',
        'policy/pages-in-routes': 'error',
        'policy/file-matches-export': 'error',
        'policy/folder-names': 'error',
        'policy/role-named-folders': 'error',
        'policy/test-beside-subject': 'error',
        'policy/slice-isolation': 'error',
        'policy/procedure-input-schema': 'error',
        'policy/form-uses-effect-schema': 'error',
        'max-depth': ['error', 4],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '**/features/*/*',
                  '**/shared/*/*',
                  '**/routes/*/*',
                  '**/api-client/*',
                  '!**/features/*/index.ts',
                  '!**/routes/*/index.ts',
                ],
                message:
                  'Import the module through its public surface, for example `../../features/name-input` or `./features/greeting/index.ts` in the api.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['{apps,packages}/*/src/**/*.{ts,tsx}', 'showcase/*/*/src/**/*.{ts,tsx}'],
      excludeFiles: ['{apps,showcase/*}/web/src/main.tsx'],
      rules: { 'no-restricted-globals': ['error', 'document', 'window'] },
    },
    {
      // Naming and file names, ported from Biome's override (ADR 0126).
      files: ['{apps,packages}/*/src/**', 'showcase/*/*/src/**'],
      rules: {
        'naming/naming-convention': 'error',
        'unicorn/filename-case': ['error', { cases: { camelCase: true, pascalCase: true } }],
      },
    },
  ],
};
