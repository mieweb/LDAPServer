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
});
