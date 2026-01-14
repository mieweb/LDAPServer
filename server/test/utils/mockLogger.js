// Mock logger for tests to avoid console noise

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn()
};

module.exports = mockLogger;
