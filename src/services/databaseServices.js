// services/databaseService.js
const mysqlDriver = require('../db/drivers/mysql');
const mongodbDriver = require('../db/drivers/mongoDb')

class DatabaseService {
  constructor(dbConfig) {
    this.dbConfig = dbConfig;
    this.dbType = dbConfig.type;
    this.connection = null;
    this.driver = this._getDriver();
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

  async getConnection() {
    if (!this.connection) {
      this.connection = await this.driver.connect(this.dbConfig);
    }
    return this.connection;
  }

  async closeConnection() {
    if (this.connection) {
      await this.driver.close(this.connection);
      this.connection = null;
    }
  }
  
  // Helper method to execute a function with a connection
  async _withConnection(callback) {
    const connection = await this.getConnection();
    try {
      return await callback(connection);
    } finally {
      // For MySQL, close after each operation
      // For MongoDB, keep the connection open
      if (this.dbType === 'mysql') {
        await this.closeConnection();
      }
    }
  }

  // User operations
  async findUserByUsername(username) {
    return this._withConnection(conn => 
      this.driver.findUserByUsername(conn, username)
    );
  }

  async findUserWithAppId(username) {
    return this._withConnection(conn => 
      this.driver.findUserWithAppId(conn, username)
    );
  }

  async findUserDetails(username) {
    return this._withConnection(conn => 
      this.driver.findUserDetails(conn, username)
    );
  }

  async updateUserAppId(username, appId) {
    return this._withConnection(conn => 
      this.driver.updateUserAppId(conn, username, appId)
    );
  }

  // Group operations
  async findGroupsByMemberUid(username) {
    return this._withConnection(conn => 
      this.driver.findGroupsByMemberUid(conn, username)
    );
  }
}

module.exports = DatabaseService;