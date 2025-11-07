const { AuthProvider } = require('@ldap-gateway/core');
const DatabaseService = require('../services/databaseServices');
const dbConfig = require('../config/dbConfig');
const logger = require('../utils/logger');

class DBBackend extends AuthProvider {
  constructor() {
    super();
    this.db = new DatabaseService(dbConfig);
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      await this.db.initialize();
      this.initialized = true;
    }
  }

  async authenticate(username, password) {
    const user = await this.db.findUserByUsername(username);

    logger.debug("authenticate user", user)

    if (!user) return false;
    // Compare password securely, assume bcrypt or similar
    return user.password === password; // TODO: Hash comparison
  }

  async cleanup() {
    if (this.initialized) {
      await this.db.shutdown();
      this.initialized = false;
      logger.info("[DBBackend] Database connection closed");
    }
  }
}

module.exports = {
  name: 'db',
  type: 'auth',
  provider: DBBackend,
};
