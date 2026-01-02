// Integration Tests: Proxmox Auth Backend
// 
// Tests acceptance criteria for Proxmox authentication provider:
// 1. Bind with valid credentials → success
// 2. Bind with invalid credentials → fail
// 3. Bind with non-existent user → fail

const fs = require('fs');
const path = require('path');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');
const { loadProxmoxShadowData, loadProxmoxUserData } = require('../../utils/dataLoader');
const { baseDN, testPorts } = require('../../fixtures/testData');

// Import backends
const { provider: ProxmoxAuthProvider } = require('../../../backends/proxmox.auth');
const { provider: ProxmoxDirectoryProvider } = require('../../../backends/proxmox.directory');

describe('Proxmox Auth Backend - Acceptance Tests', () => {
  let server;
  let client;
  let authProvider;
  let directoryProvider;
  let tempShadowPath;
  let tempUserCfgPath;

  // Proxmox-specific test users (from centralized Proxmox data files)
  const validUsers = {
    alice: 'alicepass',
    bob: 'bobpass',
    carol: 'carolpass'
  };

  beforeAll(async () => {
    // Use centralized Proxmox test data
    const shadowContent = loadProxmoxShadowData();
    const userCfgContent = loadProxmoxUserData();

    tempShadowPath = path.join(__dirname, 'test-proxmox-shadow.cfg');
    fs.writeFileSync(tempShadowPath, shadowContent, 'utf8');

    tempUserCfgPath = path.join(__dirname, 'test-proxmox-user.cfg');
    fs.writeFileSync(tempUserCfgPath, userCfgContent, 'utf8');

    // Configure environment for Proxmox providers
    process.env.PROXMOX_SHADOW_CFG = tempShadowPath;
    process.env.PROXMOX_USER_CFG = tempUserCfgPath;
    process.env.LDAP_BASE_DN = baseDN;

    // Create directory provider first
    directoryProvider = new ProxmoxDirectoryProvider();
    await directoryProvider.initialize();

    // Create auth provider with directory provider for enabled/expire checks
    authProvider = new ProxmoxAuthProvider(directoryProvider);
    await authProvider.initialize();

    // Start LDAP server
    server = new TestServer({
      port: testPorts.proxmoxAuth,
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
    
    // Clean up test files
    if (tempShadowPath && fs.existsSync(tempShadowPath)) {
      fs.unlinkSync(tempShadowPath);
    }
    if (tempUserCfgPath && fs.existsSync(tempUserCfgPath)) {
      fs.unlinkSync(tempUserCfgPath);
    }
  });

  describe('Acceptance Criteria: Authentication', () => {
    
    test('1. Bind with valid credentials should succeed', async () => {
      const username = 'alice';
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
      const username = 'alice';
      const wrongPassword = 'wrongpassword';
      const userDN = `uid=${username},${baseDN}`;

      // Should throw InvalidCredentialsError
      await expect(
        client.bind(userDN, wrongPassword)
      ).rejects.toThrow(/Invalid credentials/i);

      // Verify bind failed
      expect(client.bound).toBe(false);
    });

    test('3. Bind with non-existent user should fail', async () => {
      const username = 'nonexistent';
      const password = 'anypassword';
      const userDN = `uid=${username},${baseDN}`;

      // Should throw error (user not found results in auth failure)
      await expect(
        client.bind(userDN, password)
      ).rejects.toThrow();

      // Verify bind failed
      expect(client.bound).toBe(false);
    });
  });
});
