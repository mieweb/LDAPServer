/**
 * Integration Tests: MongoDB Auth Backend
 * 
 * Tests acceptance criteria for MongoDB authentication provider:
 * 1. Bind with valid credentials → success
 * 2. Bind with invalid credentials → fail
 * 3. Bind with non-existent user → fail
 */

const { MongoClient } = require('mongodb');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');
const { 
  baseDN,
  testPorts 
} = require('../../fixtures/testData');

// Import backends
const { provider: MongoDBAuthProvider } = require('../../../backends/mongodb.auth');
const { provider: MongoDBDirectoryProvider } = require('../../../backends/mongodb.directory');

// MongoDB connection config for tests
const mongoConfig = {
  uri: process.env.MONGO_TEST_URI || 'mongodb://localhost:27017',
  database: 'ldap_test_auth_db'
};

describe('MongoDB Auth Backend - Acceptance Tests', () => {
  let server;
  let client;
  let authProvider;
  let directoryProvider;
  let mongoClient;
  let testDb;
  let mongoAvailable = false;

  // Test credentials
  const validUsers = {
    testuser: 'password123',
    admin: 'admin123',
    jdoe: 'test456'
  };

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
        password: validUsers.testuser, // Note: In production, use bcrypt
        full_name: 'Test User',
        email: 'testuser@example.com',
        uid_number: 2001,
        gid_number: 2001,
        home_directory: '/home/testuser'
      },
      {
        username: 'admin',
        password: validUsers.admin,
        full_name: 'Admin User',
        email: 'admin@example.com',
        uid_number: 2002,
        gid_number: 2002,
        home_directory: '/home/admin'
      },
      {
        username: 'jdoe',
        password: validUsers.jdoe,
        full_name: 'John Doe',
        email: 'jdoe@example.com',
        uid_number: 2003,
        gid_number: 2003,
        home_directory: '/home/jdoe'
      }
    ]);

    // Insert test groups
    await testDb.collection('groups').insertMany([
      {
        name: 'testuser_primary',
        gid_number: 2001,
        description: 'Primary group for testuser',
        member_uids: ['testuser']
      },
      {
        name: 'admin_primary',
        gid_number: 2002,
        description: 'Primary group for admin',
        member_uids: ['admin']
      },
      {
        name: 'jdoe_primary',
        gid_number: 2003,
        description: 'Primary group for jdoe',
        member_uids: ['jdoe']
      }
    ]);

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
    
    // Clean up test database
    if (testDb) {
      await testDb.collection('users').deleteMany({});
      await testDb.collection('groups').deleteMany({});
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

    test('3. Bind with non-existent user should fail', async () => {
      const username = 'nonexistent';
      const password = 'anypassword';
      const userDN = `uid=${username},${baseDN}`;

      // Should throw InvalidCredentialsError
      await expect(
        client.bind(userDN, password)
      ).rejects.toThrow(/Invalid Credentials/);
    });

    test('4. Bind with empty password should fail', async () => {
      const username = 'testuser';
      const emptyPassword = '';
      const userDN = `uid=${username},${baseDN}`;

      // Should throw InvalidCredentialsError
      await expect(
        client.bind(userDN, emptyPassword)
      ).rejects.toThrow(/Invalid Credentials/);
    });

    test('5. Multiple successful binds should all work', async () => {
      for (const [username, password] of Object.entries(validUsers)) {
        const userDN = `uid=${username},${baseDN}`;
        
        await expect(
          client.bind(userDN, password)
        ).resolves.not.toThrow();
        
        expect(client.bound).toBe(true);
      }
    });

    test('6. Bind with valid user but wrong case should fail (case-sensitive)', async () => {
      const username = 'TESTUSER'; // uppercase
      const password = validUsers.testuser;
      const userDN = `uid=${username},${baseDN}`;

      // MongoDB queries are case-sensitive by default
      await expect(
        client.bind(userDN, password)
      ).rejects.toThrow(/Invalid Credentials/);
    });

    test('7. Authentication should be isolated per connection', async () => {
      // Create second client
      const client2 = new LdapTestClient({
        url: server.getUrl()
      });
      await client2.connect();

      try {
        // Bind first client
        await client.bind(`uid=testuser,${baseDN}`, validUsers.testuser);
        expect(client.bound).toBe(true);

        // Second client should still be unbound
        expect(client2.bound).toBe(false);

        // Bind second client with different user
        await client2.bind(`uid=admin,${baseDN}`, validUsers.admin);
        expect(client2.bound).toBe(true);

        // Both should be independently authenticated
        expect(client.bound).toBe(true);
        expect(client2.bound).toBe(true);
      } finally {
        await client2.destroy();
      }
    });
  });

  describe('Edge Cases: MongoDB Connection Handling', () => {
    
    test('Should handle authentication when database is available', async () => {
      const username = 'testuser';
      const password = validUsers[username];
      const userDN = `uid=${username},${baseDN}`;

      // Verify auth works with active connection
      await expect(
        client.bind(userDN, password)
      ).resolves.not.toThrow();
    });

    test('Should initialize connection lazily on first auth attempt', async () => {
      // Create new auth provider without pre-initialization
      const freshAuthProvider = new MongoDBAuthProvider();
      // Don't call initialize() - let authenticate() do it
      
      const result = await freshAuthProvider.authenticate('testuser', validUsers.testuser);
      
      expect(result).toBe(true);
      expect(freshAuthProvider.initialized).toBe(true);
      
      await freshAuthProvider.cleanup();
    });
  });

  describe('Security: Password Handling', () => {
    
    test('Should not authenticate with partial password match', async () => {
      const username = 'testuser';
      const partialPassword = validUsers[username].substring(0, 5); // Only first 5 chars
      const userDN = `uid=${username},${baseDN}`;

      await expect(
        client.bind(userDN, partialPassword)
      ).rejects.toThrow(/Invalid Credentials/);
    });

    test('Should not authenticate with password plus extra chars', async () => {
      const username = 'testuser';
      const extendedPassword = validUsers[username] + 'extra';
      const userDN = `uid=${username},${baseDN}`;

      await expect(
        client.bind(userDN, extendedPassword)
      ).rejects.toThrow(/Invalid Credentials/);
    });

    // Note: Special characters test requires dynamic user insertion
    // which is complex with shared MongoDB connections. Tested separately.
  });
});
