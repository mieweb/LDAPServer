/**
 * Unit Tests for LdapEngine.js
 * 
 * Tests the core LDAP server engine with mocked providers
 * Note: These are unit tests - integration tests with real LDAP clients in Phase 3
 */

const LdapEngine = require('../../src/LdapEngine');
const { MockAuthProvider, MockDirectoryProvider } = require('../fixtures/mockProviders');
const { testUsers, testGroups, baseDN } = require('../fixtures/testData');

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

  describe('Constructor and Configuration', () => {
    
    test('should create instance with default options', () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider
      });

      expect(engine).toBeInstanceOf(LdapEngine);
      expect(engine.config.baseDn).toBe('dc=localhost');
      expect(engine.config.port).toBe(389);
      expect(engine.config.bindIp).toBe('0.0.0.0');
    });

    test('should accept custom configuration', () => {
      engine = new LdapEngine({
        baseDn: baseDN,
        port: 3890,
        bindIp: '127.0.0.1',
        authProviders: [authProvider],
        directoryProvider: directoryProvider
      });

      expect(engine.config.baseDn).toBe(baseDN);
      expect(engine.config.port).toBe(3890);
      expect(engine.config.bindIp).toBe('127.0.0.1');
    });

    test('should accept custom logger', () => {
      const customLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
      
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: customLogger
      });

      expect(engine.logger).toBe(customLogger);
    });

    test('should store auth providers', () => {
      const provider1 = new MockAuthProvider({ name: 'provider1' });
      const provider2 = new MockAuthProvider({ name: 'provider2' });

      engine = new LdapEngine({
        authProviders: [provider1, provider2],
        directoryProvider: directoryProvider
      });

      expect(engine.authProviders).toHaveLength(2);
      expect(engine.authProviders[0].name).toBe('provider1');
      expect(engine.authProviders[1].name).toBe('provider2');
    });

    test('should store directory provider', () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider
      });

      expect(engine.directoryProvider).toBe(directoryProvider);
    });

    test('should set requireAuthForSearch to true by default', () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider
      });

      expect(engine.config.requireAuthForSearch).toBe(true);
    });

    test('should allow disabling requireAuthForSearch', () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        requireAuthForSearch: false
      });

      expect(engine.config.requireAuthForSearch).toBe(false);
    });

    test('should accept TLS configuration', () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        certificate: 'cert-content',
        key: 'key-content',
        tlsMinVersion: 'TLSv1.3',
        tlsCiphers: 'HIGH:!aNULL'
      });

      expect(engine.config.certificate).toBe('cert-content');
      expect(engine.config.key).toBe('key-content');
      expect(engine.config.tlsMinVersion).toBe('TLSv1.3');
      expect(engine.config.tlsCiphers).toBe('HIGH:!aNULL');
    });
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

    test('should emit "started" event when server starts', async () => {
      engine = new LdapEngine({
        port: 3891,
        baseDn: baseDN,
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      const startedPromise = new Promise(resolve => {
        engine.on('started', resolve);
      });

      await engine.start();
      const event = await startedPromise;

      expect(event.port).toBe(3891);
      expect(event.baseDn).toBe(baseDN);
    });

    test('should stop server gracefully', async () => {
      engine = new LdapEngine({
        port: 3892,
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      await engine.start();
      expect(engine.server).not.toBeNull();

      await engine.stop();

      expect(engine.server).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('LDAP Server stopped');
    });

    test('should emit "stopped" event when server stops', async () => {
      engine = new LdapEngine({
        port: 3893,
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      const stoppedPromise = new Promise(resolve => {
        engine.on('stopped', resolve);
      });

      await engine.stop();
      await stoppedPromise;

      expect(true).toBe(true); // Event was emitted
    });

    test('should handle stop when server not started', async () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      // Should not throw
      await expect(engine.stop()).resolves.toBeUndefined();
    });

    test('should handle multiple stop calls', async () => {
      engine = new LdapEngine({
        port: 3894,
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      await engine.start();
      await engine.stop();

      // Second stop should not throw
      await expect(engine.stop()).resolves.toBeUndefined();
    });

    test('should call initialize on providers during start', async () => {
      const authWithInit = new MockAuthProvider();
      authWithInit.initialize = jest.fn().mockResolvedValue(undefined);

      const dirWithInit = new MockDirectoryProvider();
      dirWithInit.initialize = jest.fn().mockResolvedValue(undefined);

      engine = new LdapEngine({
        port: 3895,
        authProviders: [authWithInit],
        directoryProvider: dirWithInit,
        logger: mockLogger
      });

      await engine.start();

      expect(authWithInit.initialize).toHaveBeenCalled();
      expect(dirWithInit.initialize).toHaveBeenCalled();
    });

    test('should call cleanup on providers during stop', async () => {
      const authWithCleanup = new MockAuthProvider();
      authWithCleanup.cleanup = jest.fn().mockResolvedValue(undefined);

      const dirWithCleanup = new MockDirectoryProvider();
      dirWithCleanup.cleanup = jest.fn().mockResolvedValue(undefined);

      engine = new LdapEngine({
        port: 3896,
        authProviders: [authWithCleanup],
        directoryProvider: dirWithCleanup,
        logger: mockLogger
      });

      await engine.start();
      await engine.stop();

      expect(authWithCleanup.cleanup).toHaveBeenCalled();
      expect(dirWithCleanup.cleanup).toHaveBeenCalled();
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

    // Note: Actual TLS tests require valid certificates
    // These will be tested in integration tests (Phase 3)
    test.skip('should log info when TLS is configured', async () => {
      // Skipped: Requires valid PEM certificates
      // Will be tested in Phase 3 integration tests
    });

    test.skip('should log TLS version when configured', async () => {
      // Skipped: Requires valid PEM certificates
      // Will be tested in Phase 3 integration tests
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

  describe('EventEmitter behavior', () => {
    
    test('should be an EventEmitter', () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider
      });

      expect(engine.on).toBeDefined();
      expect(engine.emit).toBeDefined();
      expect(engine.once).toBeDefined();
    });

    test('should allow registering event listeners', async () => {
      engine = new LdapEngine({
        port: 3901,
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        logger: mockLogger
      });

      const listener = jest.fn();
      engine.on('started', listener);

      await engine.start();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Configuration Validation', () => {
    
    test('should use defaults for missing optional config', () => {
      engine = new LdapEngine({
        authProviders: [authProvider],
        directoryProvider: directoryProvider
      });

      expect(engine.config.baseDn).toBe('dc=localhost');
      expect(engine.config.port).toBe(389);
      expect(engine.config.certificate).toBeNull();
      expect(engine.config.key).toBeNull();
    });

    test('should merge custom config with defaults', () => {
      engine = new LdapEngine({
        baseDn: 'dc=custom,dc=com',
        authProviders: [authProvider],
        directoryProvider: directoryProvider,
        customOption: 'value'
      });

      expect(engine.config.baseDn).toBe('dc=custom,dc=com');
      expect(engine.config.port).toBe(389); // Still default
      expect(engine.config.customOption).toBe('value');
    });
  });
});
