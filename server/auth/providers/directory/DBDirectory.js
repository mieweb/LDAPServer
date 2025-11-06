const { DirectoryProvider } = require('@ldap-gateway/core');
const DatabaseService = require('../../../services/databaseServices');
const dbConfig = require('../../../config/dbConfig');
const logger = require('../../../utils/logger');

class DBDirectory extends DirectoryProvider {
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

  async findUser(username) {
    return await this.db.findUserByUsername(username);
  }

  async findGroups(filter) {
    // for simplicity, parse memberUid out of filter here
    const memberUidMatch = filter.match(/memberUid=([^)&]+)/i);
    if (memberUidMatch) {
      return await this.db.findGroupsByMemberUid(memberUidMatch[1]);
    }
    return await this.db.getAllGroups();
  }

  async getAllUsers() {
    return await this.db.getAllUsers();
  }

  async getAllGroups() {
    return await this.db.getAllGroups();
  }

  async cleanup() {
    if (this.initialized) {
      await this.db.shutdown();
      this.initialized = false;
      logger.info("[DBBackend] Database connection closed");
    }
  }
}

module.exports = DBDirectory;
