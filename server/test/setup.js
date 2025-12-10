/**
 * Jest Setup for Server Integration Tests
 * 
 * Runs before each test file
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Suppress console output during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock logger for tests
global.mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});
