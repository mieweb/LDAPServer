// Unit Tests for LdapEngine Multi-Realm Support
// Tests realm routing, search aggregation, and backward compatibility

const LdapEngine = require('../../src/LdapEngine');
const { MockAuthProvider, MockDirectoryProvider, MockNotificationAuthProvider } = require('../fixtures/mockProviders');
const { baseDN } = require('../fixtures/testData');
const net = require('net');
const ldap = require('ldapjs');

function canConnect(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const cleanup = () => { socket.removeAllListeners(); socket.destroy(); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => { cleanup(); resolve(true); });
    socket.once('timeout', () => { cleanup(); reject(new Error('Timeout')); });
    socket.once('error', (err) => { cleanup(); reject(err); });
    socket.connect(port, host);
  });
}

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Helper to create an ldap client for testing
function createClient(port) {
  return ldap.createClient({
    url: `ldap://127.0.0.1:${port}`,
    timeout: 5000,
    connectTimeout: 5000
  });
}

// Promisified ldap client operations
function bindAsync(client, dn, password) {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => err ? reject(err) : resolve());
  });
}

function searchAsync(client, base, opts) {
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(base, opts, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', (entry) => entries.push(entry));
      res.on('error', (err) => reject(err));
      res.on('end', () => resolve(entries));
    });
  });
}

function unbindAsync(client) {
  return new Promise((resolve) => {
    client.unbind((err) => resolve());
  });
}

