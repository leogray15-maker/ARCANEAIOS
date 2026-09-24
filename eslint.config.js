// Lint for the AI layer and the agent framework, the code written to the
// stricter standard (typed, validated). The older code is covered by its
// own tests and `npm run check`; widening this is a separate change.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'brain/**', 'apps/facility/public/**'] },
  {
    files: ['packages/ai/src/**/*.js', 'packages/agents/src/**/*.js', 'tools/verify-models.mjs', 'tools/ai.test.mjs', 'tools/ai-data.test.mjs', 'packages/database/src/ai.js', 'tools/agents-runner.test.mjs', 'tools/agents-pipelines.test.mjs', 'api/ai.js', 'api/tick.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
];
