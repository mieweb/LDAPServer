// Integration Tests: Proxmox Directory Backend
// 
// Tests acceptance criteria for Proxmox directory provider:
// a. (objectClass=*) all object filter
// b. (objectClass=posixAccount) all users filter
// c. (objectClass=posixGroup) all group filter
// d. (uid=username) specific user
// e. (cn=groupname) specific group
// f. (cn=*) all groups filter

const fs = require('fs');
const path = require('path');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');
const { loadProxmoxUserData } = require('../../utils/dataLoader');
const { 
  baseDN, 
  acceptanceFilters,
  testPorts 
} = require('../../fixtures/testData');

// Import backends
const { provider: ProxmoxDirectoryProvider } = require('../../../backends/proxmox.directory');
const { MockAuthProvider } = require('../../../../npm/test/fixtures/mockProviders');

describe('Proxmox Directory Backend - Acceptance Tests', () => {
  let server;
  let client;
  let directoryProvider;
  let tempConfigPath;

  beforeAll(async () => {
    // Use centralized Proxmox user.cfg test data
    const proxmoxConfig = loadProxmoxUserData();
    
    // Create temporary user.cfg file
    tempConfigPath = path.join(__dirname, 'test-proxmox-user.cfg');
    fs.writeFileSync(tempConfigPath, proxmoxConfig, 'utf8');

    // Configure environment for Proxmox provider
    process.env.PROXMOX_USER_CFG = tempConfigPath;
    process.env.LDAP_BASE_DN = baseDN;

    // Create directory provider
    directoryProvider = new ProxmoxDirectoryProvider();
    await directoryProvider.initialize();

    // Create mock auth provider with Proxmox test users
    const authProvider = new MockAuthProvider({
      validCredentials: new Map([
        ['alice', 'alicepass'],
        ['bob', 'bobpass'],
        ['carol', 'carolpass']
      ])
    });

    // Start LDAP server
    server = new TestServer({
      port: testPorts.proxmox,
      baseDn: baseDN,
      authProviders: [authProvider],
      directoryProvider: directoryProvider,
      requireAuthForSearch: false, // Allow anonymous search for these tests
      logger: mockLogger
    });

    await server.start();

    // Create LDAP client
    client = new LdapTestClient({
      url: server.getUrl()
    });

    await client.connect();
  });

  afterAll(async () => {
    if (client) {
      await client.destroy();
    }
    if (server) {
      await server.stop();
    }
    if (directoryProvider) {
      await directoryProvider.cleanup();
    }
    
    // Clean up test config file
    if (tempConfigPath && fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  });

  describe('Acceptance Criteria: Directory Filters', () => {
    
    test('a. (objectClass=*) should return all objects (users + groups)', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allObjects,
        scope: 'sub'
      });

      // Should return 3 users + 3 groups (2 explicit + proxmox-sudo) = 6 total
      expect(results.length).toBeGreaterThanOrEqual(6);
      
      // Verify we have both users and groups
      const userEntries = results.filter(r => r.dn.includes('uid='));
      const groupEntries = results.filter(r => r.dn.includes('cn='));
      
      expect(userEntries.length).toBe(3); // alice, bob, carol
      expect(groupEntries.length).toBeGreaterThanOrEqual(3); // ldapusers, sysadmins, proxmox-sudo
    });

    test('b. (objectClass=posixAccount) should return all users', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allUsers,
        scope: 'sub'
      });

      // Proxmox backend returns ALL users (3: alice, bob, carol)
      expect(results.length).toBe(3);

      // Verify all results are user entries
      results.forEach(entry => {
        expect(entry.dn).toMatch(/uid=/);
        expect(entry.attributes.objectClass).toContain('posixAccount');
        expect(entry.attributes.uid).toBeDefined();
        expect(entry.attributes.uidNumber).toBeDefined();
      });

      // Verify specific users are present
      const usernames = results.map(r => r.attributes.uid);
      expect(usernames).toContain('alice');
      expect(usernames).toContain('bob');
      expect(usernames).toContain('carol');
    });

    test('c. (objectClass=posixGroup) should return all groups', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allGroups,
        scope: 'sub'
      });

      // 2 explicit groups (ldapusers, sysadmins) + proxmox-sudo = 3 total
      expect(results.length).toBe(3);

      // Verify all results are group entries
      results.forEach(entry => {
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.objectClass).toContain('posixGroup');
        expect(entry.attributes.cn).toBeDefined();
        expect(entry.attributes.gidNumber).toBeDefined();
      });

      // Verify specific groups are present
      const groupNames = results.map(r => r.attributes.cn);
      expect(groupNames).toContain('ldapusers');
      expect(groupNames).toContain('sysadmins');
      expect(groupNames).toContain('proxmox-sudo'); // Auto-generated sudo group
    });

    test('d. (uid=username) should return specific user', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.specificUser('alice'),
        scope: 'sub'
      });

      expect(results.length).toBe(1);

      const user = results[0];
      expect(user.dn).toMatch(/uid=alice/);
      expect(user.attributes.uid).toBe('alice');
      
      // Proxmox-specific: Verify exact values from test data
      // user:alice@pve:1:0:Alice:Smith:asmith@example.com:::
      // Backend constructs: full_name = "Alice Smith", surname = "Smith"
      expect(user.attributes.cn).toBe('Alice Smith'); // full_name (firstName + space + lastName)
      expect(user.attributes.sn).toBe('Smith'); // lastName field
      expect(user.attributes.mail).toBe('asmith@example.com'); // email from config
      expect(user.attributes.homeDirectory).toBe('/home/alice'); // constructed from uid
      expect(user.attributes.loginShell).toBe('/bin/bash'); // default
      
      // Proxmox uses stable SHA-256 hash for UID/GID generation
      expect(parseInt(user.attributes.uidNumber)).toBeGreaterThanOrEqual(2000);
      expect(parseInt(user.attributes.gidNumber)).toBeGreaterThanOrEqual(2000);
      // UID and GID should be equal for Proxmox users (primary group = user)
      expect(user.attributes.uidNumber).toBe(user.attributes.gidNumber);
    });

    test('e. (cn=groupname) should return specific group', async () => {
      // LDAP-compliant: (cn=groupname) searches all entries where cn matches
      // This is a mixed search - could match users (with cn=common name) or groups (cn=group name)
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.specificGroup('sysadmins'),
        scope: 'sub'
      });

      // Should return at least the group (may also return users if their cn matches)
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Verify the group is in results
      const group = results.find(r => 
        r.attributes.objectClass.includes('posixGroup') && 
        r.attributes.cn === 'sysadmins'
      );
      expect(group).toBeDefined();
      expect(group.dn).toMatch(/cn=sysadmins/);
      expect(group.attributes.gidNumber).toBeDefined();
      
      // Verify memberUid attribute
      const memberUids = Array.isArray(group.attributes.memberUid) 
        ? group.attributes.memberUid 
        : [group.attributes.memberUid];
      expect(memberUids).toContain('alice');
    });

    test('f. (cn=*) should return all groups', async () => {
      // In LDAP, cn= in filter searches for groups (groups use cn= in their DN)
      // Users use uid= in their DN, so cn=* returns groups only
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allGroupsWildcard,
        scope: 'sub'
      });

      // Should return all groups (3: ldapusers, sysadmins, proxmox-sudo)
      expect(results.length).toBe(3);
      
      // All results should be groups with cn attribute
      results.forEach(entry => {
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.cn).toBeDefined();
        expect(entry.attributes.objectClass).toContain('posixGroup');
      });
      
      // Verify specific groups are present
      const groupNames = results.map(g => g.attributes.cn);
      expect(groupNames).toContain('ldapusers');
      expect(groupNames).toContain('sysadmins');
      expect(groupNames).toContain('proxmox-sudo');
    });
  });

  describe('Additional Proxmox Directory Tests', () => {
    
    test('should handle non-existent user lookup', async () => {
      const results = await client.search(baseDN, {
        filter: '(uid=nonexistent)',
        scope: 'sub'
      });

      expect(results.length).toBe(0);
    });

    test('should handle non-existent group lookup', async () => {
      const results = await client.search(baseDN, {
        filter: '(cn=nonexistentgroup)',
        scope: 'sub'
      });

      expect(results.length).toBe(0);
    });

    test('should return group with members', async () => {
      // LDAP-compliant: (cn=ldapusers) is a mixed search
      const results = await client.search(baseDN, {
        filter: '(cn=ldapusers)',
        scope: 'sub'
      });

      // Should find at least the ldapusers group
      expect(results.length).toBeGreaterThanOrEqual(1);
      
      // Find the ldapusers group entry
      const group = results.find(r => 
        r.attributes.objectClass.includes('posixGroup') && 
        r.attributes.cn === 'ldapusers'
      );
      expect(group).toBeDefined();
      expect(group.dn).toMatch(/cn=ldapusers/);
      
      // Proxmox-specific: Verify exact member list from test data
      // group:ldapusers:alice@pve,bob@pve,carol@pve::
      const memberUids = Array.isArray(group.attributes.memberUid)
        ? group.attributes.memberUid
        : [group.attributes.memberUid];
        
      expect(memberUids).toHaveLength(3);
      expect(memberUids).toContain('alice');
      expect(memberUids).toContain('bob');
      expect(memberUids).toContain('carol');
    });

    test('should parse user with full name correctly', async () => {
      const results = await client.search(baseDN, {
        filter: '(uid=bob)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const user = results[0];
      // Proxmox-specific: Verify parsing of firstName and lastName
      // user:bob@pve:1:0:Bob:Johnson:bjohnson@example.com:::
      expect(user.attributes.uid).toBe('bob');
      expect(user.attributes.cn).toBe('Bob Johnson'); // full_name = firstName + space + lastName
      expect(user.attributes.sn).toBe('Johnson'); // lastName field
      expect(user.attributes.mail).toBe('bjohnson@example.com');
      expect(user.attributes.homeDirectory).toBe('/home/bob');
    });

    test('should generate stable UIDs for users', async () => {
      // Search for same user multiple times to verify UID is consistent
      const results1 = await client.search(baseDN, {
        filter: '(uid=alice)',
        scope: 'sub'
      });

      const results2 = await client.search(baseDN, {
        filter: '(uid=alice)',
        scope: 'sub'
      });

      expect(results1[0].attributes.uidNumber).toBe(results2[0].attributes.uidNumber);
      expect(results1[0].attributes.gidNumber).toBe(results2[0].attributes.gidNumber);
    });

    test('should parse realm from username correctly', async () => {
      // Proxmox stores users as username@realm
      const results = await client.search(baseDN, {
        filter: '(uid=carol)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const user = results[0];
      // user:carol@pve:1:0:Carol:Williams:cwilliams@example.com:::
      // Realm (@pve) should be stripped from username
      expect(user.attributes.uid).toBe('carol'); // No @pve suffix
      expect(user.attributes.cn).toBe('Carol Williams'); // firstName + space + lastName
      expect(user.attributes.sn).toBe('Williams'); // lastName field
      expect(user.attributes.mail).toBe('cwilliams@example.com');
    });

    test('should create proxmox-sudo group automatically', async () => {
      const results = await client.search(baseDN, {
        filter: '(cn=proxmox-sudo)',
        scope: 'sub'
      });

      // Proxmox backend auto-creates a sudo group
      expect(results.length).toBeGreaterThanOrEqual(1);
      
      const group = results.find(r => 
        r.attributes.objectClass.includes('posixGroup')
      );
      expect(group).toBeDefined();
      expect(group.attributes.cn).toBe('proxmox-sudo');
      expect(group.attributes.gidNumber).toBeDefined();
    });

    test('should verify all test users have correct attributes', async () => {
      const results = await client.search(baseDN, {
        filter: '(objectClass=posixAccount)',
        scope: 'sub'
      });

      expect(results.length).toBe(3);

      // Verify each user has all required Proxmox attributes
      results.forEach(user => {
        expect(user.attributes.uid).toBeDefined();
        expect(user.attributes.cn).toBeDefined();
        expect(user.attributes.sn).toBeDefined();
        // Mail can be empty string if not provided in config
        expect(user.attributes.mail).toBeDefined();
        if (user.attributes.mail) {
          expect(user.attributes.mail).toMatch(/@example\.com$/);
        }
        expect(user.attributes.homeDirectory).toMatch(/^\/home\//);
        expect(user.attributes.loginShell).toBe('/bin/bash');
        expect(user.attributes.objectClass).toContain('posixAccount');
        expect(user.attributes.objectClass).toContain('inetOrgPerson');
      });
    });

    test('should verify all test groups have correct structure', async () => {
      const results = await client.search(baseDN, {
        filter: '(objectClass=posixGroup)',
        scope: 'sub'
      });

      // 2 explicit groups + proxmox-sudo = 3
      expect(results.length).toBe(3);

      results.forEach(group => {
        expect(group.attributes.cn).toBeDefined();
        expect(group.attributes.gidNumber).toBeDefined();
        expect(group.attributes.objectClass).toContain('posixGroup');
        
        // All groups should have members (empty groups are skipped)
        if (group.attributes.memberUid) {
          const members = Array.isArray(group.attributes.memberUid)
            ? group.attributes.memberUid
            : [group.attributes.memberUid];
          expect(members.length).toBeGreaterThan(0);
        }
      });
    });

    test('should correctly parse enabled field from user.cfg', async () => {
      // All users in centralized data are enabled (enabled=1)
      const enabledUser = await directoryProvider.findUser('alice');
      expect(enabledUser).toBeDefined();
      expect(enabledUser.enabled).toBe(true);

      const anotherUser = await directoryProvider.findUser('bob');
      expect(anotherUser).toBeDefined();
      expect(anotherUser.enabled).toBe(true);
    });

    test('should correctly parse expire field from user.cfg', async () => {
      // All users in centralized data have no expiration (expire=0)
      const user1 = await directoryProvider.findUser('alice');
      expect(user1).toBeDefined();
      expect(user1.expire).toBe(0);

      const user2 = await directoryProvider.findUser('carol');
      expect(user2).toBeDefined();
      expect(user2.expire).toBe(0);
    });

    test('should include all enabled users in search results', async () => {
      const allUsers = await directoryProvider.getAllUsers();
      
      // Should have 3 users total (alice, bob, carol)
      expect(allUsers.length).toBe(3);

      const enabledUsers = allUsers.filter(u => u.enabled === true);

      // All 3 users are enabled
      expect(enabledUsers.length).toBe(3);
    });

    test('should verify all users have expire=0 (never expires)', async () => {
      const allUsers = await directoryProvider.getAllUsers();
      
      // All 3 users never expire in centralized data
      expect(allUsers.length).toBe(3);
      
      const neverExpires = allUsers.filter(u => u.expire === 0);
      expect(neverExpires.length).toBe(3);
    });
  });
});
