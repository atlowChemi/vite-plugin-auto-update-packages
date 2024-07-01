// @ts-check

import globals from 'globals';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
    {
        ignores: ['dist/*', '**/node_modules/', 'test/fixtures/**', 'coverage/*'],
    },
    {
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        languageOptions: {
            globals: globals.node,
            parserOptions: {
                project: true,
                ecmaVersion: 2022,
                sourceType: 'module',
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    stylistic.configs['recommended-flat'],
    {
        // disable type-aware linting on JS files
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        rules: {
            '@stylistic/indent': ['error', 4],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/quote-props': ['error', 'as-needed'],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
            '@stylistic/member-delimiter-style': [
                'error',
                { multiline: { delimiter: 'semi', requireLast: true }, multilineDetection: 'brackets', singleline: { delimiter: 'semi' } },
            ],
            '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
        },
    },
    {
        files: ['**/tsup.config.ts', '**/vite.config.ts'],
        rules: {
            'import/no-extraneous-dependencies': 'off',
        },
    },
);
