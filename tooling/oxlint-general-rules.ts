// General lint rules, owned by Oxlint since ADR 0124 retired Biome's linter.
// Each native rule names the Biome rule it replaces. `oxlint.config.ts`
// spreads this table into its root rules, so every linted file gets it.
export const generalRules = {
  'eslint/array-callback-return': 'error', // Biome suspicious/useIterableCallbackReturn
  'eslint/constructor-super': 'error', // Biome correctness/noInvalidConstructorSuper
  'eslint/default-case-last': 'error', // Biome suspicious/useDefaultSwitchClauseLast
  'eslint/eqeqeq': ['error', 'always', { null: 'ignore' }], // Biome suspicious/noDoubleEquals
  'eslint/for-direction': 'error', // Biome correctness/useValidForDirection
  'eslint/getter-return': 'error', // Biome suspicious/useGetterReturn
  'eslint/no-array-constructor': 'error', // Biome style/useArrayLiterals
  'eslint/no-async-promise-executor': 'error', // Biome suspicious/noAsyncPromiseExecutor
  'eslint/no-case-declarations': 'error', // Biome correctness/noSwitchDeclarations
  'eslint/no-class-assign': 'error', // Biome suspicious/noClassAssign
  'eslint/no-compare-neg-zero': 'error', // Biome suspicious/noCompareNegZero
  'eslint/no-cond-assign': 'error', // Biome suspicious/noAssignInExpressions
  'eslint/no-const-assign': 'error', // Biome correctness/noConstAssign
  'eslint/no-constant-condition': 'error', // Biome correctness/noConstantCondition
  'eslint/no-constructor-return': 'error', // Biome correctness/noConstructorReturn
  'eslint/no-control-regex': 'error', // Biome suspicious/noControlCharactersInRegex
  'eslint/no-debugger': 'error', // Biome suspicious/noDebugger
  'eslint/no-dupe-class-members': 'error', // Biome suspicious/noDuplicateClassMembers
  'eslint/no-dupe-else-if': 'error', // Biome suspicious/noDuplicateElseIf
  'eslint/no-dupe-keys': 'error', // Biome suspicious/noDuplicateObjectKeys
  'eslint/no-duplicate-case': 'error', // Biome suspicious/noDuplicateCase
  'eslint/no-empty': 'error', // Biome suspicious/noEmptyBlockStatements
  'eslint/no-empty-character-class': 'error', // Biome correctness/noEmptyCharacterClassInRegex
  'eslint/no-empty-pattern': 'error', // Biome correctness/noEmptyPattern
  'eslint/no-eval': 'error', // Biome security/noGlobalEval
  'eslint/no-ex-assign': 'error', // Biome suspicious/noCatchAssign
  'eslint/no-extra-boolean-cast': 'error', // Biome complexity/noExtraBooleanCast
  'eslint/no-extra-label': 'error', // Biome complexity/noUselessLabel
  'eslint/no-fallthrough': 'error', // Biome suspicious/noFallthroughSwitchClause
  'eslint/no-func-assign': 'error', // Biome suspicious/noFunctionAssign
  'eslint/no-global-assign': 'error', // Biome suspicious/noGlobalAssign
  'eslint/no-import-assign': 'error', // Biome suspicious/noImportAssign
  'eslint/no-inner-declarations': 'error', // Biome correctness/noInnerDeclarations
  'eslint/no-irregular-whitespace': 'error', // Biome suspicious/noIrregularWhitespace
  'eslint/no-label-var': 'error', // Biome suspicious/noLabelVar
  'eslint/no-labels': 'error', // Biome suspicious/noConfusingLabels
  'eslint/no-lone-blocks': 'error', // Biome complexity/noUselessLoneBlockStatements
  'eslint/no-loss-of-precision': 'error', // Biome correctness/noPrecisionLoss
  'eslint/no-misleading-character-class': 'error', // Biome suspicious/noMisleadingCharacterClass
  'eslint/no-new-native-nonconstructor': 'error', // Biome correctness/noInvalidBuiltinInstantiation
  'eslint/no-nonoctal-decimal-escape': 'error', // Biome correctness/noNonoctalDecimalEscape
  'eslint/no-obj-calls': 'error', // Biome correctness/noGlobalObjectCalls
  'eslint/no-plusplus': 'error', // Biome style/noIncrementDecrement
  'eslint/no-proto': 'error', // Biome suspicious/noProto
  'eslint/no-prototype-builtins': 'error', // Biome suspicious/noPrototypeBuiltins
  'eslint/no-redeclare': 'error', // Biome suspicious/noRedeclare
  'eslint/no-regex-spaces': 'error', // Biome complexity/noAdjacentSpacesInRegex
  'eslint/no-self-assign': 'error', // Biome correctness/noSelfAssign
  'eslint/no-self-compare': 'error', // Biome suspicious/noSelfCompare
  'eslint/no-sequences': 'error', // Biome complexity/noCommaOperator
  'eslint/no-setter-return': 'error', // Biome correctness/noSetterReturn
  'eslint/no-shadow-restricted-names': 'error', // Biome suspicious/noShadowRestrictedNames
  'eslint/no-sparse-arrays': 'error', // Biome suspicious/noSparseArray
  'eslint/no-template-curly-in-string': 'error', // Biome suspicious/noTemplateCurlyInString
  'eslint/no-this-before-super': 'error', // Biome correctness/noUnreachableSuper
  'eslint/no-unneeded-ternary': 'error', // Biome complexity/noUselessTernary
  'eslint/no-unreachable': 'error', // Biome correctness/noUnreachable
  'eslint/no-unsafe-finally': 'error', // Biome correctness/noUnsafeFinally
  'eslint/no-unsafe-negation': 'error', // Biome suspicious/noUnsafeNegation
  'eslint/no-unsafe-optional-chaining': 'error', // Biome correctness/noUnsafeOptionalChaining
  'eslint/no-unused-labels': 'error', // Biome correctness/noUnusedLabels
  'eslint/no-unused-private-class-members': 'error', // Biome correctness/noUnusedPrivateClassMembers
  'eslint/no-unused-vars': [
    'error',
    {
      args: 'after-used',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'none',
      ignoreRestSiblings: true,
    },
  ], // Biome correctness/noUnusedFunctionParameters, correctness/noUnusedImports, correctness/noUnusedVariables
  'eslint/no-use-before-define': [
    'error',
    {
      functions: false,
      classes: false,
      variables: false,
      typedefs: false,
      ignoreTypeReferences: true,
    },
  ], // Biome correctness/noInvalidUseBeforeDeclaration
  'eslint/no-useless-backreference': 'error', // Biome suspicious/noUselessRegexBackrefs
  'eslint/no-useless-catch': 'error', // Biome complexity/noUselessCatch
  'eslint/no-useless-constructor': 'error', // Biome complexity/noUselessConstructor
  'eslint/no-useless-escape': 'error', // Biome complexity/noUselessEscapeInRegex, suspicious/noUselessEscapeInString
  'eslint/no-useless-rename': 'error', // Biome complexity/noUselessRename
  'eslint/no-var': 'error', // Biome suspicious/noVar
  'eslint/no-with': 'error', // Biome suspicious/noWith
  'eslint/prefer-arrow-callback': 'error', // Biome complexity/useArrowFunction
  'eslint/prefer-const': 'error', // Biome style/useConst
  'eslint/prefer-exponentiation-operator': 'error', // Biome style/useExponentiationOperator
  'eslint/prefer-numeric-literals': 'error', // Biome complexity/useNumericLiterals
  'eslint/prefer-regex-literals': 'error', // Biome complexity/useRegexLiterals
  'eslint/prefer-rest-params': 'error', // Biome complexity/noArguments
  'eslint/prefer-template': 'error', // Biome style/useTemplate
  'eslint/radix': 'error', // Biome correctness/useParseIntRadix
  'eslint/require-yield': 'error', // Biome correctness/useYield
  'eslint/use-isnan': 'error', // Biome correctness/useIsNan
  'eslint/valid-typeof': 'error', // Biome correctness/useValidTypeof
  'jsx-a11y/alt-text': 'error', // Biome a11y/useAltText
  'jsx-a11y/anchor-ambiguous-text': 'error', // Biome a11y/noAmbiguousAnchorText
  'jsx-a11y/anchor-has-content': 'error', // Biome a11y/useAnchorContent
  'jsx-a11y/anchor-is-valid': 'error', // Biome a11y/useValidAnchor
  'jsx-a11y/aria-activedescendant-has-tabindex': 'error', // Biome a11y/useAriaActivedescendantWithTabindex
  'jsx-a11y/aria-props': 'error', // Biome a11y/useValidAriaProps
  'jsx-a11y/aria-proptypes': 'error', // Biome a11y/useValidAriaValues
  'jsx-a11y/aria-role': 'error', // Biome a11y/useValidAriaRole
  'jsx-a11y/aria-unsupported-elements': 'error', // Biome a11y/noAriaUnsupportedElements
  'jsx-a11y/autocomplete-valid': 'error', // Biome a11y/useValidAutocomplete
  'jsx-a11y/click-events-have-key-events': 'error', // Biome a11y/useKeyWithClickEvents
  'jsx-a11y/heading-has-content': 'error', // Biome a11y/useHeadingContent
  'jsx-a11y/html-has-lang': 'error', // Biome a11y/useHtmlLang
  'jsx-a11y/iframe-has-title': 'error', // Biome a11y/useIframeTitle
  'jsx-a11y/img-redundant-alt': 'error', // Biome a11y/noRedundantAlt
  'jsx-a11y/interactive-supports-focus': 'error', // Biome a11y/useFocusableInteractive
  'jsx-a11y/label-has-associated-control': 'error', // Biome a11y/noLabelWithoutControl
  'jsx-a11y/lang': 'error', // Biome a11y/useValidLang
  'jsx-a11y/media-has-caption': 'error', // Biome a11y/useMediaCaption
  'jsx-a11y/mouse-events-have-key-events': 'error', // Biome a11y/useKeyWithMouseEvents
  'jsx-a11y/no-access-key': 'error', // Biome a11y/noAccessKey
  'jsx-a11y/no-aria-hidden-on-focusable': 'error', // Biome a11y/noAriaHiddenOnFocusable
  'jsx-a11y/no-autofocus': 'error', // Biome a11y/noAutofocus
  'jsx-a11y/no-distracting-elements': 'error', // Biome a11y/noDistractingElements
  'jsx-a11y/no-interactive-element-to-noninteractive-role': 'error', // Biome a11y/noInteractiveElementToNoninteractiveRole
  'jsx-a11y/no-noninteractive-element-to-interactive-role': 'error', // Biome a11y/noNoninteractiveElementToInteractiveRole
  'jsx-a11y/no-noninteractive-tabindex': 'error', // Biome a11y/noNoninteractiveTabindex
  'jsx-a11y/no-redundant-roles': 'error', // Biome a11y/noRedundantRoles
  'jsx-a11y/no-static-element-interactions': 'error', // Biome a11y/noStaticElementInteractions
  'jsx-a11y/prefer-tag-over-role': 'error', // Biome a11y/useSemanticElements
  'jsx-a11y/role-has-required-aria-props': 'error', // Biome a11y/useAriaPropsForRole
  'jsx-a11y/role-supports-aria-props': 'error', // Biome a11y/useAriaPropsSupportedByRole
  'jsx-a11y/scope': 'error', // Biome a11y/noHeaderScope
  'jsx-a11y/tabindex-no-positive': 'error', // Biome a11y/noPositiveTabindex
  'nextjs/google-font-display': 'error', // Biome suspicious/useGoogleFontDisplay
  'oxc/no-accumulating-spread': 'error', // Biome performance/noAccumulatingSpread
  'oxc/no-const-enum': 'error', // Biome suspicious/noConstEnum
  'react/button-has-type': 'error', // Biome a11y/useButtonType
  'react/jsx-no-comment-textnodes': 'error', // Biome suspicious/noCommentText
  'react/jsx-no-duplicate-props': 'error', // Biome suspicious/noDuplicateJsxProps
  'react/jsx-no-script-url': 'error', // Biome security/noScriptUrl
  'react/jsx-no-target-blank': 'error', // Biome security/noBlankTarget
  'react/jsx-no-useless-fragment': 'error', // Biome complexity/noUselessFragments
  'react/void-dom-elements-no-children': 'error', // Biome correctness/noVoidElementsWithChildren
  'typescript/adjacent-overload-signatures': 'error', // Biome suspicious/useAdjacentOverloadSignatures
  'typescript/ban-ts-comment': 'error', // Biome suspicious/noTsIgnore
  'typescript/ban-types': 'error', // Biome complexity/noBannedTypes
  'typescript/consistent-type-definitions': ['error', 'interface'], // Biome style/useConsistentTypeDefinitions
  'typescript/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'separate-type-imports', disallowTypeAnnotations: false },
  ], // Biome style/useImportType
  'typescript/no-duplicate-enum-values': 'error', // Biome suspicious/noDuplicateEnumValues
  'typescript/no-empty-interface': 'error', // Biome suspicious/noEmptyInterface
  'typescript/no-explicit-any': 'error', // Biome suspicious/noExplicitAny
  'typescript/no-extra-non-null-assertion': 'error', // Biome suspicious/noExtraNonNullAssertion
  'typescript/no-invalid-void-type': 'error', // Biome suspicious/noConfusingVoidType
  'typescript/no-misused-new': 'error', // Biome suspicious/noMisleadingInstantiator
  'typescript/no-non-null-asserted-optional-chain': 'error', // Biome suspicious/noNonNullAssertedOptionalChain
  'typescript/no-non-null-assertion': 'error', // Biome style/noNonNullAssertion
  'typescript/no-this-alias': 'error', // Biome complexity/noUselessThisAlias
  'typescript/no-unnecessary-type-constraint': 'error', // Biome complexity/noUselessTypeConstraint
  'typescript/no-unsafe-declaration-merging': 'error', // Biome suspicious/noUnsafeDeclarationMerging
  'typescript/no-useless-empty-export': 'error', // Biome complexity/noUselessEmptyExport
  'typescript/prefer-function-type': 'error', // Biome style/useShorthandFunctionType
  'typescript/prefer-literal-enum-member': 'error', // Biome style/useLiteralEnumMembers
  'typescript/prefer-namespace-keyword': 'error', // Biome suspicious/useNamespaceKeyword
  'unicorn/no-document-cookie': 'error', // Biome suspicious/noDocumentCookie
  'unicorn/no-instanceof-array': 'error', // Biome suspicious/useIsArray
  'unicorn/no-static-only-class': 'error', // Biome complexity/noStaticOnlyClass
  'unicorn/no-thenable': 'error', // Biome suspicious/noThenProperty
  'unicorn/no-useless-switch-case': 'error', // Biome complexity/noUselessSwitchCase
  'unicorn/prefer-array-flat-map': 'error', // Biome complexity/useFlatMap
  'unicorn/prefer-array-index-of': 'error', // Biome complexity/useIndexOf
  'unicorn/prefer-date-now': 'error', // Biome complexity/useDateNow
  'unicorn/prefer-node-protocol': 'error', // Biome style/useNodejsImportProtocol
  'unicorn/prefer-number-properties': 'error', // Biome suspicious/noGlobalIsFinite, suspicious/noGlobalIsNan  // React rules Biome's React domain never ran here (no root React dependency).
  'react/jsx-key': 'error',
  'react/no-array-index-key': 'error',
  'react/no-danger-with-children': 'error',
  'react/no-render-return-value': 'error',
};
