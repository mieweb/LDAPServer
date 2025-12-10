/**
 * Integration Tests: Proxmox Directory Backend
 * 
 * Tests acceptance criteria for Proxmox directory provider:
 * a. (objectClass=*) all object filter
 * b. (objectClass=posixAccount) all users filter
 * c. (objectClass=posixGroup) all group filter
 * d. (uid=username) specific user
 * e. (cn=groupname) specific group
 * f. (cn=*) all groups filter
 */

const fs = require('fs');
const path = require('path');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');
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

  // Test data for Proxmox user.cfg format
  // Format: user:username@realm:enabled:expire:firstName:lastName:email:::
  const proxmoxConfig = `user:testuser@pve:1:0:Test:User:testuser@example.com:::
user:admin@pve:1:0:Admin:User:admin@example.com:::
user:jdoe@pve:1:0:John:Doe:jdoe@example.com:::
user:disabled@pve:0:0:Disabled:User:disabled@example.com:::
user:expired@pve:1:1609459200:Expired:User:expired@example.com:::

group:admins:admin@pve::
group:developers:testuser@pve,jdoe@pve::
group:users:testuser@pve,admin@pve,jdoe@pve::
`;


  beforeAll(async () => {
    // Create temporary user.cfg file
    tempConfigPath = path.join(__dirname, 'test-proxmox-user.cfg');
    fs.writeFileSync(tempConfigPath, proxmoxConfig, 'utf8');

    // Configure environment for Proxmox provider
    process.env.PROXMOX_USER_CFG = tempConfigPath;
    process.env.LDAP_BASE_DN = baseDN;

    // Create directory provider
    directoryProvider = new ProxmoxDirectoryProvider();
    await directoryProvider.initialize();

    // Create mock auth provider
    const authProvider = new MockAuthProvider({
      validCredentials: new Map([
        ['testuser', 'password123'],
        ['admin', 'admin123'],
        ['jdoe', 'john123']
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

      // Should return enabled users (3) + all groups (4)
      expect(results.length).toBeGreaterThanOrEqual(6);
      
      // Verify we have both users and groups
      const userEntries = results.filter(r => r.dn.includes('uid='));
      const groupEntries = results.filter(r => r.dn.includes('cn='));
      
      expect(userEntries.length).toBeGreaterThan(0);
      expect(groupEntries.length).toBeGreaterThan(0);
    });

    test('b. (objectClass=posixAccount) should return all users', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allUsers,
        scope: 'sub'
      });

      // Proxmox backend returns ALL users (enabled flag not filtered)
      expect(results.length).toBe(5);

      // Verify all results are user entries
      results.forEach(entry => {
        expect(entry.dn).toMatch(/uid=/);
        expect(entry.attributes.objectClass).toContain('posixAccount');
        expect(entry.attributes.uid).toBeDefined();
        expect(entry.attributes.uidNumber).toBeDefined();
      });

      // Verify specific users are present
      const usernames = results.map(r => r.attributes.uid);
      expect(usernames).toContain('testuser');
      expect(usernames).toContain('admin');
      expect(usernames).toContain('jdoe');
      expect(usernames).toContain('disabled'); // Backend doesn't filter by enabled flag
    });

    test('c. (objectClass=posixGroup) should return all groups', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allGroups,
        scope: 'sub'
      });

      // 3 explicit groups + proxmox-sudo group = 4 total
      expect(results.length).toBe(4);

      // Verify all results are group entries
      results.forEach(entry => {
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.objectClass).toContain('posixGroup');
        expect(entry.attributes.cn).toBeDefined();
        expect(entry.attributes.gidNumber).toBeDefined();
      });

      // Verify specific groups are present
      const groupNames = results.map(r => r.attributes.cn);
      expect(groupNames).toContain('users');
      expect(groupNames).toContain('admins');
      expect(groupNames).toContain('developers');
      expect(groupNames).toContain('proxmox-sudo'); // Auto-generated sudo group
    });

    test('d. (uid=username) should return specific user', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.specificUser('testuser'),
        scope: 'sub'
      });

      expect(results.length).toBe(1);

      const user = results[0];
      expect(user.dn).toMatch(/uid=testuser/);
      expect(user.attributes.uid).toBe('testuser');
      
      // Proxmox-specific: Verify exact values from test data
      // user:testuser@pve:1:0:Test:User:testuser@example.com:::
      // Backend constructs: full_name = "Test User", surname = "User"
      expect(user.attributes.cn).toBe('Test User'); // full_name (firstName + space + lastName)
      expect(user.attributes.sn).toBe('User'); // lastName field
      expect(user.attributes.mail).toBe('testuser@example.com'); // email from config
      expect(user.attributes.homeDirectory).toBe('/home/testuser'); // constructed from uid
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
        filter: acceptanceFilters.specificGroup('admins'),
        scope: 'sub'
      });

      // Should return at least the group (may also return users if their cn matches)
      expect(results.length).toBeGreaterThanOrEqual(1);

      // Verify the group is in results
      const group = results.find(r => 
        r.attributes.objectClass.includes('posixGroup') && 
        r.attributes.cn === 'admins'
      );
      expect(group).toBeDefined();
      expect(group.dn).toMatch(/cn=admins/);
      expect(group.attributes.gidNumber).toBeDefined();
      
      // Verify memberUid attribute
      const memberUids = Array.isArray(group.attributes.memberUid) 
        ? group.attributes.memberUid 
        : [group.attributes.memberUid];
      expect(memberUids).toContain('admin');
    });

    test('f. (cn=*) should return all entries with cn attribute', async () => {
      // LDAP-compliant: (cn=*) searches all entries with any cn value
      // This includes both users (cn=common name) and groups (cn=group name)
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allGroupsWildcard,
        scope: 'sub'
      });

      // Should return enabled users (3) + all groups (4) = 7 entries with cn
      // (disabled user excluded by Proxmox backend)
      expect(results.length).toBeGreaterThanOrEqual(7);
      
      // All results should have cn attribute
      results.forEach(entry => {
        expect(entry.attributes.cn).toBeDefined();
      });
      
      // Verify groups are present
      const groupEntries = results.filter(r => 
        r.attributes.objectClass.includes('posixGroup')
      );
      expect(groupEntries.length).toBe(4); // 3 explicit + proxmox-sudo
      
      const groupNames = groupEntries.map(g => g.attributes.cn);
      expect(groupNames).toContain('users');
      expect(groupNames).toContain('admins');
      expect(groupNames).toContain('developers');
      expect(groupNames).toContain('proxmox-sudo');
      
      // Verify users are also present (they have cn too)
      const userEntries = results.filter(r => 
        r.attributes.objectClass.includes('posixAccount')
      );
      expect(userEntries.length).toBeGreaterThanOrEqual(3); // At least 3 enabled users
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
      // LDAP-compliant: (cn=developers) is a mixed search
      const results = await client.search(baseDN, {
        filter: '(cn=developers)',
        scope: 'sub'
      });

      // Should find at least the developers group
      expect(results.length).toBeGreaterThanOrEqual(1);
      
      // Find the developers group entry
      const group = results.find(r => 
        r.attributes.objectClass.includes('posixGroup') && 
        r.attributes.cn === 'developers'
      );
      expect(group).toBeDefined();
      expect(group.dn).toMatch(/cn=developers/);
      
      // Proxmox-specific: Verify exact member list from test data
      // group:developers:testuser@pve,jdoe@pve::
      const memberUids = Array.isArray(group.attributes.memberUid)
        ? group.attributes.memberUid
        : [group.attributes.memberUid];
        
      expect(memberUids).toHaveLength(2);
      expect(memberUids).toContain('testuser');
      expect(memberUids).toContain('jdoe');
      expect(memberUids).not.toContain('admin'); // Not in this group
    });

    test.skip('should return empty group without members - Backend skips empty groups', async () => {
      // Proxmox backend explicitly skips groups with no members
      const results = await client.search(baseDN, {
        filter: '(cn=empty)',
        scope: 'sub'
      });

      expect(results.length).toBe(0); // Empty groups are not included
    });

    test('should include disabled users in results', async () => {
      const results = await client.search(baseDN, {
        filter: '(uid=disabled)',
        scope: 'sub'
      });

      // Proxmox backend doesn't filter by enabled flag, so disabled user IS returned
      expect(results.length).toBe(1);
      
      const user = results[0];
      // user:disabled@pve:0:0:Disabled:User:disabled@example.com:::
      expect(user.attributes.uid).toBe('disabled');
      expect(user.attributes.cn).toBe('Disabled User');
      expect(user.attributes.sn).toBe('User');
      expect(user.attributes.mail).toBe('disabled@example.com');
    });

    test('should parse user with full name correctly', async () => {
      const results = await client.search(baseDN, {
        filter: '(uid=jdoe)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const user = results[0];
      // Proxmox-specific: Verify parsing of firstName and lastName
      // user:jdoe@pve:1:0:John:Doe:jdoe@example.com:::
      expect(user.attributes.uid).toBe('jdoe');
      expect(user.attributes.cn).toBe('John Doe'); // full_name = firstName + space + lastName
      expect(user.attributes.sn).toBe('Doe'); // lastName field
      expect(user.attributes.mail).toBe('jdoe@example.com');
      expect(user.attributes.homeDirectory).toBe('/home/jdoe');
    });

    test('should generate stable UIDs for users', async () => {
      // Search for same user multiple times to verify UID is consistent
      const results1 = await client.search(baseDN, {
        filter: '(uid=testuser)',
        scope: 'sub'
      });

      const results2 = await client.search(baseDN, {
        filter: '(uid=testuser)',
        scope: 'sub'
      });

      expect(results1[0].attributes.uidNumber).toBe(results2[0].attributes.uidNumber);
      expect(results1[0].attributes.gidNumber).toBe(results2[0].attributes.gidNumber);
    });

    test('should parse realm from username correctly', async () => {
      // Proxmox stores users as username@realm
      const results = await client.search(baseDN, {
        filter: '(uid=admin)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const user = results[0];
      // user:admin@pve:1:0:Admin:User:admin@example.com:::
      // Realm (@pve) should be stripped from username
      expect(user.attributes.uid).toBe('admin'); // No @pve suffix
      expect(user.attributes.cn).toBe('Admin User'); // firstName + space + lastName
      expect(user.attributes.sn).toBe('User'); // lastName field
      expect(user.attributes.mail).toBe('admin@example.com');
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

      expect(results.length).toBe(5);

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

      // 3 explicit groups + proxmox-sudo = 4
      expect(results.length).toBe(4);

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
      // Get enabled user
      const enabledUser = await directoryProvider.findUser('testuser');
      expect(enabledUser).toBeDefined();
      expect(enabledUser.enabled).toBe(true);

      // Get disabled user (enabled=0 in config)
      const disabledUser = await directoryProvider.findUser('disabled');
      expect(disabledUser).toBeDefined();
      expect(disabledUser.enabled).toBe(false);
    });

    test('should correctly parse expire field from user.cfg', async () => {
      // Get user with no expiration (expire=0)
      const noExpireUser = await directoryProvider.findUser('testuser');
      expect(noExpireUser).toBeDefined();
      expect(noExpireUser.expire).toBe(0);

      // Get user with expiration timestamp
      const expiredUser = await directoryProvider.findUser('expired');
      expect(expiredUser).toBeDefined();
      expect(expiredUser.expire).toBe(1609459200); // Jan 1, 2021 00:00:00 UTC
    });

    test('should include both enabled and disabled users in search results', async () => {
      const allUsers = await directoryProvider.getAllUsers();
      
      // Should have 5 users total (testuser, admin, jdoe, disabled, expired)
      expect(allUsers.length).toBe(5);

      const enabledUsers = allUsers.filter(u => u.enabled === true);
      const disabledUsers = allUsers.filter(u => u.enabled === false);

      // 4 enabled users (testuser, admin, jdoe, expired)
      expect(enabledUsers.length).toBe(4);
      // 1 disabled user
      expect(disabledUsers.length).toBe(1);
      expect(disabledUsers[0].username).toBe('disabled');
    });

    test('should distinguish between never-expires and expired users', async () => {
      const allUsers = await directoryProvider.getAllUsers();
      
      const neverExpires = allUsers.filter(u => u.expire === 0);
      const hasExpiration = allUsers.filter(u => u.expire > 0);

      // 4 users never expire (testuser, admin, jdoe, disabled)
      expect(neverExpires.length).toBe(4);
      // 1 user has expiration
      expect(hasExpiration.length).toBe(1);
      expect(hasExpiration[0].username).toBe('expired');
    });
  });
});
