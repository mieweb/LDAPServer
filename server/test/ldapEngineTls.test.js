/**
 * LdapEngine TLS Options Tests
 * 
 * Tests that TLS options are properly passed to the LDAP server
 */

const assert = require('assert');

// Test that LdapEngine accepts and stores TLS configuration
function testLdapEngineTlsOptions() {
  console.log('Testing LdapEngine TLS options...');
  
  // Import the LdapEngine from core
  const { LdapEngine } = require('@ldap-gateway/core');
  
  // Create engine with TLS options
  const mockAuthProvider = {
    initialize: () => {},
    authenticate: async () => true
  };
  
  const mockDirectoryProvider = {
    initialize: () => {},
    findUser: async () => null,
    getAllUsers: async () => [],
    findGroups: async () => [],
    getAllGroups: async () => []
  };
  
  const engine = new LdapEngine({
    baseDn: 'dc=test,dc=com',
    port: 10389,
    certificate: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
    key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
    tlsMinVersion: 'TLSv1.2',
    tlsMaxVersion: 'TLSv1.3',
    tlsCiphers: 'ECDHE-RSA-AES256-GCM-SHA384',
    authProviders: [mockAuthProvider],
    directoryProvider: mockDirectoryProvider
  });
  
  // Verify config is stored correctly
  assert.strictEqual(engine.config.tlsMinVersion, 'TLSv1.2', 'TLS min version should be stored');
  assert.strictEqual(engine.config.tlsMaxVersion, 'TLSv1.3', 'TLS max version should be stored');
  assert.strictEqual(engine.config.tlsCiphers, 'ECDHE-RSA-AES256-GCM-SHA384', 'TLS ciphers should be stored');
  
  console.log('✓ LdapEngine TLS options tests passed');
}

// Test that LdapEngine defaults are null when TLS options not provided
function testLdapEngineTlsDefaults() {
  console.log('Testing LdapEngine TLS defaults...');
  
  const { LdapEngine } = require('@ldap-gateway/core');
  
  const mockAuthProvider = {
    initialize: () => {},
    authenticate: async () => true
  };
  
  const mockDirectoryProvider = {
    initialize: () => {},
    findUser: async () => null,
    getAllUsers: async () => [],
    findGroups: async () => [],
    getAllGroups: async () => []
  };
  
  const engine = new LdapEngine({
    baseDn: 'dc=test,dc=com',
    port: 10389,
    authProviders: [mockAuthProvider],
    directoryProvider: mockDirectoryProvider
  });
  
  // Verify defaults are null
  assert.strictEqual(engine.config.tlsMinVersion, null, 'TLS min version should default to null');
  assert.strictEqual(engine.config.tlsMaxVersion, null, 'TLS max version should default to null');
  assert.strictEqual(engine.config.tlsCiphers, null, 'TLS ciphers should default to null');
  
  console.log('✓ LdapEngine TLS defaults tests passed');
}

// Run all tests
function runTests() {
  console.log('\n=== LdapEngine TLS Options Tests ===\n');
  
  try {
    testLdapEngineTlsOptions();
    testLdapEngineTlsDefaults();
    
    console.log('\n✅ All LdapEngine TLS tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
