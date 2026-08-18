import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.git/**',
      '.husky/**',
      'eslint.config.mjs',
      '**/.eslintrc.*',
      '**/*.json',
      '**/*.yaml',
      '**/*.yml',
      '**/*.md',
      '**/*.lock',
    ],
  },
  {
    files: ['src/**/*.{ts,js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/sort-type-union-intersection-members': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
