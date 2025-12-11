const { LdapEngine, AuthProvider } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');

// Shared
const baseDn = 'dc=test,dc=local';
const port = 11389;

// Simple mock users
const validUsers = {
  testuser: 'password123',
  admin: 'admin123'
};

// Monkey-patch authenticate to avoid real DB
class MockSqlAuthProvider extends AuthProvider {
  async initialize() { /* no-op */ }
  async cleanup() { /* no-op */ }
  async authenticate(username, password) {
    const expected = validUsers[username];
    return !!expected && expected === password;
  }
}

const createClient = () => ldap.createClient({ url: `ldap://127.0.0.1:${port}` });

describe('SQL Auth Backend (mocked) - Acceptance Tests', () => {
  let engine;

  afterEach(async () => {
    if (engine) {
      await engine.stop();
      engine = null;
    }
  });

  test('Bind with valid credentials should succeed', async () => {
  const authProvider = new MockSqlAuthProvider();
    engine = new LdapEngine({
      baseDn,
      port,
      authProviders: [authProvider],
      directoryProvider: { initialize: jest.fn(), cleanup: jest.fn() },
      logger,
    });
    await engine.start();

    const client = createClient();
    const userDN = `uid=testuser,${baseDn}`;
    await expect(new Promise((resolve, reject) => {
      client.bind(userDN, validUsers.testuser, (err) => err ? reject(err) : resolve());
    })).resolves.not.toThrow();
    client.unbind();
  });

  test('Bind with invalid credentials should fail', async () => {
  const authProvider = new MockSqlAuthProvider();
    engine = new LdapEngine({
      baseDn,
      port,
      authProviders: [authProvider],
      directoryProvider: { initialize: jest.fn(), cleanup: jest.fn() },
      logger,
    });
    await engine.start();

    const client = createClient();
    const userDN = `uid=testuser,${baseDn}`;
    await expect(new Promise((resolve, reject) => {
      client.bind(userDN, 'wrongpassword', (err) => err ? reject(err) : resolve());
    })).rejects.toThrow();
    client.unbind();
  });

  test('Bind with non-existent user should fail', async () => {
  const authProvider = new MockSqlAuthProvider();
    engine = new LdapEngine({
      baseDn,
      port,
      authProviders: [authProvider],
      directoryProvider: { initialize: jest.fn(), cleanup: jest.fn() },
      logger,
    });
    await engine.start();

    const client = createClient();
    const userDN = `uid=nouser,${baseDn}`;
    await expect(new Promise((resolve, reject) => {
      client.bind(userDN, 'anything', (err) => err ? reject(err) : resolve());
    })).rejects.toThrow();
    client.unbind();
  });
});
