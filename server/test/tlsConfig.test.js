/**
 * TLS Configuration Tests
 * 
 * Tests for TLS version and cipher configuration parsing
 */

const assert = require('assert');

// Mock logger to capture warnings
const mockLogger = {
  warnings: [],
  info: () => {},
  warn: (msg) => { mockLogger.warnings.push(msg); },
  error: () => {},
  debug: () => {},
  clear: () => { mockLogger.warnings = []; }
};

// Store original env and logger
const originalEnv = { ...process.env };

// Helper to reset environment
function resetEnv() {
  // Clear TLS-related env vars
  delete process.env.TLS_MIN_VERSION;
  delete process.env.TLS_MAX_VERSION;
  delete process.env.TLS_CIPHERS;
  mockLogger.clear();
}

// Create a minimal ConfigurationLoader for testing
function createTestableLoader() {
  // We need to replace the logger in the configurationLoader module
  const configPath = require.resolve('../config/configurationLoader');
  delete require.cache[configPath];
  
  // Mock the logger module
  const loggerPath = require.resolve('../utils/logger');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: mockLogger
  };
  
  const ConfigurationLoader = require('../config/configurationLoader');
  return new ConfigurationLoader();
}

// Test TLS min version parsing
function testTlsMinVersionParsing() {
  console.log('Testing TLS min version parsing...');
  
  // Test valid TLSv1.2
  resetEnv();
  process.env.TLS_MIN_VERSION = 'TLSv1.2';
  let loader = createTestableLoader();
  let result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMinVersion, 'TLSv1.2', 'Should parse TLSv1.2');
  
  // Test valid TLSv1.3
  resetEnv();
  process.env.TLS_MIN_VERSION = 'TLSv1.3';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMinVersion, 'TLSv1.3', 'Should parse TLSv1.3');
  
  // Test invalid version
  resetEnv();
  process.env.TLS_MIN_VERSION = 'TLSv1.0';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMinVersion, null, 'Should reject invalid TLS version');
  assert(mockLogger.warnings.some(w => w.includes('Invalid TLS_MIN_VERSION')), 'Should log warning for invalid version');
  
  // Test empty value
  resetEnv();
  process.env.TLS_MIN_VERSION = '';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMinVersion, null, 'Should handle empty value');
  
  console.log('✓ TLS min version parsing tests passed');
}

// Test TLS max version parsing
function testTlsMaxVersionParsing() {
  console.log('Testing TLS max version parsing...');
  
  // Test valid TLSv1.2
  resetEnv();
  process.env.TLS_MAX_VERSION = 'TLSv1.2';
  let loader = createTestableLoader();
  let result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMaxVersion, 'TLSv1.2', 'Should parse TLSv1.2');
  
  // Test valid TLSv1.3
  resetEnv();
  process.env.TLS_MAX_VERSION = 'TLSv1.3';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMaxVersion, 'TLSv1.3', 'Should parse TLSv1.3');
  
  // Test invalid version
  resetEnv();
  process.env.TLS_MAX_VERSION = 'SSLv3';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMaxVersion, null, 'Should reject invalid TLS version');
  assert(mockLogger.warnings.some(w => w.includes('Invalid TLS_MAX_VERSION')), 'Should log warning for invalid version');
  
  console.log('✓ TLS max version parsing tests passed');
}

// Test version order validation
function testVersionOrderValidation() {
  console.log('Testing TLS version order validation...');
  
  // Test valid order (min < max)
  resetEnv();
  process.env.TLS_MIN_VERSION = 'TLSv1.2';
  process.env.TLS_MAX_VERSION = 'TLSv1.3';
  let loader = createTestableLoader();
  let result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMinVersion, 'TLSv1.2', 'Should allow min < max');
  assert.strictEqual(result.tlsMaxVersion, 'TLSv1.3', 'Should allow min < max');
  
  // Test same version (valid)
  resetEnv();
  process.env.TLS_MIN_VERSION = 'TLSv1.3';
  process.env.TLS_MAX_VERSION = 'TLSv1.3';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMinVersion, 'TLSv1.3', 'Should allow same version');
  assert.strictEqual(result.tlsMaxVersion, 'TLSv1.3', 'Should allow same version');
  
  // Test invalid order (min > max)
  resetEnv();
  process.env.TLS_MIN_VERSION = 'TLSv1.3';
  process.env.TLS_MAX_VERSION = 'TLSv1.2';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsMinVersion, null, 'Should reject min > max');
  assert.strictEqual(result.tlsMaxVersion, null, 'Should reject min > max');
  assert(mockLogger.warnings.some(w => w.includes('greater than')), 'Should log warning for invalid order');
  
  console.log('✓ TLS version order validation tests passed');
}

