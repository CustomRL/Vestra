import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import tsdoc from 'eslint-plugin-tsdoc'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**']),

  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { tsdoc },
    rules: {
      /* Every exported symbol is public API and must document itself. */
      'tsdoc/syntax': 'error',

      /* One idea per file. Past ~300 lines a file is holding more than one;
         split it rather than raising this number. */
      'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],

      /* Type-only imports must be marked so `verbatimModuleSyntax` can erase them
         and we never accidentally create a runtime edge between packages. */
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      /* This library is almost entirely async queues, reconnect timers and
         rate-limit backoff. An unhandled promise here is a hung bot, not a warning. */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],

      /* Hot-path rules from CONTRIBUTING.md, enforced rather than remembered. */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'UnaryExpression[operator="delete"]',
          message:
            '`delete` deoptimises the object shape. Assign undefined, or use a Map, instead.',
        },
        {
          selector: 'CallExpression[callee.object.name="Object"][callee.property.name="assign"]',
          message:
            'Object.assign produces megamorphic shapes. Assign fields explicitly, in a fixed order.',
        },
      ],
    },
  },

  /* Published code must stay silent and dependency-free. */
  {
    files: ['packages/*/src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },

  /* Tests and tooling are held to the same type rules but may be noisy and long. */
  {
    files: ['**/test/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts', 'examples/**/*.ts'],
    rules: {
      'no-console': 'off',
      'max-lines': 'off',
      'tsdoc/syntax': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  /* Root config files are plain JS outside every package tsconfig. They get the
     correctness rules but not the type-aware ones, which have nothing to analyse here. */
  {
    files: ['*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { 'tsdoc/syntax': 'off' },
  },

  prettier,
])
