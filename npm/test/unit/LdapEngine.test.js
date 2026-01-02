// Unit Tests for LdapEngine.js
// Tests the core LDAP server engine with mocked providers

const LdapEngine = require('../../src/LdapEngine');
const { MockAuthProvider, MockDirectoryProvider } = require('../fixtures/mockProviders');
const { baseDN } = require('../fixtures/testData');
const net = require('net');

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

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('LDAP Server listening on port 3890')
      );
    });
  });
});
