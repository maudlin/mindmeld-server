module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // Code quality
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Allow console for server logging
    'prefer-const': 'error',
    'no-var': 'error',

    // Code style (matches MindMeld client standards)
    indent: ['error', 2],
    'linebreak-style': ['error', 'unix'],
    quotes: ['error', 'single'],
    semi: ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-function-paren': [
      'error',
      { anonymous: 'never', named: 'never', asyncArrow: 'always' }
    ],
    'keyword-spacing': ['error', { before: true, after: true }],

    // Naming conventions
    camelcase: ['error', { properties: 'always' }],

    // Best practices
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'brace-style': ['error', '1tbs'],
    'no-trailing-spaces': 'error',
    'eol-last': ['error', 'always'],

    // Security
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error'
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true
      },
      rules: {
        'no-unused-expressions': 'off'
      }
    }
  ]
};
