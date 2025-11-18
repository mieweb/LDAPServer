/**
 * SQL Driver Factory Tests
 * Tests for SQL driver creation and configuration
 */

const assert = require('assert');
const SqlDriverFactory = require('../db/drivers/sqlDriverFactory');

describe('SQL Driver Factory', function() {
  
  describe('Driver Creation', function() {
    it('should create MySQL driver', function() {
      const driver = SqlDriverFactory.createDriver('mysql');
      assert(driver, 'MySQL driver should be created');
      assert.strictEqual(driver.constructor.name, 'MySQLDriver');
    });

    it('should create PostgreSQL driver', function() {
      const driver = SqlDriverFactory.createDriver('postgresql');
      assert(driver, 'PostgreSQL driver should be created');
      assert.strictEqual(driver.constructor.name, 'PostgreSQLDriver');
    });

    it('should create SQLite driver', function() {
      const driver = SqlDriverFactory.createDriver('sqlite');
      assert(driver, 'SQLite driver should be created');
      assert.strictEqual(driver.constructor.name, 'SQLiteDriver');
    });

    it('should support driver aliases', function() {
      const pgDriver1 = SqlDriverFactory.createDriver('postgres');
      const pgDriver2 = SqlDriverFactory.createDriver('pg');
      const pgDriver3 = SqlDriverFactory.createDriver('postgresql');
      
      assert.strictEqual(pgDriver1.constructor.name, 'PostgreSQLDriver');
      assert.strictEqual(pgDriver2.constructor.name, 'PostgreSQLDriver');
      assert.strictEqual(pgDriver3.constructor.name, 'PostgreSQLDriver');
    });

    it('should throw error for unsupported driver', function() {
      assert.throws(() => {
        SqlDriverFactory.createDriver('mongodb');
      }, /Unsupported SQL driver type/);
    });

    it('should default to mysql when no driver specified', function() {
      const driver = SqlDriverFactory.createDriver();
      assert.strictEqual(driver.constructor.name, 'MySQLDriver');
    });
  });

  describe('Configuration', function() {
    let originalEnv;

    beforeEach(function() {
      // Save original environment
      originalEnv = { ...process.env };
    });

    afterEach(function() {
      // Restore original environment
      process.env = originalEnv;
    });

    it('should get MySQL config from SQL_* variables', function() {
      process.env.SQL_DRIVER = 'mysql';
      process.env.SQL_HOST = 'test-host';
      process.env.SQL_PORT = '3307';
      process.env.SQL_USER = 'test-user';
      process.env.SQL_PASSWORD = 'test-pass';
      process.env.SQL_DATABASE = 'test-db';

      const config = SqlDriverFactory.getConfigFromEnv();
      
      assert.strictEqual(config.driver, 'mysql');
      assert.strictEqual(config.host, 'test-host');
      assert.strictEqual(config.port, '3307');
      assert.strictEqual(config.user, 'test-user');
      assert.strictEqual(config.password, 'test-pass');
      assert.strictEqual(config.database, 'test-db');
    });

    it('should support backward compatibility with MYSQL_* variables', function() {
      process.env.MYSQL_HOST = 'legacy-host';
      process.env.MYSQL_PORT = '3306';
      process.env.MYSQL_USER = 'legacy-user';
      process.env.MYSQL_PASSWORD = 'legacy-pass';
      process.env.MYSQL_DATABASE = 'legacy-db';

      const config = SqlDriverFactory.getConfigFromEnv();
      
      assert.strictEqual(config.host, 'legacy-host');
      assert.strictEqual(config.port, '3306');
      assert.strictEqual(config.user, 'legacy-user');
      assert.strictEqual(config.password, 'legacy-pass');
      assert.strictEqual(config.database, 'legacy-db');
    });

    it('should prefer SQL_* over MYSQL_* variables', function() {
      process.env.SQL_HOST = 'new-host';
      process.env.MYSQL_HOST = 'old-host';
      process.env.SQL_DATABASE = 'new-db';
      process.env.MYSQL_DATABASE = 'old-db';

      const config = SqlDriverFactory.getConfigFromEnv();
      
      assert.strictEqual(config.host, 'new-host');
      assert.strictEqual(config.database, 'new-db');
    });

    it('should configure SQLite with filename', function() {
      process.env.SQL_DRIVER = 'sqlite';
      process.env.SQL_DATABASE = '/path/to/db.sqlite';

      const config = SqlDriverFactory.getConfigFromEnv();
      
      assert.strictEqual(config.driver, 'sqlite');
      assert.strictEqual(config.filename, '/path/to/db.sqlite');
      assert.strictEqual(config.host, undefined);
      assert.strictEqual(config.port, undefined);
    });

    it('should support custom query configuration', function() {
      process.env.SQL_QUERY_FIND_USER = 'SELECT * FROM custom_users WHERE login = ?';
      process.env.SQL_QUERY_GET_ALL_USERS = 'SELECT * FROM custom_users';

      const config = SqlDriverFactory.getConfigFromEnv();
      
      assert.strictEqual(config.queries.findUserByUsername, 'SELECT * FROM custom_users WHERE login = ?');
      assert.strictEqual(config.queries.getAllUsers, 'SELECT * FROM custom_users');
    });

    it('should use default ports for each driver', function() {
      process.env.SQL_DRIVER = 'mysql';
      delete process.env.SQL_PORT;
      delete process.env.MYSQL_PORT;
      
      let config = SqlDriverFactory.getConfigFromEnv();
      assert.strictEqual(config.port, 3306);

      process.env.SQL_DRIVER = 'postgresql';
      config = SqlDriverFactory.getConfigFromEnv();
      assert.strictEqual(config.port, 5432);
    });
  });

  describe('Supported Drivers', function() {
    it('should list all supported drivers', function() {
      const supported = SqlDriverFactory.getSupportedDrivers();
      
      assert(Array.isArray(supported));
      assert(supported.includes('mysql'));
      assert(supported.includes('mariadb'));
      assert(supported.includes('postgresql'));
      assert(supported.includes('postgres'));
      assert(supported.includes('pg'));
      assert(supported.includes('sqlite'));
      assert(supported.includes('sqlite3'));
    });
  });

  describe('Default Port', function() {
    it('should return correct default ports', function() {
      assert.strictEqual(SqlDriverFactory.getDefaultPort('mysql'), 3306);
      assert.strictEqual(SqlDriverFactory.getDefaultPort('mariadb'), 3306);
      assert.strictEqual(SqlDriverFactory.getDefaultPort('postgresql'), 5432);
      assert.strictEqual(SqlDriverFactory.getDefaultPort('postgres'), 5432);
      assert.strictEqual(SqlDriverFactory.getDefaultPort('pg'), 5432);
      assert.strictEqual(SqlDriverFactory.getDefaultPort('sqlite'), null);
    });
  });
});
