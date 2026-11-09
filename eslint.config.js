import neostandard from 'neostandard'

export default [
  ...neostandard({
    env: ['node', 'vitest'],
    ignores: [...neostandard.resolveIgnoresFromGitignore()],
    noJsx: true,
    noStyle: true
  }),
  // Match the Node >= 24 runtime, e.g. for JSON import attributes
  { languageOptions: { ecmaVersion: 'latest' } }
]
