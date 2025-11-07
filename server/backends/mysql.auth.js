const { AuthProvider } = require('@ldap-gateway/core');
const mysqlDriver = require('../db/drivers/mysql');
const logger = require('../utils/logger');

/**
 * MySQL Authentication Provider
 * Handles user authentication against MySQL database
 */
class MySQLAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.config = {
      type: 'mysql',
      host: process.env.MYSQL_HOST || "mysql",
      user: process.env.MYSQL_USER || "root", 
      password: process.env.MYSQL_PASSWORD || "rootpassword",
      database: process.env.MYSQL_DATABASE || "ldap_user_db",
    };
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      logger.info('[MySQLAuthProvider] Initializing MySQL connection...');
      await mysqlDriver.connect(this.config);
      this.initialized = true;
      logger.info(`[MySQLAuthProvider] Connected to MySQL: ${this.config.host}/${this.config.database}`);
    }
  }

  async authenticate(username, password) {
    try {
      await this.initialize();
      
      logger.debug(`[MySQLAuthProvider] Authenticating user: ${username}`);
      const user = await mysqlDriver.findUserByUsername(username);

      if (!user) {
        logger.debug(`[MySQLAuthProvider] User not found: ${username}`);
        return false;
      }

      // TODO: Implement proper password hashing (bcrypt, etc.)
      // For now, using plain text comparison (NOT for production)
      const isValid = user.password === password;
      
      logger.debug(`[MySQLAuthProvider] Authentication result for ${username}: ${isValid}`);
      return isValid;
      
    } catch (error) {
      logger.error(`[MySQLAuthProvider] Authentication error for ${username}:`, error);
      return false;
    }
  }

  async cleanup() {
    if (this.initialized) {
      logger.info('[MySQLAuthProvider] Cleaning up MySQL connection...');
      await mysqlDriver.close();
      this.initialized = false;
      logger.info('[MySQLAuthProvider] MySQL connection closed');
    }
  }
}

module.exports = {
  name: 'mysql',
  type: 'auth',
  provider: MySQLAuthProvider,
};