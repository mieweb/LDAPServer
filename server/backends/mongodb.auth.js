const { AuthProvider } = require('@ldap-gateway/core');
const mongoDbDriver = require('../db/drivers/mongoDb');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');

/**
 * MongoDB Authentication Provider  
 * Handles user authentication against MongoDB database
 */
class MongoDBAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.config = {
      type: 'mongodb',
      uri: process.env.MONGO_URI || "mongodb://localhost:27017/ldap_user_db",
      database: process.env.MONGO_DATABASE || "ldap_user_db"
    };
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      logger.info('[MongoDBAuthProvider] Initializing MongoDB connection...');
      await mongoDbDriver.connect(this.config);
      this.initialized = true;
      logger.info(`[MongoDBAuthProvider] Connected to MongoDB: ${this.config.uri}`);
    }
  }

  async authenticate(username, password) {
    try {
      await this.initialize();
      
      logger.debug(`[MongoDBAuthProvider] Authenticating user: ${username}`);
      const user = await mongoDbDriver.findUserByUsername(username);

      if (!user) {
        logger.debug(`[MongoDBAuthProvider] User not found: ${username}`);
        return false;
      }

      // Check if user has password_hash (bcrypt)
      if (!user.password_hash) {
        logger.debug(`[MongoDBAuthProvider] No password_hash found for user: ${username}`);
        return false;
      }

      // Verify password using bcrypt
      try {
        const isValid = await bcrypt.compare(password, user.password_hash);
        logger.debug(`[MongoDBAuthProvider] Authentication result for ${username}: ${isValid}`);
        return isValid;
      } catch (error) {
        logger.error(`[MongoDBAuthProvider] Bcrypt comparison error for ${username}:`, error);
        return false;
      }
      
    } catch (error) {
      logger.error(`[MongoDBAuthProvider] Authentication error for ${username}:`, error);
      return false;
    }
  }

  async cleanup() {
    if (this.initialized) {
      logger.info('[MongoDBAuthProvider] Cleaning up MongoDB connection...');
      await mongoDbDriver.close();
      this.initialized = false;
      logger.info('[MongoDBAuthProvider] MongoDB connection closed');
    }
  }
}

module.exports = {
  name: 'mongodb',
  type: 'auth',
  provider: MongoDBAuthProvider,
};