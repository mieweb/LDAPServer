const { LdapEngine, AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');

// Minimal mock auth provider
class MockAuthProvider extends AuthProvider {
  initialize() {}
  async authenticate(username, password) {
    return username === 'sshuser' && password === 'password';
  }
  async cleanup() {}
}

// Mock directory provider with SSH key support
class MockDirectoryProvider extends DirectoryProvider {
  initialize() {}
  async findUser(username) {
    if (username === 'sshuser') {
      return {
        username: 'sshuser',
        first_name: 'SSH',
        last_name: 'User',
        uid_number: 10001,
        gid_number: 100,
        mail: 'ssh@example.com',
        sshpublickey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8... sshuser@testhost'
      };
    }
    if (username === 'multikey') {
      return {
        username: 'multikey',
        first_name: 'Multi',
        last_name: 'Key',
        uid_number: 10002,
        gid_number: 100,
        mail: 'multi@example.com',
        sshpublickey: [
          'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8... key1@host',
          'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKey... key2@host'
        ]
      };
    }
    if (username === 'nokey') {
      return {
        username: 'nokey',
        first_name: 'No',
        last_name: 'Key',
        uid_number: 10003,
        gid_number: 100,
        mail: 'nokey@example.com'
      };
    }
    return null;
  }
  async getAllUsers() {
    return [
      {
        username: 'sshuser',
        first_name: 'SSH',
        last_name: 'User',
        uid_number: 10001,
        gid_number: 100,
        mail: 'ssh@example.com',
        sshpublickey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8... sshuser@testhost'
      },
      {
        username: 'multikey',
        first_name: 'Multi',
        last_name: 'Key',
        uid_number: 10002,
        gid_number: 100,
        mail: 'multi@example.com',
        sshpublickey: [
          'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8... key1@host',
          'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKey... key2@host'
        ]
      },
      {
        username: 'nokey',
        first_name: 'No',
        last_name: 'Key',
        uid_number: 10003,
        gid_number: 100,
        mail: 'nokey@example.com'
      }
    ];
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

describe('LdapEngine - SSH Public Key Support (openssh-lpk)', () => {
  const baseDn = 'dc=example,dc=com';
  const port = 12399;
  let engine;

  afterEach(async () => {
    if (engine) { await engine.stop(); engine = null; }
  });

  test('User with single SSH key returns sshPublicKey attribute and ldapPublicKey objectClass', async () => {
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
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search(baseDn, { filter: '(uid=sshuser)', scope: 'sub' }, (err, res) => {
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
      const user = result[0];
      
      // Check DN
      expect(user.dn).toBe(`uid=sshuser,${baseDn}`);
      
      // Check SSH public key is present
      expect(user.attributes.sshPublicKey).toBe('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8... sshuser@testhost');
      
      // Check ldapPublicKey objectClass is present
      expect(user.attributes.objectClass).toBeDefined();
      const objectClasses = Array.isArray(user.attributes.objectClass) 
        ? user.attributes.objectClass 
        : [user.attributes.objectClass];
      expect(objectClasses).toContain('ldapPublicKey');
      expect(objectClasses).toContain('posixAccount');
      expect(objectClasses).toContain('inetOrgPerson');
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('User with multiple SSH keys returns array of sshPublicKey values', async () => {
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
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search(baseDn, { filter: '(uid=multikey)', scope: 'sub' }, (err, res) => {
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
      const user = result[0];
      
      // Check SSH public keys array is present
      expect(user.attributes.sshPublicKey).toBeDefined();
      expect(Array.isArray(user.attributes.sshPublicKey)).toBe(true);
      expect(user.attributes.sshPublicKey.length).toBe(2);
      expect(user.attributes.sshPublicKey).toContain('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8... key1@host');
      expect(user.attributes.sshPublicKey).toContain('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKey... key2@host');
      
      // Check ldapPublicKey objectClass is present
      const objectClasses = Array.isArray(user.attributes.objectClass) 
        ? user.attributes.objectClass 
        : [user.attributes.objectClass];
      expect(objectClasses).toContain('ldapPublicKey');
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('User without SSH key does not have sshPublicKey attribute or ldapPublicKey objectClass', async () => {
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
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search(baseDn, { filter: '(uid=nokey)', scope: 'sub' }, (err, res) => {
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
      const user = result[0];
      
      // Check SSH public key is NOT present
      expect(user.attributes.sshPublicKey).toBeUndefined();
      
      // Check ldapPublicKey objectClass is NOT present
      const objectClasses = Array.isArray(user.attributes.objectClass) 
        ? user.attributes.objectClass 
        : [user.attributes.objectClass];
      expect(objectClasses).not.toContain('ldapPublicKey');
      expect(objectClasses).toContain('posixAccount');
      expect(objectClasses).toContain('inetOrgPerson');
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('Search for users with ldapPublicKey objectClass returns only users with SSH keys', async () => {
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
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search(baseDn, { filter: '(objectClass=ldapPublicKey)', scope: 'sub' }, (err, res) => {
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

      // Should return 2 users: sshuser and multikey
      expect(result.length).toBe(2);
      
      const usernames = result.map(e => e.attributes.uid);
      expect(usernames).toContain('sshuser');
      expect(usernames).toContain('multikey');
      
      // All returned users should have sshPublicKey attribute
      result.forEach(user => {
        expect(user.attributes.sshPublicKey).toBeDefined();
      });
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });

  test('Requesting all attributes with * returns sshPublicKey', async () => {
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
      const result = await new Promise((resolve, reject) => {
        const entries = [];
        client.search(baseDn, { 
          filter: '(uid=sshuser)', 
          scope: 'sub',
          attributes: ['*']  // Request all user attributes (SSSD pattern)
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
      const user = result[0];
      
      // Should have all user attributes including sshPublicKey
      expect(user.attributes.uid).toBe('sshuser');
      expect(user.attributes.sshPublicKey).toBe('ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC8... sshuser@testhost');
      
      // objectClass is always returned
      expect(user.attributes.objectClass).toBeDefined();
    } finally {
      await new Promise((resolve) => client.unbind(() => resolve()));
      client.destroy();
    }
  });
});
