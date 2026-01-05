// Integration Tests: MongoDB Directory Backend
// 
// Tests acceptance criteria for MongoDB directory provider:
// a. (objectClass=*) all object filter
// b. (objectClass=posixAccount) all users filter
// c. (objectClass=posixGroup) all group filter
// d. (uid=username) specific user
// e. (cn=groupname) specific group
// f. (cn=*) all groups filter
// g. (memberUid=username) groups containing specific user
// h. (gidNumber=123) groups by GID

const { MongoClient } = require('mongodb');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');
const { MongoDBSeeder } = require('../../utils/dbSeeder');
const { testUsers, testGroups } = require('../../fixtures/testData');
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
    // Connect to MongoDB and seed test data
    mongoClient = new MongoClient(mongoConfig.uri);
    await mongoClient.connect();
    testDb = mongoClient.db(mongoConfig.database);

    // Seed database using centralized test data
    const seeder = new MongoDBSeeder(testDb);
    await seeder.seed();

    // Configure environment for MongoDB provider
    process.env.MONGO_URI = mongoConfig.uri;
    process.env.MONGO_DATABASE = mongoConfig.database;
    process.env.LDAP_BASE_DN = baseDN;

    // Create directory provider
    directoryProvider = new MongoDBDirectoryProvider();
    await directoryProvider.initialize();

    // Create mock auth provider using centralized test data
    const validCredentials = new Map(
      testUsers.map(user => [user.username, user.password])
    );
    
    const authProvider = new MockAuthProvider({
      validCredentials
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

      // Should return users (4) + groups (4)
      expect(results.length).toBeGreaterThanOrEqual(8);
      
      // Verify we have both users and groups
      const userEntries = results.filter(r => r.dn.includes('uid='));
      const groupEntries = results.filter(r => r.dn.includes('cn='));
      
      expect(userEntries.length).toBe(4);
      expect(groupEntries.length).toBe(4);
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
      expect(usernames).toContain('disabled');
    });

    test('c. (objectClass=posixGroup) should return all groups', async () => {
      const results = await client.search(baseDN, {
        filter: acceptanceFilters.allGroups,
        scope: 'sub'
      });

      expect(results.length).toBe(4);

      // Verify all results are group entries
      results.forEach(entry => {
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.objectClass).toContain('posixGroup');
        expect(entry.attributes.cn).toBeDefined();
        expect(entry.attributes.gidNumber).toBeDefined();
        // memberUid may not be present for empty groups (LDAP compliant)
      });

      // Verify specific groups are present
      const groupNames = results.map(r => r.attributes.cn);
      expect(groupNames).toContain('admins');
      expect(groupNames).toContain('developers');
      expect(groupNames).toContain('users');
      expect(groupNames).toContain('empty');
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
      expect(user.attributes.uidNumber).toBe('1001');
      expect(user.attributes.gidNumber).toBe('1001');
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
      expect(group.attributes.gidNumber).toBe('1002');
      expect(group.attributes.memberUid).toEqual(
        expect.arrayContaining(['testuser', 'jdoe'])
      );
    });

    test('f. (cn=*) should return all groups', async () => {
      // In LDAP, cn=* in a filter searches for entries with cn attribute
      // Groups use cn= in their DN, so this typically returns groups
      const results = await client.search(baseDN, {
        filter: '(cn=*)',
        scope: 'sub'
      });

      // Should return all groups (4)
      expect(results.length).toBe(4);
      
      // All should be group entries (groups use cn= in DN)
      results.forEach(entry => {
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.objectClass).toContain('posixGroup');
        expect(entry.attributes.cn).toBeDefined();
      });
    });
  });
});
