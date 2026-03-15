// Unit Tests for ConfigurationLoader Realm Config
// Tests _loadRealmConfig and _validateRealmConfig

const path = require('path');
const fs = require('fs');
const os = require('os');

// We need to require ConfigurationLoader after setting up env
let ConfigurationLoader;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Mock logger module
jest.mock('../../utils/logger', () => mockLogger);

// Mock dotenv to prevent loading actual .env files
jest.mock('dotenv', () => ({ config: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  // Reset module cache so each test gets fresh ConfigurationLoader
  jest.resetModules();
  ConfigurationLoader = require('../../config/configurationLoader');
});

describe('ConfigurationLoader._loadRealmConfig', () => {
  test('should return null when REALM_CONFIG is not set', () => {
    delete process.env.REALM_CONFIG;
    const loader = new ConfigurationLoader();
    const result = loader._loadRealmConfig();
    expect(result).toBeNull();
  });

  test('should parse inline JSON array', () => {
    const realms = [
      {
        name: 'test-realm',
        baseDn: 'dc=test,dc=com',
        directory: { backend: 'sql' },
        auth: { backends: [{ type: 'sql' }] }
      }
    ];
    process.env.REALM_CONFIG = JSON.stringify(realms);
    const loader = new ConfigurationLoader();
    const result = loader._loadRealmConfig();
    expect(result).toEqual(realms);
    delete process.env.REALM_CONFIG;
  });

  test('should load from file path', () => {
    const realms = [
      {
        name: 'file-realm',
        baseDn: 'dc=file,dc=com',
        directory: { backend: 'sql' },
        auth: { backends: [{ type: 'sql' }] }
      }
    ];
    const tmpFile = path.join(os.tmpdir(), `realm-config-test-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify(realms));
    
    try {
      process.env.REALM_CONFIG = tmpFile;
      const loader = new ConfigurationLoader();
      const result = loader._loadRealmConfig();
      expect(result).toEqual(realms);
    } finally {
      fs.unlinkSync(tmpFile);
      delete process.env.REALM_CONFIG;
    }
  });

  test('should throw on invalid JSON string', () => {
    process.env.REALM_CONFIG = '[{invalid json}]';
    const loader = new ConfigurationLoader();
    expect(() => loader._loadRealmConfig()).toThrow('Invalid REALM_CONFIG JSON');
    delete process.env.REALM_CONFIG;
  });

  test('should throw on non-existent file path', () => {
    process.env.REALM_CONFIG = '/nonexistent/path/realms.json';
    const loader = new ConfigurationLoader();
    expect(() => loader._loadRealmConfig()).toThrow('Failed to load REALM_CONFIG');
    delete process.env.REALM_CONFIG;
  });
});

describe('ConfigurationLoader._validateRealmConfig', () => {
  let loader;

  beforeEach(() => {
    loader = new ConfigurationLoader();
  });

  test('should accept valid realm config', () => {
    const realms = [
      {
        name: 'valid-realm',
        baseDn: 'dc=valid,dc=com',
        directory: { backend: 'sql' },
        auth: { backends: [{ type: 'sql' }] }
      }
    ];
    expect(() => loader._validateRealmConfig(realms)).not.toThrow();
  });

  test('should reject non-array', () => {
    expect(() => loader._validateRealmConfig({})).toThrow('must be a JSON array');
  });

  test('should reject empty array', () => {
    expect(() => loader._validateRealmConfig([])).toThrow('at least one realm');
  });

  test('should reject missing name', () => {
    expect(() => loader._validateRealmConfig([{
      baseDn: 'dc=test,dc=com',
      directory: { backend: 'sql' },
      auth: { backends: [{ type: 'sql' }] }
    }])).toThrow("'name' is required");
  });

  test('should reject duplicate realm names', () => {
    expect(() => loader._validateRealmConfig([
      { name: 'dup', baseDn: 'dc=a,dc=com', directory: { backend: 'sql' }, auth: { backends: [{ type: 'sql' }] } },
      { name: 'dup', baseDn: 'dc=b,dc=com', directory: { backend: 'sql' }, auth: { backends: [{ type: 'sql' }] } }
    ])).toThrow("duplicate realm name 'dup'");
  });

  test('should reject missing baseDn', () => {
    expect(() => loader._validateRealmConfig([{
      name: 'test',
      directory: { backend: 'sql' },
      auth: { backends: [{ type: 'sql' }] }
    }])).toThrow("'baseDn' is required");
  });

  test('should reject missing directory', () => {
    expect(() => loader._validateRealmConfig([{
      name: 'test',
      baseDn: 'dc=test,dc=com',
      auth: { backends: [{ type: 'sql' }] }
    }])).toThrow("'directory' is required");
  });

  test('should reject missing directory.backend', () => {
    expect(() => loader._validateRealmConfig([{
      name: 'test',
      baseDn: 'dc=test,dc=com',
      directory: {},
      auth: { backends: [{ type: 'sql' }] }
    }])).toThrow("'directory.backend' is required");
  });

  test('should reject missing auth', () => {
    expect(() => loader._validateRealmConfig([{
      name: 'test',
      baseDn: 'dc=test,dc=com',
      directory: { backend: 'sql' }
    }])).toThrow("'auth' is required");
  });

  test('should reject empty auth.backends', () => {
    expect(() => loader._validateRealmConfig([{
      name: 'test',
      baseDn: 'dc=test,dc=com',
      directory: { backend: 'sql' },
      auth: { backends: [] }
    }])).toThrow("'auth.backends' must be a non-empty array");
  });

  test('should reject auth backend without type', () => {
    expect(() => loader._validateRealmConfig([{
      name: 'test',
      baseDn: 'dc=test,dc=com',
      directory: { backend: 'sql' },
      auth: { backends: [{}] }
    }])).toThrow("'auth.backends[0].type' is required");
  });

  test('should accept multiple valid realms with shared baseDN', () => {
    const realms = [
      { name: 'realm-a', baseDn: 'dc=shared,dc=com', directory: { backend: 'sql' }, auth: { backends: [{ type: 'sql' }] } },
      { name: 'realm-b', baseDn: 'dc=shared,dc=com', directory: { backend: 'mongodb' }, auth: { backends: [{ type: 'mongodb' }] } }
    ];
    expect(() => loader._validateRealmConfig(realms)).not.toThrow();
  });
});
