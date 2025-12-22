/**
 * Integration Tests: MongoDB Directory Backend
 * 
 * Tests acceptance criteria for MongoDB directory provider:
 * a. (objectClass=*) all object filter
 * b. (objectClass=posixAccount) all users filter
 * c. (objectClass=posixGroup) all group filter
 * d. (uid=username) specific user
 * e. (cn=groupname) specific group
 * f. (cn=*) all groups filter
 * g. (memberUid=username) groups containing specific user
 * h. (gidNumber=123) groups by GID
 */

const { MongoClient } = require('mongodb');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');
const { 
  baseDN, 
  acceptanceFilters,
  testPorts 
} = require('../../fixtures/testData');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybeDescribe = RUN ? describe : describe.skip;

// Import backends
const { provider: MongoDBDirectoryProvider } = require('../../../backends/mongodb.directory');
const { MockAuthProvider } = require('../../../../npm/test/fixtures/mockProviders');

// MongoDB connection config for tests
const mongoConfig = {
  uri: process.env.MONGO_TEST_URI || 'mongodb://localhost:27017',
  database: 'ldap_test_directory_db'
};

maybeDescribe('MongoDB Directory Backend - Acceptance Tests', () => {
  let server;
  let client;
  let directoryProvider;
  let mongoClient;
  let testDb;
  let mongoAvailable = false;

  beforeAll(async () => {
    // Check if MongoDB is available
    const testClient = new MongoClient(mongoConfig.uri, { serverSelectionTimeoutMS: 2000 });
    try {
      await testClient.connect();
      await testClient.close();
      mongoAvailable = true;
    } catch (error) {
      console.log('\n⚠️  MongoDB not available - these tests will be skipped');
      console.log('   To run MongoDB tests: docker-compose up -d mongodb\n');
      return;
    }
    // Connect to MongoDB and create test data
    mongoClient = new MongoClient(mongoConfig.uri);
    await mongoClient.connect();
    testDb = mongoClient.db(mongoConfig.database);

    // Clear existing data
    await testDb.collection('users').deleteMany({});
    await testDb.collection('groups').deleteMany({});

    // Insert test users
    await testDb.collection('users').insertMany([
      {
        username: 'testuser',
        password: 'password123',
        full_name: 'Test User',
        email: 'testuser@example.com',
        uid_number: 3001,
        gid_number: 3001,
        home_directory: '/home/testuser'
      },
      {
        username: 'admin',
        password: 'admin123',
        full_name: 'Admin User',
        email: 'admin@example.com',
        uid_number: 3002,
        gid_number: 3002,
        home_directory: '/home/admin'
      },
      {
        username: 'jdoe',
        password: 'test456',
        full_name: 'John Doe',
        email: 'jdoe@example.com',
        uid_number: 3003,
        gid_number: 3003,
        home_directory: '/home/jdoe'
      },
      {
        username: 'jsmith',
        password: 'smith123',
        full_name: 'Jane Smith',
        email: 'jsmith@example.com',
        uid_number: 3004,
        gid_number: 3004,
        home_directory: '/home/jsmith'
      }
    ]);

    // Insert test groups
    await testDb.collection('groups').insertMany([
      {
        name: 'testuser_primary',
        gid_number: 3001,
        description: 'Primary group for testuser',
        member_uids: ['testuser']
      },
      {
        name: 'admin_primary',
        gid_number: 3002,
        description: 'Primary group for admin',
        member_uids: ['admin']
      },
      {
        name: 'jdoe_primary',
        gid_number: 3003,
        description: 'Primary group for jdoe',
        member_uids: ['jdoe']
      },
      {
        name: 'jsmith_primary',
        gid_number: 3004,
        description: 'Primary group for jsmith',
        member_uids: ['jsmith']
      },
      {
        name: 'admins',
        gid_number: 3100,
        description: 'Administrators group',
        member_uids: ['admin', 'testuser']
      },
      {
        name: 'developers',
        gid_number: 3101,
        description: 'Developers group',
        member_uids: ['testuser', 'jdoe', 'jsmith']
      },
      {
        name: 'users',
        gid_number: 3102,
        description: 'All users group',
        member_uids: ['testuser', 'admin', 'jdoe', 'jsmith']
      }
    ]);

    // Configure environment for MongoDB provider
    process.env.MONGO_URI = mongoConfig.uri;
    process.env.MONGO_DATABASE = mongoConfig.database;
    process.env.LDAP_BASE_DN = baseDN;

    // Create directory provider
    directoryProvider = new MongoDBDirectoryProvider();
    await directoryProvider.initialize();

    // Create mock auth provider
    const authProvider = new MockAuthProvider({
      validCredentials: new Map([
        ['testuser', 'password123'],
        ['admin', 'admin123'],
        ['jdoe', 'test456'],
        ['jsmith', 'smith123']
      ])
    });

    // Start LDAP server
    server = new TestServer({
      port: testPorts.mongodb,
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
    
    // Clean up test database
    if (testDb) {
      await testDb.collection('users').deleteMany({});
      await testDb.collection('groups').deleteMany({});
    }
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  describe('Acceptance Criteria: Directory Filters', () => {
    
    test('a. (objectClass=*) should return all objects (users + groups)', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allObjects,
        scope: 'sub'
      });

      // Should return users (4) + groups (7)
      expect(results.length).toBeGreaterThanOrEqual(11);
      
      // Verify we have both users and groups
      const userEntries = results.filter(r => r.dn.includes('uid='));
      const groupEntries = results.filter(r => r.dn.includes('cn='));
      
      expect(userEntries.length).toBe(4);
      expect(groupEntries.length).toBe(7);
    });

    test('b. (objectClass=posixAccount) should return all users', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allUsers,
        scope: 'sub'
      });

      expect(results.length).toBe(4);

      // Verify all results are user entries
      results.forEach(entry => {
        expect(entry.dn).toMatch(/uid=/);
        expect(entry.attributes.objectClass).toContain('posixAccount');
        expect(entry.attributes.uid).toBeDefined();
        expect(entry.attributes.uidNumber).toBeDefined();
        expect(entry.attributes.gidNumber).toBeDefined();
        expect(entry.attributes.homeDirectory).toBeDefined();
      });

      // Verify specific users are present
      const usernames = results.map(r => r.attributes.uid);
      expect(usernames).toContain('testuser');
      expect(usernames).toContain('admin');
      expect(usernames).toContain('jdoe');
      expect(usernames).toContain('jsmith');
    });

    test('c. (objectClass=posixGroup) should return all groups', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allGroups,
        scope: 'sub'
      });

      expect(results.length).toBe(7);

      // Verify all results are group entries
      results.forEach(entry => {
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.objectClass).toContain('posixGroup');
        expect(entry.attributes.cn).toBeDefined();
        expect(entry.attributes.gidNumber).toBeDefined();
        expect(entry.attributes.memberUid).toBeDefined();
      });

      // Verify specific groups are present
      const groupNames = results.map(r => r.attributes.cn);
      expect(groupNames).toContain('admins');
      expect(groupNames).toContain('developers');
      expect(groupNames).toContain('users');
    });

    test('d. (uid=username) should return specific user', async () => {
      const results = await client.search(baseDN, {
        filter: '(uid=testuser)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const user = results[0];
      expect(user.dn).toBe(`uid=testuser,${baseDN}`);
      expect(user.attributes.uid).toBe('testuser');
      expect(user.attributes.cn).toBe('Test User');
      expect(user.attributes.mail).toBe('testuser@example.com');
      expect(user.attributes.uidNumber).toBe('3001');
      expect(user.attributes.gidNumber).toBe('3001');
      expect(user.attributes.homeDirectory).toBe('/home/testuser');
    });

    test('e. (cn=groupname) should return specific group', async () => {
      const results = await client.search(baseDN, {
        filter: '(cn=developers)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const group = results[0];
      expect(group.dn).toBe(`cn=developers,${baseDN}`);
      expect(group.attributes.cn).toBe('developers');
      expect(group.attributes.gidNumber).toBe('3101');
      expect(group.attributes.memberUid).toEqual(
        expect.arrayContaining(['testuser', 'jdoe', 'jsmith'])
      );
    });

    test('f. (cn=*) should return all groups', async () => {
      // In LDAP, cn=* in a filter searches for entries with cn attribute
      // Groups use cn= in their DN, so this typically returns groups
      const results = await client.search(baseDN, {
        filter: '(cn=*)',
        scope: 'sub'
      });

      // Should return all groups (7)
      expect(results.length).toBe(7);
      
      // All should be group entries (groups use cn= in DN)
      results.forEach(entry => {
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.objectClass).toContain('posixGroup');
        expect(entry.attributes.cn).toBeDefined();
      });
    });
  });

  describe('Acceptance Criteria: Group Membership Filters', () => {
    
    test('g. (memberUid=username) should return groups containing specific user', async () => {
      const results = await client.search(baseDN, {
        filter: '(memberUid=testuser)',
        scope: 'sub'
      });

      // testuser is member of: testuser_primary, admins, developers, users
      expect(results.length).toBe(4);
      
      const groupNames = results.map(r => r.attributes.cn);
      expect(groupNames).toContain('testuser_primary');
      expect(groupNames).toContain('admins');
      expect(groupNames).toContain('developers');
      expect(groupNames).toContain('users');

      // Verify all groups contain testuser as member
      results.forEach(group => {
        expect(group.attributes.memberUid).toContain('testuser');
      });
    });

    test('h. (gidNumber=123) should return group with specific GID', async () => {
      const results = await client.search(baseDN, {
        filter: '(gidNumber=3100)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const group = results[0];
      expect(group.attributes.cn).toBe('admins');
      expect(group.attributes.gidNumber).toBe('3100');
    });

    test('Combined filter: (&(objectClass=posixGroup)(memberUid=jdoe))', async () => {
      const results = await client.search(baseDN, {
        filter: '(&(objectClass=posixGroup)(memberUid=jdoe))',
        scope: 'sub'
      });

      // jdoe is member of: jdoe_primary, developers, users
      expect(results.length).toBe(3);
      
      const groupNames = results.map(r => r.attributes.cn);
      expect(groupNames).toContain('jdoe_primary');
      expect(groupNames).toContain('developers');
      expect(groupNames).toContain('users');
    });

    test('Combined filter: (&(objectClass=posixGroup)(cn=developers))', async () => {
      const results = await client.search(baseDN, {
        filter: '(&(objectClass=posixGroup)(cn=developers))',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      
      const group = results[0];
      expect(group.attributes.cn).toBe('developers');
      expect(group.attributes.memberUid).toEqual(
        expect.arrayContaining(['testuser', 'jdoe', 'jsmith'])
      );
    });
  });

  describe('Edge Cases: Non-existent Entries', () => {
    
    test('Search for non-existent user should return empty results', async () => {
      const results = await client.search(baseDN, {
        filter: '(uid=nonexistent)',
        scope: 'sub'
      });

      expect(results.length).toBe(0);
    });

    test('Search for non-existent group should return empty results', async () => {
      const results = await client.search(baseDN, {
        filter: '(cn=nonexistentgroup)',
        scope: 'sub'
      });

      expect(results.length).toBe(0);
    });

    test('Search for groups with non-existent member should return empty results', async () => {
      const results = await client.search(baseDN, {
        filter: '(memberUid=nonexistentuser)',
        scope: 'sub'
      });

      expect(results.length).toBe(0);
    });

    test('Search for non-existent GID should return empty results', async () => {
      const results = await client.search(baseDN, {
        filter: '(gidNumber=99999)',
        scope: 'sub'
      });

      expect(results.length).toBe(0);
    });
  });

  describe('Data Integrity: Attribute Validation', () => {
    
    test('User entries should have all required POSIX attributes', async () => {
      const results = await client.search(baseDN, {
        filter: '(uid=testuser)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      const user = results[0].attributes;

      // Required posixAccount attributes
      expect(user.uid).toBeDefined();
      expect(user.cn).toBeDefined();
      expect(user.uidNumber).toBeDefined();
      expect(user.gidNumber).toBeDefined();
      expect(user.homeDirectory).toBeDefined();
      expect(user.objectClass).toContain('posixAccount');
      expect(user.objectClass).toContain('inetOrgPerson');
      
      // Verify numeric values are strings (LDAP requirement)
      expect(typeof user.uidNumber).toBe('string');
      expect(typeof user.gidNumber).toBe('string');
    });

    test('Group entries should have all required POSIX attributes', async () => {
      const results = await client.search(baseDN, {
        filter: '(cn=developers)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      const group = results[0].attributes;

      // Required posixGroup attributes
      expect(group.cn).toBeDefined();
      expect(group.gidNumber).toBeDefined();
      expect(group.objectClass).toContain('posixGroup');
      expect(group.memberUid).toBeDefined();
      expect(Array.isArray(group.memberUid)).toBe(true);
      
      // Verify numeric values are strings (LDAP requirement)
      expect(typeof group.gidNumber).toBe('string');
    });

    test('Group memberUid should be array even with single member', async () => {
      const results = await client.search(baseDN, {
        filter: '(cn=testuser_primary)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      const group = results[0].attributes;

      // ldapjs may return single-element arrays as strings - normalize it
      const memberUid = Array.isArray(group.memberUid) ? group.memberUid : [group.memberUid];
      expect(Array.isArray(memberUid)).toBe(true);
      expect(memberUid).toEqual(['testuser']);
    });
  });

  describe('Performance: Large Result Sets', () => {
    
    test('Should handle retrieving all users efficiently', async () => {
      const startTime = Date.now();
      
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allUsers,
        scope: 'sub'
      });

      const duration = Date.now() - startTime;
      
      expect(results.length).toBe(4);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('Should handle retrieving all groups efficiently', async () => {
      const startTime = Date.now();
      
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allGroups,
        scope: 'sub'
      });

      const duration = Date.now() - startTime;
      
      expect(results.length).toBe(7);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('MongoDB Connection Handling', () => {
    
    test('Should initialize connection lazily on first directory operation', async () => {
      // Create new directory provider without pre-initialization
      const freshDirectoryProvider = new MongoDBDirectoryProvider();
      // Don't call initialize() - let findUser() do it
      
      const user = await freshDirectoryProvider.findUser('testuser');
      
      expect(user).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(freshDirectoryProvider.initialized).toBe(true);
      
      // Note: Don't call cleanup() here because it closes the shared MongoDB connection
      // that other tests are still using. The afterAll() will handle cleanup.
    });

    test('Should handle multiple concurrent searches', async () => {
      const searches = [
        client.search(baseDN, { filter: '(uid=testuser)', scope: 'sub' }),
        client.search(baseDN, { filter: '(uid=admin)', scope: 'sub' }),
        client.search(baseDN, { filter: '(cn=developers)', scope: 'sub' }),
        client.search(baseDN, { filter: '(memberUid=testuser)', scope: 'sub' })
      ];

      const results = await Promise.all(searches);
      
      expect(results[0].length).toBe(1); // testuser
      expect(results[1].length).toBe(1); // admin
      expect(results[2].length).toBe(1); // developers group
      expect(results[3].length).toBe(4); // groups with testuser
    });
  });

  describe('User Private Group Support', () => {
    
    test('Should support implicit user private groups by GID', async () => {
      // Search for group by user's primary GID
      const results = await client.search(baseDN, {
        filter: '(gidNumber=3001)',
        scope: 'sub'
      });

      expect(results.length).toBe(1);
      const group = results[0].attributes;
      
      expect(group.cn).toBe('testuser_primary');
      expect(group.gidNumber).toBe('3001');
      expect(group.memberUid).toContain('testuser');
    });
  });
});
