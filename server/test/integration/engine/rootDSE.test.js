const { LdapEngine, AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');

// Minimal mock auth provider
class MockAuthProvider extends AuthProvider {
  initialize() {}
  async authenticate(username, password) {
    return username === 'testuser' && password === 'password';
  }
  async cleanup() {}
}

// Minimal mock directory provider
class MockDirectoryProvider extends DirectoryProvider {
  initialize() {}
  async findUser(username) {
    if (username === 'testuser') {
      return { username: 'testuser', firstname: 'Test', lastname: 'User', uid_number: 10001, gid_number: 100, email: 'test@example.com' };
    }
    return null;
  }
  async getAllUsers() {
    return [ { username: 'testuser', firstname: 'Test', lastname: 'User', uid_number: 10001, gid_number: 100, email: 'test@example.com' } ];
  }
  async getAllGroups() { return []; }
  async findGroups() { return []; }
  async cleanup() {}
}

jest.setTimeout(10000);

// Helper function to extract attributes from LDAP entry
function extractAttributes(entry) {
  return entry.attributes.reduce((acc, attr) => {
    const values = attr.values || attr.vals || [];
    acc[attr.type] = values.length === 1 ? values[0] : values;
    return acc;
  }, {});
}

describe('LdapEngine - RootDSE Support (RFC 4512)', () => {
  const baseDn = 'dc=example,dc=com';
  const port = 12398;
  let engine;

  afterEach(async () => {
    if (engine) { await engine.stop(); engine = null; }
  });

  test('RootDSE query returns server capabilities without authentication', async () => {
    engine = new LdapEngine({
      baseDn,
      port,
      requireAuthForSearch: true, // Even with auth required, RootDSE should be accessible
      authProviders: [new MockAuthProvider()],
      directoryProvider: new MockDirectoryProvider(),
      logger,
    });
    await engine.start();

    const client = ldap.createClient({ url: `ldap://127.0.0.1:${port}` });
    try {
      // Search RootDSE without authentication (anonymous)
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search('', { filter: '(objectClass=*)', scope: 'base' }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (entry) => {
            entries.push({
              dn: entry.objectName.toString(),
              attributes: extractAttributes(entry)
            });
          });
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });

      // Verify RootDSE entry
      expect(result.length).toBe(1);
      const rootDSE = result[0];
      
      // Check DN is empty
      expect(rootDSE.dn).toBe('');
      
      // Check required attributes
      expect(rootDSE.attributes.objectClass).toBeDefined();
      expect(rootDSE.attributes.objectClass).toContain('top');
      
      expect(rootDSE.attributes.namingContexts).toBeDefined();
      expect(rootDSE.attributes.namingContexts).toContain(baseDn);
      
      expect(rootDSE.attributes.supportedLDAPVersion).toBeDefined();
      expect(rootDSE.attributes.supportedLDAPVersion).toContain('3');
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('RootDSE is accessible even when requireAuthForSearch is true', async () => {
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
      // Anonymous RootDSE search should succeed
      const rootDSEResult = await new Promise((resolve, reject) => {
        const entries = [];
        client.search('', { filter: '(objectClass=*)', scope: 'base' }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (e) => entries.push(e));
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });
      expect(rootDSEResult.length).toBe(1);

      // Regular search without auth should fail
      const regularSearchResult = await new Promise((resolve) => {
        const entries = [];
        client.search(baseDn, { filter: '(objectClass=*)', scope: 'sub' }, (err, res) => {
          if (err) return resolve({ ok: false, err });
          res.on('searchEntry', (e) => entries.push(e));
          res.on('error', (e) => resolve({ ok: false, err: e }));
          res.on('end', () => resolve({ ok: true, entries }));
        });
      });
      expect(regularSearchResult.ok).toBe(false);
      expect(String(regularSearchResult.err)).toMatch(/InsufficientAccessRights|insufficient/i);
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('RootDSE returns correct namingContexts based on baseDn configuration', async () => {
    const customBaseDn = 'dc=test,dc=local';
    engine = new LdapEngine({
      baseDn: customBaseDn,
      port,
      requireAuthForSearch: false,
      authProviders: [new MockAuthProvider()],
      directoryProvider: new MockDirectoryProvider(),
      logger,
    });
    await engine.start();

    const client = ldap.createClient({ url: `ldap://127.0.0.1:${port}` });
    try {
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search('', { filter: '(objectClass=*)', scope: 'base' }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (entry) => {
            entries.push({
              attributes: extractAttributes(entry)
            });
          });
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });

      expect(result.length).toBe(1);
      expect(result[0].attributes.namingContexts).toContain(customBaseDn);
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('RootDSE search with non-base scope returns nothing', async () => {
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
    try {
      // Search with 'sub' scope should return empty
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search('', { filter: '(objectClass=*)', scope: 'sub' }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (e) => entries.push(e));
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });

      expect(result.length).toBe(0);
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('RootDSE with "+" returns operational attributes', async () => {
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
    try {
      // Search with "+" should return operational attributes
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search('', { filter: '(objectClass=*)', scope: 'base', attributes: ['+'] }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (entry) => {
            entries.push({
              dn: entry.objectName.toString(),
              attributes: extractAttributes(entry)
            });
          });
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });

      expect(result.length).toBe(1);
      const rootDSE = result[0];
      
      // Should include operational attributes
      expect(rootDSE.attributes.namingContexts).toBeDefined();
      expect(rootDSE.attributes.namingContexts).toContain(baseDn);
      expect(rootDSE.attributes.supportedLDAPVersion).toBeDefined();
      expect(rootDSE.attributes.supportedLDAPVersion).toContain('3');
      
      // objectClass is always returned
      expect(rootDSE.attributes.objectClass).toBeDefined();
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('RootDSE with "*" returns only user attributes (not operational)', async () => {
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
    try {
      // Search with "*" should return only user attributes (not operational)
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search('', { filter: '(objectClass=*)', scope: 'base', attributes: ['*'] }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (entry) => {
            entries.push({
              dn: entry.objectName.toString(),
              attributes: extractAttributes(entry)
            });
          });
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });

      expect(result.length).toBe(1);
      const rootDSE = result[0];
      
      // Should include objectClass (user attribute)
      expect(rootDSE.attributes.objectClass).toBeDefined();
      expect(rootDSE.attributes.objectClass).toContain('top');
      
      // Should NOT include operational attributes
      expect(rootDSE.attributes.namingContexts).toBeUndefined();
      expect(rootDSE.attributes.supportedLDAPVersion).toBeUndefined();
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('RootDSE with specific attributes returns only requested attributes', async () => {
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
    try {
      // Search with specific attributes should return only those
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search('', { 
          filter: '(objectClass=*)', 
          scope: 'base', 
          attributes: ['namingContexts', 'supportedLDAPVersion'] 
        }, (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (entry) => {
            entries.push({
              dn: entry.objectName.toString(),
              attributes: extractAttributes(entry)
            });
          });
          res.on('error', (e) => reject(e));
          res.on('end', () => resolve(entries));
        });
      });

      expect(result.length).toBe(1);
      const rootDSE = result[0];
      
      // Should include requested attributes
      expect(rootDSE.attributes.namingContexts).toBeDefined();
      expect(rootDSE.attributes.namingContexts).toContain(baseDn);
      expect(rootDSE.attributes.supportedLDAPVersion).toBeDefined();
      expect(rootDSE.attributes.supportedLDAPVersion).toContain('3');
      
      // objectClass is always returned (as per LDAP spec)
      expect(rootDSE.attributes.objectClass).toBeDefined();
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });
});
