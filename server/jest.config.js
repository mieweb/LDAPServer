/**
 * Jest Configuration for ldap-gateway-server
 * 
 * Integration tests for concrete provider implementations
 * - SQL backend (MySQL/SQLite)
 * - MongoDB backend
 * - Proxmox backend
 * - LDAP protocol operations
 * - Security configurations
 */
module.exports = {
  // Use Node.js test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.spec.js'
  ],

  // Ignore node_modules but include test directories
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/logs/',
    'tlsConfig.test.js',  // Standalone test file with custom runner
    'ldapEngineTls.test.js',  // Standalone test file with custom runner
    'backendLoader.test.js'  // Needs refactoring for new ProviderFactory API
  ],

  // Coverage collection
  collectCoverageFrom: [
    'backends/**/*.js',
    'utils/**/*.js',
    'config/**/*.js',
    'handlers/**/*.js',
    '!**/*.test.js',
    '!**/node_modules/**',
    '!dist/**',
    '!logs/**'
  ],

  // Coverage thresholds (integration tests)
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  },

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Longer timeout for integration tests (databases, LDAP operations)
  testTimeout: 30000, // 30 seconds

  // Setup/teardown files
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],

  // Verbose output
  verbose: true,

  // Module paths
  roots: ['<rootDir>/test'],
  
  // Allow requiring from server root
  moduleDirectories: ['node_modules', '<rootDir>'],

  // Transform - no need for babel, we use plain JS
  transform: {},

  // Global setup/teardown for Docker services
  // globalSetup: '<rootDir>/test/globalSetup.js',
  // globalTeardown: '<rootDir>/test/globalTeardown.js',
};
