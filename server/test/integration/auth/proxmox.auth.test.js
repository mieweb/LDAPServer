/**
 * Integration Tests: Proxmox Auth Backend
 * 
 * Tests acceptance criteria for Proxmox authentication provider:
 * 1. Bind with valid credentials → success
 * 2. Bind with invalid credentials → fail
 * 3. Bind with non-existent user → fail
 */

const fs = require('fs');
const path = require('path');
const unixcrypt = require('unixcrypt');
const TestServer = require('../../utils/testServer');
const LdapTestClient = require('../../utils/ldapClient');
const mockLogger = require('../../utils/mockLogger');

// Test data and config
const baseDN = 'dc=example,dc=com';
const testPorts = { ldap: 1389 };

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

  // Test credentials - includes disabled and expired users
  const validUsers = {
    testuser: 'password123',
    admin: 'admin123',
    jdoe: 'test456',
    disabled: 'disabled123',
    expired: 'expired123'
  };

  beforeAll(async () => {
    // Create temporary shadow.cfg file with hashed passwords (including disabled/expired)
    const shadowContent = Object.entries(validUsers)
      .map(([username, password]) => {
        // Create Unix crypt hash for each password
        const hash = unixcrypt.encrypt(password);
        return `${username}:${hash}`;
      })
      .join('\n') + '\n';

    tempShadowPath = path.join(__dirname, 'test-proxmox-shadow.cfg');
    fs.writeFileSync(tempShadowPath, shadowContent, 'utf8');

    // Create temporary user.cfg file for directory provider
    // Format: user:username@realm:enabled:expire:firstName:lastName:email:::
    // expired user has timestamp 1609459200 (Jan 1, 2021 - already passed)
    const userCfgContent = `user:testuser@pve:1:0:Test:User:testuser@example.com:::
user:admin@pve:1:0:Admin:User:admin@example.com:::
user:jdoe@pve:1:0:John:Doe:jdoe@example.com:::
user:disabled@pve:0:0:Disabled:User:disabled@example.com:::
user:expired@pve:1:1609459200:Expired:User:expired@example.com:::

group:admins:admin@pve::
group:users:testuser@pve,jdoe@pve::
`;

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

  describe('Additional Proxmox Auth Tests', () => {
    
    test('should authenticate multiple valid and enabled users', async () => {
      // Test only enabled, non-expired users
      const enabledUsers = ['testuser', 'admin', 'jdoe'];
      
      for (const username of enabledUsers) {
        const password = validUsers[username];
        const userDN = `uid=${username},${baseDN}`;
        
        await expect(
          client.bind(userDN, password)
        ).resolves.not.toThrow();
        
        expect(client.bound).toBe(true);
      }
    });

    test('should reject disabled user even with correct password', async () => {
      const username = 'disabled';
      const password = validUsers[username];
      const userDN = `uid=${username},${baseDN}`;

      // Should fail because user is disabled (enabled=0 in user.cfg)
      await expect(
        client.bind(userDN, password)
      ).rejects.toThrow();

      expect(client.bound).toBe(false);
    });

    test('should reject expired user even with correct password', async () => {
      const username = 'expired';
      const password = validUsers[username];
      const userDN = `uid=${username},${baseDN}`;

      // Should fail because user account has expired (expire=1609459200, Jan 1, 2021)
      await expect(
        client.bind(userDN, password)
      ).rejects.toThrow();

      expect(client.bound).toBe(false);
    });

    test('should fail with empty password', async () => {
      const username = 'testuser';
      const emptyPassword = '';
      const userDN = `uid=${username},${baseDN}`;

      await expect(
        client.bind(userDN, emptyPassword)
      ).rejects.toThrow();

      expect(client.bound).toBe(false);
    });

    test('should handle case-sensitive usernames', async () => {
      const username = 'TESTUSER'; // Wrong case
      const password = validUsers['testuser'];
      const userDN = `uid=${username},${baseDN}`;

      // Proxmox is case-sensitive for usernames
      await expect(
        client.bind(userDN, password)
      ).rejects.toThrow();

      expect(client.bound).toBe(false);
    });

    test('should fail with special characters in password that don\'t match', async () => {
      const username = 'testuser';
      const wrongPassword = 'password123!@#'; // Added special chars
      const userDN = `uid=${username},${baseDN}`;

      await expect(
        client.bind(userDN, wrongPassword)
      ).rejects.toThrow();

      expect(client.bound).toBe(false);
    });
  });
});
