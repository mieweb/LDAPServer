/**
 * Unit Tests for LdapEngine.js
 * 
 * Tests the core LDAP server engine with mocked providers
 */

const LdapEngine = require('../../src/LdapEngine');
const { MockAuthProvider, MockDirectoryProvider } = require('../fixtures/mockProviders');
const { baseDN } = require('../fixtures/testData');

// Mock logger to suppress console output during tests
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

describe('LdapEngine', () => {
  let engine;
  let authProvider;
  let directoryProvider;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create fresh providers for each test
    authProvider = new MockAuthProvider();
    directoryProvider = new MockDirectoryProvider();
  });

  afterEach(async () => {
    // Clean up server if it was started
    if (engine && engine.server) {
      await engine.stop();
    }
  });

  describe('Server Lifecycle', () => {
    
    test('should start server on configured port', async () => {
      engine = new LdapEngine({
        port: 3890,
        baseDn: baseDN,
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      expect(engine.server).toBeDefined();
      expect(engine.server).not.toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('LDAP Server listening on port 3890')
      );
    });
  });

  describe('TLS Configuration', () => {
    
    test('should log warning when running without TLS', async () => {
      engine = new LdapEngine({
        port: 3897,
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('running without SSL/TLS certificates')
      );
    });

    test('should warn when TLS options set without certificates', async () => {
      engine = new LdapEngine({
        port: 3900,
        tlsMinVersion: 'TLSv1.3',
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('TLS version/cipher options are configured but will be ignored')
      );
    });
  });
});
