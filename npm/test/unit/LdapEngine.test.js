// Unit Tests for LdapEngine.js
// Tests the core LDAP server engine with mocked providers

const LdapEngine = require('../../src/LdapEngine');
const { MockAuthProvider, MockDirectoryProvider, MockNotificationAuthProvider } = require('../fixtures/mockProviders');
const { baseDN } = require('../fixtures/testData');
const net = require('net');
const ldap = require('ldapjs');

function canConnect(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      cleanup();
      resolve(true);
    });

    socket.once('timeout', () => {
      cleanup();
      reject(new Error(`Timeout connecting to ${host}:${port}`));
    });

    socket.once('error', (err) => {
      cleanup();
      reject(err);
    });

    socket.connect(port, host);
  });
}

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
    test('should start server and bind the port', async () => {
      engine = new LdapEngine({
        port: 3890,
        bindIp: '127.0.0.1',
        baseDn: baseDN,
        authProviders: [authProvider],
        directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      // proves OS-level binding (what the reviewer wants)
      await expect(canConnect(3890, '127.0.0.1')).resolves.toBe(true);
    });
  });

  describe('Authentication - Sequential Execution', () => {
    test('should execute auth providers sequentially, not in parallel', async () => {
      // Create two providers that track when they're called
      const timestamps = [];
      
      const provider1 = new MockAuthProvider({ 
        name: 'provider1',
        delay: 50 // 50ms delay
      });
      const originalAuth1 = provider1.authenticate.bind(provider1);
      provider1.authenticate = async (username, password, req) => {
        timestamps.push({ provider: 'provider1', time: Date.now() });
        return await originalAuth1(username, password, req);
      };

      const provider2 = new MockAuthProvider({ 
        name: 'provider2',
        delay: 10 // 10ms delay
      });
      const originalAuth2 = provider2.authenticate.bind(provider2);
      provider2.authenticate = async (username, password, req) => {
        timestamps.push({ provider: 'provider2', time: Date.now() });
        return await originalAuth2(username, password, req);
      };

      engine = new LdapEngine({
        port: 3891,
        bindIp: '127.0.0.1',
        baseDn: baseDN,
        authProviders: [provider1, provider2],
        directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      // Create LDAP client and attempt bind
      const client = ldap.createClient({
        url: 'ldap://127.0.0.1:3891',
        reconnect: false
      });

      await new Promise((resolve, reject) => {
        client.bind(`uid=testuser,${baseDN}`, 'password123', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      client.destroy();

      // Verify both providers were called
      expect(timestamps.length).toBe(2);
      expect(timestamps[0].provider).toBe('provider1');
      expect(timestamps[1].provider).toBe('provider2');
      
      // Provider2 should start AFTER provider1 finishes (sequential)
      // Provider1 has 50ms delay, so provider2 should start at least 50ms later
      const timeDiff = timestamps[1].time - timestamps[0].time;
      expect(timeDiff).toBeGreaterThanOrEqual(40); // Allow some tolerance
    });

    test('should stop authentication on first provider failure', async () => {
      // Create a provider that fails and a notification provider that tracks calls
      const passwordProvider = new MockAuthProvider({
        name: 'password-auth',
        validCredentials: new Map([['testuser', 'correctpassword']])
      });

      const notificationProvider = new MockNotificationAuthProvider({
        name: 'notification-auth',
        notificationShouldSucceed: true
      });

      engine = new LdapEngine({
        port: 3892,
        bindIp: '127.0.0.1',
        baseDn: baseDN,
        authProviders: [passwordProvider, notificationProvider],
        directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      // Create LDAP client and attempt bind with WRONG password
      const client = ldap.createClient({
        url: 'ldap://127.0.0.1:3892',
        reconnect: false
      });

      let bindError = null;
      await new Promise((resolve) => {
        client.bind(`uid=testuser,${baseDN}`, 'wrongpassword', (err) => {
          bindError = err;
          resolve();
        });
      });

      client.destroy();

      // Verify authentication failed
      expect(bindError).toBeTruthy();
      expect(bindError.message).toContain('Invalid Credentials');

      // Verify passwordProvider was called
      expect(passwordProvider.callCount).toBe(1);
      
      // CRITICAL: notificationProvider should NOT have been called 
      // because password auth failed first
      expect(notificationProvider.callCount).toBe(0);
    });

    test('should call second provider only if first succeeds', async () => {
      const passwordProvider = new MockAuthProvider({
        name: 'password-auth',
        validCredentials: new Map([['testuser', 'correctpassword']])
      });

      const notificationProvider = new MockNotificationAuthProvider({
        name: 'notification-auth',
        notificationShouldSucceed: true
      });

      engine = new LdapEngine({
        port: 3893,
        bindIp: '127.0.0.1',
        baseDn: baseDN,
        authProviders: [passwordProvider, notificationProvider],
        directoryProvider,
        logger: mockLogger
      });

      await engine.start();

      // Create LDAP client and attempt bind with CORRECT password
      const client = ldap.createClient({
        url: 'ldap://127.0.0.1:3893',
        reconnect: false
      });

      let bindError = null;
      await new Promise((resolve) => {
        client.bind(`uid=testuser,${baseDN}`, 'correctpassword', (err) => {
          bindError = err;
          resolve();
        });
      });

      client.destroy();

      // Verify authentication succeeded
      expect(bindError).toBeFalsy();

      // Verify both providers were called
      expect(passwordProvider.callCount).toBe(1);
      expect(notificationProvider.callCount).toBe(1);
    });
  });
});
