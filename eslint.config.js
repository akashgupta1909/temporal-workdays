// @ts-check
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      'test/consumer/',
      'reports/',
      '.stryker-tmp/',
      'docs/.vitepress/dist/',
      'docs/.vitepress/cache/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      'prefer-const': 'error',
      curly: ['error', 'multi-line'],
    },
  },
  {
    files: ['test/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
    },
  },
  {
    // Type tests make deliberately invalid calls under @ts-expect-error.
    files: ['**/*.test-d.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    // VitePress config and theme are built by VitePress, outside the package's tsconfig.
    files: ['docs/**/*.ts', 'docs/**/*.mts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Command-line scripts print and use Node globals.
    files: ['scripts/**', 'bench/**', 'test/runtimes/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly', URL: 'readonly', Response: 'readonly' } },
    rules: { 'no-console': 'off' },
  },
  {
    // CommonJS files use require() by definition.
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly', module: 'writable' } },
    // A polyfill's Temporal intentionally shadows the (possibly missing) built-in one.
    rules: { '@typescript-eslint/no-require-imports': 'off', 'no-redeclare': ['error', { builtinGlobals: false }] },
  },
  prettier,
);
