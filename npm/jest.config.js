/**
 * Jest Configuration for @ldap-gateway/core
 * 
 * Tests the core npm package in isolation
 * - Utilities (ldapUtils, filterUtils, errorUtils)
 * - Base interfaces (AuthProvider, DirectoryProvider)
 * - LdapEngine lifecycle
 */
module.exports = {
  // Use Node.js test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.spec.js'
  ],

  // Coverage collection
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!**/node_modules/**'
  ],

  // Coverage thresholds (Phase 2: utilities + interfaces complete)
  // LdapEngine partially tested (lifecycle only, full integration in Phase 3)
  coverageThreshold: {
    // High coverage required for utilities (Phase 1)
    './src/utils/**/*.js': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    // High coverage for interfaces (Phase 2)
    './src/AuthProvider.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/DirectoryProvider.js': {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Timeout for tests (5s default, some integration tests may need more)
  testTimeout: 5000,

  // Verbose output
  verbose: true,

  // Module paths
  roots: ['<rootDir>/src', '<rootDir>/test'],

  // Transform - no need for babel, we use plain JS
  transform: {}
};
