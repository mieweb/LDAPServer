const { LdapEngine, AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');

// Minimal mock auth provider: accepts only user "alice" with password "password"
class MockAuthProvider extends AuthProvider {
  initialize() {}
  async authenticate(username, password) {
    return username === 'alice' && password === 'password';
  }
  async cleanup() {}
}

// Minimal mock directory provider: returns a single user entry
class MockDirectoryProvider extends DirectoryProvider {
  initialize() {}
  async findUser(username) {
    if (username === 'alice') {
      return { username: 'alice', firstname: 'Alice', lastname: 'Tester', uid_number: 10001, gid_number: 100, email: 'alice@example.com' };
    }
    return null;
  }
  async getAllUsers() {
    return [ { username: 'alice', firstname: 'Alice', lastname: 'Tester', uid_number: 10001, gid_number: 100, email: 'alice@example.com' } ];
  }
  async getAllGroups() { return []; }
  async findGroups() { return []; }
  async cleanup() {}
}

// Tests for REQUIRE_AUTH_FOR_SEARCH behavior at the engine level
jest.setTimeout(20000);

describe('LdapEngine - REQUIRE_AUTH_FOR_SEARCH behavior', () => {
  const baseDn = 'dc=test,dc=local';
  const port = 12399;
  let engine;

  afterEach(async () => {
    if (engine) { await engine.stop(); engine = null; }
  });

  test('when true: unauthenticated search fails', async () => {
    engine = new LdapEngine({
      baseDn,
      port,
      requireAuthForSearch: true,
      authProviders: [new MockAuthProvider()],
      directoryProvider: new MockDirectoryProvider(),
      logger,
    });
    await engine.start();

    const client = ldap.createClient({ url: `ldap://127.0.0.1:${port}` });
    try {
      const anonResult = await new Promise((resolve) => {
        const entries = [];
        client.search(baseDn, { filter: '(objectClass=posixAccount)', scope: 'sub' }, (err, res) => {
          if (err) return resolve({ ok: false, err });
          res.on('searchEntry', (e) => entries.push(e.pojo));
          res.on('error', (e) => resolve({ ok: false, err: e }));
          res.on('end', () => resolve({ ok: true, entries }));
        });
      });
      expect(anonResult.ok).toBe(false);
      expect(String(anonResult.err)).toMatch(/InsufficientAccessRights|insufficient/i);
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('when true: authenticated search succeeds', async () => {
    engine = new LdapEngine({
      baseDn,
      port,
      requireAuthForSearch: true,
      authProviders: [new MockAuthProvider()],
      directoryProvider: new MockDirectoryProvider(),
      logger,
    });
    await engine.start();

    const client = ldap.createClient({ url: `ldap://127.0.0.1:${port}` });
    try {
      // Bind with credentials
      await new Promise((resolve, reject) =>
        client.bind(`uid=alice,${baseDn}`, 'password', (e) => (e ? reject(e) : resolve()))
      );

      // Search after successful bind
      const authResults = await new Promise((resolve, reject) => {
        const entries = [];
        client.search(baseDn, { filter: '(objectClass=posixAccount)', scope: 'sub' }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (e) => entries.push(e.pojo));
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });
      expect(Array.isArray(authResults)).toBe(true);
      expect(authResults.length).toBeGreaterThanOrEqual(1);
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('when false: unauthenticated and authenticated searches succeed', async () => {
    engine = new LdapEngine({
      baseDn,
      port,
      requireAuthForSearch: false,
      authProviders: [new MockAuthProvider()],
      directoryProvider: new MockDirectoryProvider(),
      logger,
    });
    await engine.start();

    const client = ldap.createClient({ url: `ldap://127.0.0.1:${port}` });

    // Anonymous search succeeds
    const anonEntries = await new Promise((resolve, reject) => {
      const entries = [];
      client.search(baseDn, { filter: '(objectClass=posixAccount)', scope: 'sub' }, (err, res) => {
        if (err) return reject(err);
        res.on('searchEntry', (e) => entries.push(e.pojo));
        res.on('error', (e) => reject(e));
        res.on('end', () => resolve(entries));
      });
    });
    expect(Array.isArray(anonEntries)).toBe(true);
    expect(anonEntries.length).toBeGreaterThanOrEqual(1);

    // Authenticated search also succeeds
    await new Promise((resolve, reject) =>
      client.bind(`uid=alice,${baseDn}`, 'password', (e) => (e ? reject(e) : resolve()))
    );
    const authEntries = await new Promise((resolve, reject) => {
      const entries = [];
      client.search(baseDn, { filter: '(objectClass=posixAccount)', scope: 'sub' }, (err, res) => {
        if (err) return reject(err);
        res.on('searchEntry', (e) => entries.push(e.pojo));
        res.on('error', (e) => reject(e));
        res.on('end', () => resolve(entries));
      });
    });
    expect(Array.isArray(authEntries)).toBe(true);
    expect(authEntries.length).toBeGreaterThanOrEqual(1);

    await new Promise((resolve) => client.unbind(() => resolve()));
  });
});
