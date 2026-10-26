import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // A leading underscore marks a parameter that exists only to satisfy an interface (e.g. the local AI provider
      // accepting the same options as the remote one).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // These files deliberately export a hook next to its provider component (useAuth/AuthProvider, …) — the idiom the
    // contexts are consumed through. Splitting each into two files would only scatter one concept.
    files: ['src/lib/auth.tsx', 'src/lib/toast.tsx', 'src/lib/settingsContext.tsx', 'src/lib/worlds.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  }
);