describe('LdapEngine Multi-Realm', () => {
  let engine;
  const TEST_PORT = 3895;

  afterEach(async () => {
    if (engine && engine.server) {
      await engine.stop();
    }
  });

  describe('Initialization (_initRealms)', () => {
    test('should initialize with explicit realms array', () => {
      const auth1 = new MockAuthProvider({ name: 'realm1-auth' });
      const dir1 = new MockDirectoryProvider({ name: 'realm1-dir' });
      const auth2 = new MockAuthProvider({ name: 'realm2-auth' });
      const dir2 = new MockDirectoryProvider({ name: 'realm2-dir' });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        realms: [
          {
            name: 'company-a',
            baseDn: 'dc=company-a,dc=com',
            directoryProvider: dir1,
            authProviders: [auth1]
          },
          {
            name: 'company-b',
            baseDn: 'dc=company-b,dc=com',
            directoryProvider: dir2,
            authProviders: [auth2]
          }
        ]
      });

      expect(engine.allRealms).toHaveLength(2);
      expect(engine.realmsByBaseDn.size).toBe(2);
      expect(engine.realmsByBaseDn.has('dc=company-a,dc=com')).toBe(true);
      expect(engine.realmsByBaseDn.has('dc=company-b,dc=com')).toBe(true);
    });

    test('should support multiple realms sharing the same baseDN', () => {
      const auth1 = new MockAuthProvider({ name: 'realm1-auth' });
      const dir1 = new MockDirectoryProvider({ name: 'realm1-dir' });
      const auth2 = new MockAuthProvider({ name: 'realm2-auth' });
      const dir2 = new MockDirectoryProvider({ name: 'realm2-dir' });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        realms: [
          {
            name: 'realm-1',
            baseDn: baseDN,
            directoryProvider: dir1,
            authProviders: [auth1]
          },
          {
            name: 'realm-2',
            baseDn: baseDN,
            directoryProvider: dir2,
            authProviders: [auth2]
          }
        ]
      });

      expect(engine.allRealms).toHaveLength(2);
      expect(engine.realmsByBaseDn.size).toBe(1);
      expect(engine.realmsByBaseDn.get(baseDN)).toHaveLength(2);
    });

    test('should auto-wrap legacy options into single default realm', () => {
      const auth = new MockAuthProvider();
      const dir = new MockDirectoryProvider();

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        baseDn: baseDN,
        authProviders: [auth],
        directoryProvider: dir,
        logger: mockLogger
      });

      expect(engine.allRealms).toHaveLength(1);
      expect(engine.allRealms[0].name).toBe('default');
      expect(engine.allRealms[0].baseDn).toBe(baseDN);
      expect(engine.realmsByBaseDn.size).toBe(1);
      // Legacy references should be preserved
      expect(engine.authProviders).toEqual([auth]);
      expect(engine.directoryProvider).toBe(dir);
    });

    test('should normalize baseDN to lowercase in realmsByBaseDn keys', () => {
      const auth = new MockAuthProvider();
      const dir = new MockDirectoryProvider();

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        realms: [
          {
            name: 'test',
            baseDn: 'DC=Example,DC=Com',
            directoryProvider: dir,
            authProviders: [auth]
          }
        ]
      });

      expect(engine.realmsByBaseDn.has('dc=example,dc=com')).toBe(true);
    });
  });

  describe('Multi-Realm Bind', () => {
    test('should authenticate against the realm that owns the user', async () => {
      const usersA = [{ username: 'alice', uid_number: 2001, gid_number: 2000, first_name: 'Alice', last_name: 'A' }];
      const usersB = [{ username: 'bob', uid_number: 3001, gid_number: 3000, first_name: 'Bob', last_name: 'B' }];

      const authA = new MockAuthProvider({
        name: 'auth-a',
        validCredentials: new Map([['alice', 'pass-a']])
      });
      const dirA = new MockDirectoryProvider({ name: 'dir-a', users: usersA, groups: [] });

      const authB = new MockAuthProvider({
        name: 'auth-b',
        validCredentials: new Map([['bob', 'pass-b']])
      });
      const dirB = new MockDirectoryProvider({ name: 'dir-b', users: usersB, groups: [] });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        realms: [
          { name: 'realm-a', baseDn: baseDN, directoryProvider: dirA, authProviders: [authA] },
          { name: 'realm-b', baseDn: baseDN, directoryProvider: dirB, authProviders: [authB] }
        ]
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        // Alice should authenticate through realm-a
        await bindAsync(client, `uid=alice,ou=users,${baseDN}`, 'pass-a');
        expect(authA.callCount).toBe(1);
        expect(authB.callCount).toBe(0); // realm-b should NOT be tried

        // Bob should authenticate through realm-b
        authA.reset();
        const client2 = createClient(TEST_PORT);
        try {
          await bindAsync(client2, `uid=bob,ou=users,${baseDN}`, 'pass-b');
          expect(dirB.callCounts.findUser).toBeGreaterThanOrEqual(1);
          expect(authB.callCount).toBe(1);
        } finally {
          await unbindAsync(client2);
        }
      } finally {
        await unbindAsync(client);
      }
    });

    test('should reject bind when user not found in any realm', async () => {
      const authA = new MockAuthProvider({ name: 'auth-a' });
      const dirA = new MockDirectoryProvider({ name: 'dir-a', users: [], groups: [] });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        realms: [
          { name: 'realm-a', baseDn: baseDN, directoryProvider: dirA, authProviders: [authA] }
        ]
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        await expect(
          bindAsync(client, `uid=nonexistent,ou=users,${baseDN}`, 'anypass')
        ).rejects.toThrow();
      } finally {
        await unbindAsync(client);
      }
    });
  });

  describe('Multi-Realm Search', () => {
    test('should merge search results from multiple realms sharing same baseDN', async () => {
      const usersA = [{ username: 'alice', uid_number: 2001, gid_number: 2000, first_name: 'Alice', last_name: 'A' }];
      const usersB = [{ username: 'bob', uid_number: 3001, gid_number: 3000, first_name: 'Bob', last_name: 'B' }];

      const dirA = new MockDirectoryProvider({ name: 'dir-a', users: usersA, groups: [] });
      const dirB = new MockDirectoryProvider({ name: 'dir-b', users: usersB, groups: [] });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        requireAuthForSearch: false,
        realms: [
          { name: 'realm-a', baseDn: baseDN, directoryProvider: dirA, authProviders: [new MockAuthProvider()] },
          { name: 'realm-b', baseDn: baseDN, directoryProvider: dirB, authProviders: [new MockAuthProvider()] }
        ]
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        // Search for all users - should get results from both realms
        const entries = await searchAsync(client, baseDN, {
          filter: '(objectClass=posixAccount)',
          scope: 'sub'
        });

        expect(entries.length).toBe(2);
      } finally {
        await unbindAsync(client);
      }
    });

    test('should deduplicate entries by DN across realms', async () => {
      // Same user in both realms - first realm wins
      const sharedUser = { username: 'shared', uid_number: 5001, gid_number: 5000, first_name: 'Shared', last_name: 'User' };
      const dirA = new MockDirectoryProvider({ name: 'dir-a', users: [sharedUser], groups: [] });
      const dirB = new MockDirectoryProvider({ name: 'dir-b', users: [sharedUser], groups: [] });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        requireAuthForSearch: false,
        realms: [
          { name: 'realm-a', baseDn: baseDN, directoryProvider: dirA, authProviders: [new MockAuthProvider()] },
          { name: 'realm-b', baseDn: baseDN, directoryProvider: dirB, authProviders: [new MockAuthProvider()] }
        ]
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        const entries = await searchAsync(client, baseDN, {
          filter: '(uid=shared)',
          scope: 'sub'
        });

        // Should deduplicate - only 1 entry even though both realms have user
        expect(entries.length).toBe(1);
      } finally {
        await unbindAsync(client);
      }
    });

    test('should search different baseDNs independently', async () => {
      const usersA = [{ username: 'alice', uid_number: 2001, gid_number: 2000, first_name: 'Alice', last_name: 'A' }];
      const usersB = [{ username: 'bob', uid_number: 3001, gid_number: 3000, first_name: 'Bob', last_name: 'B' }];

      const baseDnA = 'dc=company-a,dc=com';
      const baseDnB = 'dc=company-b,dc=com';

      const dirA = new MockDirectoryProvider({ name: 'dir-a', users: usersA, groups: [] });
      const dirB = new MockDirectoryProvider({ name: 'dir-b', users: usersB, groups: [] });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        requireAuthForSearch: false,
        realms: [
          { name: 'company-a', baseDn: baseDnA, directoryProvider: dirA, authProviders: [new MockAuthProvider()] },
          { name: 'company-b', baseDn: baseDnB, directoryProvider: dirB, authProviders: [new MockAuthProvider()] }
        ]
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        // Search company-a - should only get alice
        const entriesA = await searchAsync(client, baseDnA, {
          filter: '(objectClass=posixAccount)',
          scope: 'sub'
        });
        expect(entriesA.length).toBe(1);

        // Search company-b - should only get bob
        const entriesB = await searchAsync(client, baseDnB, {
          filter: '(objectClass=posixAccount)',
          scope: 'sub'
        });
        expect(entriesB.length).toBe(1);
      } finally {
        await unbindAsync(client);
      }
    });

    test('should handle realm search failures gracefully (partial results)', async () => {
      const usersA = [{ username: 'alice', uid_number: 2001, gid_number: 2000, first_name: 'Alice', last_name: 'A' }];
      
      const dirA = new MockDirectoryProvider({ name: 'dir-a', users: usersA, groups: [] });
      // dirB will throw an error when searched
      const dirB = new MockDirectoryProvider({ name: 'dir-b', users: [], groups: [] });
      dirB.getAllUsers = async () => { throw new Error('Database connection failed'); };

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        requireAuthForSearch: false,
        realms: [
          { name: 'realm-a', baseDn: baseDN, directoryProvider: dirA, authProviders: [new MockAuthProvider()] },
          { name: 'realm-b', baseDn: baseDN, directoryProvider: dirB, authProviders: [new MockAuthProvider()] }
        ]
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        // Search should succeed with partial results (realm-a only)
        const entries = await searchAsync(client, baseDN, {
          filter: '(objectClass=posixAccount)',
          scope: 'sub'
        });

        // Should get alice from realm-a despite realm-b failure
        expect(entries.length).toBe(1);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining("Search failed in realm 'realm-b'"),
          expect.any(Error)
        );
      } finally {
        await unbindAsync(client);
      }
    });
  });

  describe('RootDSE Multi-Realm', () => {
    test('should return all baseDNs in namingContexts', async () => {
      const baseDnA = 'dc=company-a,dc=com';
      const baseDnB = 'dc=company-b,dc=com';

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        logger: mockLogger,
        requireAuthForSearch: false,
        realms: [
          { name: 'company-a', baseDn: baseDnA, directoryProvider: new MockDirectoryProvider(), authProviders: [new MockAuthProvider()] },
          { name: 'company-b', baseDn: baseDnB, directoryProvider: new MockDirectoryProvider(), authProviders: [new MockAuthProvider()] }
        ]
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        const entries = await searchAsync(client, '', {
          filter: '(objectClass=*)',
          scope: 'base',
          attributes: ['+']
        });

        expect(entries.length).toBe(1);
        const rootDSE = entries[0];
        
        // ldapjs returns attributes as array of {type, values} objects
        const ncAttr = rootDSE.attributes.find(a => a.type === 'namingContexts');
        const contexts = ncAttr ? ncAttr.values : [];
        
        // Should contain both baseDNs
        expect(contexts).toContain(baseDnA);
        expect(contexts).toContain(baseDnB);
      } finally {
        await unbindAsync(client);
      }
    });
  });

  describe('Backward Compatibility', () => {
    test('should work identically with legacy single-provider options', async () => {
      const auth = new MockAuthProvider();
      const testUsers = [
        { username: 'testuser', uid_number: 1001, gid_number: 1001, first_name: 'Test', last_name: 'User' },
        { username: 'admin', uid_number: 1000, gid_number: 1000, first_name: 'Admin', last_name: 'User' }
      ];
      const dir = new MockDirectoryProvider({ users: testUsers, groups: [] });

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        baseDn: baseDN,
        authProviders: [auth],
        directoryProvider: dir,
        logger: mockLogger,
        requireAuthForSearch: false
      });

      await engine.start();

      const client = createClient(TEST_PORT);
      try {
        // Bind should work
        await bindAsync(client, `uid=testuser,ou=users,${baseDN}`, 'password123');
        expect(auth.callCount).toBe(1);

        // Search should work
        const entries = await searchAsync(client, baseDN, {
          filter: '(uid=testuser)',
          scope: 'sub'
        });
        expect(entries.length).toBe(1);
      } finally {
        await unbindAsync(client);
      }
    });

    test('should preserve legacy directoryProvider and authProviders refs', () => {
      const auth = new MockAuthProvider();
      const dir = new MockDirectoryProvider();

      engine = new LdapEngine({
        port: TEST_PORT,
        bindIp: '127.0.0.1',
        baseDn: baseDN,
        authProviders: [auth],
        directoryProvider: dir,
        logger: mockLogger
      });

      expect(engine.directoryProvider).toBe(dir);
      expect(engine.authProviders).toEqual([auth]);
    });
  });

  describe('Started Event', () => {
    test('should emit started event with baseDns and realm names', async () => {
      const startedInfo = await new Promise(async (resolve) => {
        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          realms: [
            { name: 'realm-a', baseDn: 'dc=a,dc=com', directoryProvider: new MockDirectoryProvider(), authProviders: [new MockAuthProvider()] },
            { name: 'realm-b', baseDn: 'dc=b,dc=com', directoryProvider: new MockDirectoryProvider(), authProviders: [new MockAuthProvider()] }
          ]
        });

        engine.on('started', (info) => resolve(info));
        await engine.start();
      });

      expect(startedInfo.baseDns).toContain('dc=a,dc=com');
      expect(startedInfo.baseDns).toContain('dc=b,dc=com');
      expect(startedInfo.realms).toContain('realm-a');
      expect(startedInfo.realms).toContain('realm-b');
    });
  });

  describe('Per-User Auth Override (Phase 3)', () => {
    describe('_resolveAuthChain', () => {
      test('should return realm default providers when user has no auth_backends', () => {
        const realmAuth = new MockAuthProvider({ name: 'realm-default' });
        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          realms: [
            { name: 'test', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [realmAuth] }
          ]
        });

        const realm = engine.allRealms[0];
        const user = { username: 'testuser', auth_backends: null };

        const chain = engine._resolveAuthChain(realm, user, 'testuser');
        expect(chain).toEqual([realmAuth]);
      });

      test('should return realm default providers when auth_backends is empty string', () => {
        const realmAuth = new MockAuthProvider({ name: 'realm-default' });
        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          realms: [
            { name: 'test', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [realmAuth] }
          ]
        });

        const chain = engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser', auth_backends: '' }, 'testuser');
        expect(chain).toEqual([realmAuth]);
      });

      test('should return realm default providers when auth_backends is undefined', () => {
        const realmAuth = new MockAuthProvider({ name: 'realm-default' });
        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          realms: [
            { name: 'test', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [realmAuth] }
          ]
        });

        const chain = engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser' }, 'testuser');
        expect(chain).toEqual([realmAuth]);
      });

      test('should resolve per-user override from registry', () => {
        const realmAuth = new MockAuthProvider({ name: 'realm-default' });
        const overrideAuth = new MockAuthProvider({ name: 'custom-auth' });
        const registry = new Map([['custom-auth', overrideAuth]]);

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: registry,
          realms: [
            { name: 'test', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [realmAuth] }
          ]
        });

        const chain = engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser', auth_backends: 'custom-auth' }, 'testuser');
        expect(chain).toEqual([overrideAuth]);
        expect(chain).not.toContain(realmAuth);
      });

      test('should resolve multiple comma-separated backends', () => {
        const providerA = new MockAuthProvider({ name: 'auth-a' });
        const providerB = new MockAuthProvider({ name: 'auth-b' });
        const registry = new Map([['auth-a', providerA], ['auth-b', providerB]]);

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: registry,
          realms: [
            { name: 'test', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [new MockAuthProvider()] }
          ]
        });

        const chain = engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser', auth_backends: 'auth-a, auth-b' }, 'testuser');
        expect(chain).toHaveLength(2);
        expect(chain[0]).toBe(providerA);
        expect(chain[1]).toBe(providerB);
      });

      test('should throw for unknown backend in auth_backends (fail-loud)', () => {
        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: new Map(),
          realms: [
            { name: 'test', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [new MockAuthProvider()] }
          ]
        });

        expect(() => {
          engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser', auth_backends: 'nonexistent' }, 'testuser');
        }).toThrow("Unknown auth backend 'nonexistent'");
      });

      test('should prioritize realm own provider over registry fallback', () => {
        // Realm A has its own 'mock' provider
        const realmAProvider = new MockAuthProvider({ name: 'realm-a-mock' });
        // Registry has a different 'mock' provider (from realm B or global)
        const registryProvider = new MockAuthProvider({ name: 'registry-mock' });
        const registry = new Map([['mock', registryProvider]]);

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: registry,
          realms: [
            { name: 'realm-a', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [realmAProvider] }
          ]
        });

        const chain = engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser', auth_backends: 'mock' }, 'testuser');
        // Should use realm's own provider, not the registry one
        expect(chain).toHaveLength(1);
        expect(chain[0]).toBe(realmAProvider);
        expect(chain[0]).not.toBe(registryProvider);
      });

      test('should warn when using cross-realm registry fallback', () => {
        // No 'sql' provider in realm's own auth chain
        const realmAuth = new MockAuthProvider({ name: 'realm-default' });
        // Registry has a 'sql' provider from another realm
        const sqlProvider = new MockAuthProvider({ name: 'sql-provider' });
        const registry = new Map([['sql', sqlProvider]]);

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: registry,
          realms: [
            { name: 'test-realm', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [realmAuth] }
          ]
        });

        const chain = engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser', auth_backends: 'sql' }, 'testuser');
        expect(chain).toEqual([sqlProvider]);
        // Should have logged a warning about cross-realm usage
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining("using cross-realm auth backend 'sql'")
        );
      });

      test('should prefer realm-scoped registry key over type-only key', () => {
        const realmAuth = new MockAuthProvider({ name: 'realm-default' });
        const realmScopedSql = new MockAuthProvider({ name: 'realm-a:sql' });
        const globalSql = new MockAuthProvider({ name: 'global-sql' });
        const registry = new Map([
          ['realm-a:sql', realmScopedSql],
          ['sql', globalSql]
        ]);

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: registry,
          realms: [
            { name: 'realm-a', baseDn: baseDN, directoryProvider: new MockDirectoryProvider(), authProviders: [realmAuth] }
          ]
        });

        const chain = engine._resolveAuthChain(engine.allRealms[0], { username: 'testuser', auth_backends: 'sql' }, 'testuser');
        // Should use realm-scoped registry key, not global fallback
        expect(chain).toEqual([realmScopedSql]);
        expect(chain).not.toContain(globalSql);
      });
    });

    describe('End-to-end per-user auth override', () => {
      test('should use per-user auth override for bind when auth_backends is set', async () => {
        const overrideAuth = new MockAuthProvider({
          name: 'override-auth',
          validCredentials: new Map([['mfauser', 'override-pass']])
        });
        const realmAuth = new MockAuthProvider({
          name: 'realm-auth',
          validCredentials: new Map([['testuser', 'password123']])
        });

        const users = [
          { username: 'testuser', uid_number: 1001, gid_number: 1001, first_name: 'Test', last_name: 'User' },
          { username: 'mfauser', uid_number: 1003, gid_number: 1001, first_name: 'MFA', last_name: 'User', auth_backends: 'override-auth' }
        ];

        const registry = new Map([['override-auth', overrideAuth], ['realm-auth', realmAuth]]);

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: registry,
          realms: [
            { name: 'test-realm', baseDn: baseDN, directoryProvider: new MockDirectoryProvider({ users, groups: [] }), authProviders: [realmAuth] }
          ]
        });

        await engine.start();

        // testuser should use realm default auth (realmAuth)
        const client1 = createClient(TEST_PORT);
        try {
          await bindAsync(client1, `uid=testuser,ou=users,${baseDN}`, 'password123');
          expect(realmAuth.callCount).toBe(1);
          expect(overrideAuth.callCount).toBe(0);
        } finally {
          await unbindAsync(client1);
        }

        realmAuth.reset();
        overrideAuth.reset();

        // mfauser should use per-user override auth (overrideAuth)
        const client2 = createClient(TEST_PORT);
        try {
          await bindAsync(client2, `uid=mfauser,ou=users,${baseDN}`, 'override-pass');
          expect(overrideAuth.callCount).toBe(1);
          expect(realmAuth.callCount).toBe(0); // realm auth should NOT be called
        } finally {
          await unbindAsync(client2);
        }
      });

      test('should reject bind when per-user override auth fails', async () => {
        const overrideAuth = new MockAuthProvider({
          name: 'override-auth',
          validCredentials: new Map([['mfauser', 'correct-pass']])
        });

        const users = [
          { username: 'mfauser', uid_number: 1003, gid_number: 1001, first_name: 'MFA', last_name: 'User', auth_backends: 'override-auth' }
        ];

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: new Map([['override-auth', overrideAuth]]),
          realms: [
            { name: 'test-realm', baseDn: baseDN, directoryProvider: new MockDirectoryProvider({ users, groups: [] }), authProviders: [new MockAuthProvider()] }
          ]
        });

        await engine.start();

        const client = createClient(TEST_PORT);
        try {
          await expect(
            bindAsync(client, `uid=mfauser,ou=users,${baseDN}`, 'wrong-pass')
          ).rejects.toThrow();
          expect(overrideAuth.callCount).toBe(1);
        } finally {
          await unbindAsync(client);
        }
      });

      test('should reject bind when auth_backends references unknown provider', async () => {
        const users = [
          { username: 'baduser', uid_number: 1099, gid_number: 1001, first_name: 'Bad', last_name: 'User', auth_backends: 'nonexistent-backend' }
        ];

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: new Map(),
          realms: [
            { name: 'test-realm', baseDn: baseDN, directoryProvider: new MockDirectoryProvider({ users, groups: [] }), authProviders: [new MockAuthProvider()] }
          ]
        });

        await engine.start();

        const client = createClient(TEST_PORT);
        try {
          await expect(
            bindAsync(client, `uid=baduser,ou=users,${baseDN}`, 'anypass')
          ).rejects.toThrow();
        } finally {
          await unbindAsync(client);
        }
      });

      test('should use MFA bypass pattern: per-user override skips notification provider', async () => {
        // Realm default: sql + notification (MFA)
        const sqlAuth = new MockAuthProvider({
          name: 'sql-auth',
          validCredentials: new Map([['normaluser', 'pass123'], ['serviceuser', 'svc-pass']])
        });
        const notificationAuth = new MockNotificationAuthProvider({
          notificationShouldSucceed: true
        });

        // Service user has auth_backends='sql-auth' — skips notification MFA
        const users = [
          { username: 'normaluser', uid_number: 2001, gid_number: 2000, first_name: 'Normal', last_name: 'User' },
          { username: 'serviceuser', uid_number: 2002, gid_number: 2000, first_name: 'Service', last_name: 'Account', auth_backends: 'sql-auth' }
        ];

        const registry = new Map([['sql-auth', sqlAuth]]);

        engine = new LdapEngine({
          port: TEST_PORT,
          bindIp: '127.0.0.1',
          logger: mockLogger,
          authProviderRegistry: registry,
          realms: [
            {
              name: 'mfa-realm',
              baseDn: baseDN,
              directoryProvider: new MockDirectoryProvider({ users, groups: [] }),
              authProviders: [sqlAuth, notificationAuth]
            }
          ]
        });

        await engine.start();

        // Normal user goes through both sql + notification
        const client1 = createClient(TEST_PORT);
        try {
          await bindAsync(client1, `uid=normaluser,ou=users,${baseDN}`, 'pass123');
          expect(sqlAuth.callCount).toBe(1);
          expect(notificationAuth.callCount).toBe(1);
        } finally {
          await unbindAsync(client1);
        }

        sqlAuth.reset();
        notificationAuth.callCount = 0;

        // Service user only goes through sql (MFA bypassed)
        const client2 = createClient(TEST_PORT);
        try {
          await bindAsync(client2, `uid=serviceuser,ou=users,${baseDN}`, 'svc-pass');
          expect(sqlAuth.callCount).toBe(1);
          expect(notificationAuth.callCount).toBe(0); // MFA skipped!
        } finally {
          await unbindAsync(client2);
        }
      });
    });
  });
});
