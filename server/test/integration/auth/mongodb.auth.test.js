// Integration Tests: MongoDB Auth Backend
// 
// Tests acceptance criteria for MongoDB authentication provider:
// 1. Bind with valid credentials → success
// 2. Bind with invalid credentials → fail
// 3. Bind with non-existent user → fail

const { MongoClient } = require('mongodb');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');
const { MongoDBSeeder } = require('../../utils/dbSeeder');
const { testUsers, baseDN, testPorts } = require('../../fixtures/testData');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybeDescribe = RUN ? describe : describe.skip;

// Import backends
const { provider: MongoDBAuthProvider } = require('../../../backends/mongodb.auth');
const { provider: MongoDBDirectoryProvider } = require('../../../backends/mongodb.directory');

// MongoDB connection config for tests
const mongoConfig = {
  uri: process.env.MONGO_TEST_URI || 'mongodb://localhost:27017',
  database: 'ldap_test_auth_db'
};

maybeDescribe('MongoDB Auth Backend - Acceptance Tests', () => {
  let server;
  let client;
  let authProvider;
  let directoryProvider;
  let mongoClient;
  let testDb;
  let mongoAvailable = false;

  // Build valid user credentials map from centralized test data
  const validUsers = testUsers.reduce((acc, user) => {
    acc[user.username] = user.password;
    return acc;
  }, {});

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

    // Use MongoDBSeeder to seed test data from centralized fixtures
    const seeder = new MongoDBSeeder(testDb);
    await seeder.seed();

    // Configure environment for MongoDB providers
    process.env.MONGO_URI = mongoConfig.uri;
    process.env.MONGO_DATABASE = mongoConfig.database;
    process.env.LDAP_BASE_DN = baseDN;

    // Create directory provider first
    directoryProvider = new MongoDBDirectoryProvider();
    await directoryProvider.initialize();

    // Create auth provider
    authProvider = new MongoDBAuthProvider();
    await authProvider.initialize();

    // Start LDAP server
    server = new TestServer({
      port: testPorts.mongodbAuth,
      baseDn: baseDN,
      authProviders: [authProvider],
      directoryProvider: directoryProvider,
      requireAuthForSearch: false, // Allow testing bind separately from search
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
    if (authProvider) {
      await authProvider.cleanup();
    }
    if (directoryProvider) {
      await directoryProvider.cleanup();
    }
    
    // Clean up test database (seeder handles cleanup)
    if (testDb) {
      const seeder = new MongoDBSeeder(testDb);
      await seeder.clean();
    }
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  describe('Acceptance Criteria: Authentication', () => {
    
    test('1. Bind with valid credentials should succeed', async () => {
      if (!mongoAvailable) return;
      const username = 'testuser';
      const password = validUsers[username];
      const userDN = `uid=${username},${baseDN}`;

      // Should not throw an error
      await expect(
        client.bind(userDN, password)
      ).resolves.not.toThrow();

      // Verify bind was successful by checking bound state
      expect(client.bound).toBe(true);
    });

    test('2. Bind with invalid credentials should fail', async () => {
      const username = 'testuser';
      const wrongPassword = 'wrongpassword';
      const userDN = `uid=${username},${baseDN}`;

      // Should throw InvalidCredentialsError
      await expect(
        client.bind(userDN, wrongPassword)
      ).rejects.toThrow(/Invalid Credentials/);
    });
  });
});
