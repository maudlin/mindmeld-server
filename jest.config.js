module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.js',
    '<rootDir>/tests/integration/**/*.test.js',
    '<rootDir>/tests/admin/**/*.test.js',
  ],
  testPathIgnorePatterns: ['<rootDir>/tests/e2e/', '<rootDir>/node_modules/'],
  collectCoverageFrom: ['src/**/*.js', '!src/index.js', '!**/node_modules/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Allow uuid package to be transformed by Jest since it's using ES modules in v13
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)', // Transform uuid package
  ],
};
