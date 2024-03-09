module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module' // Allows for the use of imports
  },
  root: true,
  env: { node: true, browser: true, serviceworker: true },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: ['plugin:@typescript-eslint/eslint-recommended', 'prettier/@typescript-eslint'],
  ignorePatterns: ['dist/', 'node_modules/'],
  rules: {
    // 'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    // 'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'array-callback-return': 'error',
    complexity: ['error', { max: 5 }],
    'max-lines-per-function': ['error', { max: 33 }],
    'max-nested-callbacks': ['error', 3],
    'max-depth': ['error', 4],
    'max-statements': ['error', 10, { ignoreTopLevelFunctions: true }],
    'consistent-return': 'error',
    eqeqeq: ['error', 'always'],
    'no-implicit-coercion': 'error',
    'no-invalid-this': 'error',
    'no-new-wrappers': 'error',
    'no-return-assign': 'error',
    'no-return-await': 'error',
    'no-sequences': 'error',
    'no-throw-literal': 'error',
    'no-unused-expressions': 'error',
    'no-useless-catch': 'error',
    'no-useless-escape': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrors: 'none'
      }
    ],
    'no-useless-return': 'error',
    'prefer-promise-reject-errors': 'error',
    'require-await': 'error',
    yoda: 'error',
    camelcase: 'error',
    'no-mixed-operators': 'error',
    'prefer-const': 'error',
    'prefer-template': 'error',
    'template-curly-spacing': ['error', 'never'],
    'func-names': ['error', 'always'],
    'padding-line-between-statements': ['error', { blankLine: 'always', prev: '*', next: 'return' }],
    'arrow-parens': [2, 'as-needed']
  }
};
