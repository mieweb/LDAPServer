const logger = require('../../utils/logger');

/**
 * SQL Driver Factory
 * Creates the appropriate SQL driver based on configuration
 */
class SqlDriverFactory {
  /**
   * Create a SQL driver instance
   * @param {string} driverType - Type of driver (mysql, postgresql, sqlite)
   * @param {Object} config - Database configuration
   * @returns {Object} SQL driver instance
   */
  static createDriver(driverType, config = {}) {
    const type = (driverType || 'mysql').toLowerCase();
    
    logger.info(`[SqlDriverFactory] Creating SQL driver: ${type}`);

    switch (type) {
      case 'mysql':
      case 'mariadb':
        const MySQLDriver = require('./mysql');
        return new MySQLDriver();
        
      case 'postgresql':
      case 'postgres':
      case 'pg':
        const PostgreSQLDriver = require('./postgresqlDriver');
        return new PostgreSQLDriver();
        
      case 'sqlite':
      case 'sqlite3':
        const SQLiteDriver = require('./sqliteDriver');
        return new SQLiteDriver();
        
      default:
        throw new Error(`Unsupported SQL driver type: ${type}. Supported types: mysql, postgresql, sqlite`);
    }
  }

  /**
   * Get configuration from environment variables
   * Supports both legacy MYSQL_* and new SQL_* variables
   * @returns {Object} Database configuration
   */
  static getConfigFromEnv() {
    // Get driver type (default to mysql for backward compatibility)
    const driver = process.env.SQL_DRIVER || 'mysql';

    // Build config with backward compatibility
    const config = {
      driver,
      host: process.env.SQL_HOST || process.env.MYSQL_HOST || 'localhost',
      port: process.env.SQL_PORT || process.env.MYSQL_PORT || this.getDefaultPort(driver),
      user: process.env.SQL_USER || process.env.MYSQL_USER || 'root',
      password: process.env.SQL_PASSWORD || process.env.MYSQL_PASSWORD || '',
      database: process.env.SQL_DATABASE || process.env.MYSQL_DATABASE || 'ldap_user_db',
    };

    // SQLite-specific: use file path instead of host/port
    if (driver === 'sqlite' || driver === 'sqlite3') {
      config.filename = process.env.SQL_DATABASE || process.env.SQL_FILENAME || './ldap_user_db.sqlite';
      delete config.host;
      delete config.port;
      delete config.user;
      delete config.password;
    }

    // Custom query overrides
    config.queries = {
      findUserByUsername: process.env.SQL_QUERY_FIND_USER,
      findGroupsByMemberUid: process.env.SQL_QUERY_FIND_GROUPS_BY_MEMBER,
      getAllUsers: process.env.SQL_QUERY_GET_ALL_USERS,
      getAllGroups: process.env.SQL_QUERY_GET_ALL_GROUPS,
    };

    return config;
  }

  /**
   * Get default port for a driver type
   * @param {string} driver - Driver type
   * @returns {number} Default port number
   */
  static getDefaultPort(driver) {
    switch (driver.toLowerCase()) {
      case 'mysql':
      case 'mariadb':
        return 3306;
      case 'postgresql':
      case 'postgres':
      case 'pg':
        return 5432;
      default:
        return null;
    }
  }

  /**
   * List supported drivers
   * @returns {Array<string>} List of supported driver names
   */
  static getSupportedDrivers() {
    return ['mysql', 'mariadb', 'postgresql', 'postgres', 'pg', 'sqlite', 'sqlite3'];
  }
}

module.exports = SqlDriverFactory;
