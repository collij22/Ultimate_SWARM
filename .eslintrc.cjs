module.exports = {
  root: true,
  env: {
    es2023: true,
    node: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off',
    'no-debugger': 'error',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-constant-condition': ['error', { checkLoops: false }],
    'prefer-const': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    curly: ['error', 'multi-line'],
    quotes: ['error', 'single', { avoidEscape: true }],
    semi: ['error', 'always'],
    'comma-dangle': ['error', 'always-multiline'],
    indent: ['error', 2, { SwitchCase: 1 }],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',
  },
  overrides: [
    {
      files: ['*.mjs'],
      parserOptions: {
        sourceType: 'module',
      },
    },
    {
      files: ['tests/**/*.mjs', 'tests/**/*.test.mjs'],
      env: {
        mocha: true,
      },
    },
  ],
  ignorePatterns: ['node_modules/', 'dist/', 'runs/', 'test-results/', '*.min.js', 'coverage/'],
};
