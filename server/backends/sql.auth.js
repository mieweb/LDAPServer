const { AuthProvider } = require('@ldap-gateway/core');
const logger = require('../utils/logger');
const { Sequelize } = require('sequelize');

/**
 * SQL Authentication Provider
 * Handles user authentication against SQL database
 */
class SQLAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.sequelize = new Sequelize(
      process.env.SQL_URI,
      { logging: msg => logger.debug(msg) }
    );
  }

  // constructor handles initialization
  async initialize() { return; }

  async authenticate(username, password) {
    try {
      logger.debug(`[SQLAuthProvider] Authenticating user: ${username}`);
      const [results, _] = await this.sequelize.query(
        process.env.SQL_QUERY_ONE_USER,
        { replacements: [username] }
      );

      if (results.length === 0) {
        logger.debug(`[SQLAuthProvider] User not found: ${username}`);
        return false;
      }
      const user = results[0];

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
    logger.info('[SQLAuthProvider] Cleaning up SQL connection...');
    await this.sequelize.close();
    logger.info('[SQLAuthProvider] SQL connection closed');
  }
}

module.exports = {
  name: 'sql',
  type: 'auth',
  provider: SQLAuthProvider,
};