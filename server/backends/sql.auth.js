const { AuthProvider } = require('@ldap-gateway/core');
const SqlDriverFactory = require('../db/drivers/sqlDriverFactory');
const logger = require('../utils/logger');

/**
 * Generic SQL Authentication Provider
 * Handles user authentication against SQL databases (MySQL, PostgreSQL, SQLite)
 */
class SQLAuthProvider extends AuthProvider {
  constructor() {
    super();
    
    // Get configuration from environment
    this.config = SqlDriverFactory.getConfigFromEnv();
    
    // Create appropriate driver
    this.driver = SqlDriverFactory.createDriver(this.config.driver, this.config);
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      logger.info(`[SQLAuthProvider] Initializing ${this.config.driver.toUpperCase()} connection...`);
      await this.driver.connect(this.config);
      this.initialized = true;
      logger.info(`[SQLAuthProvider] Connected to ${this.config.driver.toUpperCase()}: ${this.config.host || this.config.filename}/${this.config.database || ''}`);
    }
  }

  async authenticate(username, password) {
    try {
      await this.initialize();
      
      logger.debug(`[SQLAuthProvider] Authenticating user: ${username}`);
      const user = await this.driver.findUserByUsername(username);

      if (!user) {
        logger.debug(`[SQLAuthProvider] User not found: ${username}`);
        return false;
      }

      // TODO: Implement proper password hashing (bcrypt, etc.)
      // For now, using plain text comparison (NOT for production)
      const isValid = user.password === password;
      
      logger.debug(`[SQLAuthProvider] Authentication result for ${username}: ${isValid}`);
      return isValid;
      
    } catch (error) {
      logger.error(`[SQLAuthProvider] Authentication error for ${username}:`, error);
      return false;
    }
  }

  async cleanup() {
    if (this.initialized) {
      logger.info(`[SQLAuthProvider] Cleaning up ${this.config.driver.toUpperCase()} connection...`);
      await this.driver.close();
      this.initialized = false;
      logger.info(`[SQLAuthProvider] ${this.config.driver.toUpperCase()} connection closed`);
    }
  }
}

module.exports = {
  name: 'sql',
  type: 'auth',
  provider: SQLAuthProvider,
};
