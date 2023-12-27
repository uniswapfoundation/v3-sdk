/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  // preset: 'ts-jest',
  // testEnvironment: 'node',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    // transform files with ts-jest
    '^.+\\.(js|ts)$': [
      'ts-jest',
      {
        tsconfig: {
          // allow js in typescript
          allowJs: true,
        },
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: [
    // allow lit-html transformation
    'node_modules/(?!(lit-html|@uniswap))',
  ],
  moduleNameMapper: {
    // for absolute imports
    'src/(.*)': '<rootDir>/src/$1',
    // for esm modules in ts-jest
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
}
