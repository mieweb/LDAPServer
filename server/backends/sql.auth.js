const { AuthProvider } = require('@ldap-gateway/core');
const logger = require('../utils/logger');
const { Sequelize } = require('sequelize');
const argon2 = require('argon2');
const bcrypt = require('bcrypt');
const unixcrypt = require('unixcrypt');

/**
 * Build Sequelize options with optional SSL configuration
 * Set SQL_SSL=false to disable TLS for testing with local databases
 */
function buildSequelizeOptions() {
  const options = { logging: msg => logger.debug(msg) };
  
  if (process.env.SQL_SSL === 'false') {
    options.dialectOptions = { ssl: false };
  }
  
  return options;
}

/**
 * SQL Authentication Provider
 * Handles user authentication against SQL database
 */
class SQLAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.sequelize = new Sequelize(
      process.env.SQL_URI,
      buildSequelizeOptions()
    );
  }

  // constructor handles initialization
  async initialize() { return; }

  /**
   * Verify password against crypt-style hash
   * Supports: argon2, bcrypt, sha512, sha256, md5, des
   */
  async verifyCryptPassword(password, hash) {
    if (!hash || !hash.startsWith('$')) {
      logger.warn('[SQLAuthProvider] Invalid hash format - must be crypt-style (starting with $)');
      return false;
    }

    const parts = hash.split('$');
    if (parts.length < 3) {
      logger.warn('[SQLAuthProvider] Malformed crypt hash');
      return false;
    }

    const hashType = parts[1];
    logger.debug(`[SQLAuthProvider] Detected hash type: ${hashType}`);

    try {
      // Argon2 format: $argon2i$, $argon2d$, $argon2id$
      if (hashType.startsWith('argon2')) {
        return await argon2.verify(hash, password);
      }

      // Bcrypt format: $2a$, $2b$, $2y$
      if (hashType.startsWith('2')) {
        return await bcrypt.compare(password, hash);
      }

      // Unix crypt formats: $6$ (sha512), $5$ (sha256), $1$ (md5), or no $ (des)
      if (['1', '5', '6'].includes(hashType) || !hashType) {
        const crypted = unixcrypt.encrypt(password, hash);
        return crypted === hash;
      }

      logger.warn(`[SQLAuthProvider] Unsupported hash type: ${hashType}`);
      return false;

    } catch (error) {
      logger.error(`[SQLAuthProvider] Password verification error:`, error);
      return false;
    }
  }

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

      if (!user.password) {
        logger.warn(`[SQLAuthProvider] No password hash found for user: ${username}`);
        return false;
      }

      // Verify password against crypt-style hash
      const isValid = await this.verifyCryptPassword(password, user.password);
      
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