// Test cipher parsing
function testCipherParsing() {
  console.log('Testing TLS cipher parsing...');
  
  // Test valid cipher string
  resetEnv();
  process.env.TLS_CIPHERS = 'TLS_AES_256_GCM_SHA384:ECDHE-RSA-AES256-GCM-SHA384';
  let loader = createTestableLoader();
  let result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsCiphers, 'TLS_AES_256_GCM_SHA384:ECDHE-RSA-AES256-GCM-SHA384', 'Should parse valid cipher string');
  
  // Test valid cipher expression (HIGH)
  resetEnv();
  process.env.TLS_CIPHERS = 'HIGH';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsCiphers, 'HIGH', 'Should accept valid cipher expression');
  
  // Test invalid cipher string
  resetEnv();
  process.env.TLS_CIPHERS = 'random_invalid_string';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsCiphers, null, 'Should reject invalid cipher string');
  assert(mockLogger.warnings.some(w => w.includes('Invalid TLS_CIPHERS') && w.includes('no cipher match')), 
    'Should log warning with cipher error');
  
  // Test empty cipher string
  resetEnv();
  process.env.TLS_CIPHERS = '';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsCiphers, null, 'Should handle empty cipher string');
  
  // Test whitespace-only string
  resetEnv();
  process.env.TLS_CIPHERS = '   ';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsCiphers, null, 'Should handle whitespace-only cipher string');
  
  // Test cipher with whitespace trimming
  resetEnv();
  process.env.TLS_CIPHERS = '  TLS_AES_256_GCM_SHA384  ';
  loader = createTestableLoader();
  result = loader._loadTlsConfig();
  assert.strictEqual(result.tlsCiphers, 'TLS_AES_256_GCM_SHA384', 'Should trim whitespace from cipher string');
  
  console.log('✓ TLS cipher parsing tests passed');
}

// Test no TLS config (defaults)
function testNoTlsConfig() {
  console.log('Testing no TLS config (defaults)...');
  
  resetEnv();
  const loader = createTestableLoader();
  const result = loader._loadTlsConfig();
  
  assert.strictEqual(result.tlsMinVersion, null, 'Should return null for unset min version');
  assert.strictEqual(result.tlsMaxVersion, null, 'Should return null for unset max version');
  assert.strictEqual(result.tlsCiphers, null, 'Should return null for unset ciphers');
  
  console.log('✓ No TLS config tests passed');
}

// Test cipher string validation helper
function testCipherValidation() {
  console.log('Testing cipher validation helper...');
  
  resetEnv();
  const loader = createTestableLoader();
  
  // Test valid ciphers
  let result = loader._validateCipherString('TLS_AES_256_GCM_SHA384');
  assert.strictEqual(result.valid, true, 'Should validate TLS 1.3 cipher');
  
  result = loader._validateCipherString('ECDHE-RSA-AES256-GCM-SHA384');
  assert.strictEqual(result.valid, true, 'Should validate TLS 1.2 cipher');
  
  result = loader._validateCipherString('HIGH');
  assert.strictEqual(result.valid, true, 'Should validate cipher expression');
  
  result = loader._validateCipherString('TLS_AES_256_GCM_SHA384:ECDHE-RSA-AES256-GCM-SHA384');
  assert.strictEqual(result.valid, true, 'Should validate multiple ciphers');
  
  // Test invalid cipher
  result = loader._validateCipherString('random_invalid_cipher');
  assert.strictEqual(result.valid, false, 'Should reject invalid cipher');
  assert(result.error.includes('no cipher match'), 'Should include error message');
  
  console.log('✓ Cipher validation helper tests passed');
}

// Run all tests
function runTests() {
  console.log('\n=== TLS Configuration Tests ===\n');
  
  try {
    testNoTlsConfig();
    testCipherValidation();
    testTlsMinVersionParsing();
    testTlsMaxVersionParsing();
    testVersionOrderValidation();
    testCipherParsing();
    
    console.log('\n✅ All TLS configuration tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
