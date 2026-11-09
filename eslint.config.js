import globals from 'globals'

export default [
  {
    ignores: ['docs/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-undef': 'error' },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['src/web/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/web/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
]
