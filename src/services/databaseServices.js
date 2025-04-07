// services/databaseService.js
const mysqlDriver = require('../db/drivers/mysql');
const mongodbDriver = require('../db/drivers/mongoDb');

class DatabaseService {
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.dbType = dbConfig.type;
    this.driver = this._getDriver();
    this.initialized = false;
  }

  _getDriver() {
    switch (this.dbType) {
      case 'mysql':
        return mysqlDriver;
      case 'mongodb':
        return mongodbDriver;
      default:
        throw new Error(`Unsupported database type: ${this.dbType}`);
    }
  }

  // Initialize the database connection pool
  async initialize() {
    if (!this.initialized) {
      await this.driver.connect(this.dbConfig);
      this.initialized = true;
    }
  }

  // Shutdown the database connection pool
  async shutdown() {
    if (this.initialized) {
      await this.driver.close();
      this.initialized = false;
    }
  }

  // User operations
  async findUserByUsername(username) {
    await this.initialize();
    return this.driver.findUserByUsername(username);
  }

  // Group operations
  async findGroupsByMemberUid(username) {
    await this.initialize();
    return this.driver.findGroupsByMemberUid(username);
  }
}

module.exports = DatabaseService;