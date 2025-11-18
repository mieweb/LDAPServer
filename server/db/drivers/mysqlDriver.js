const MySQLDriver = require('./mysql');
const logger = require('../../utils/logger');

/**
 * MySQL Driver Wrapper - Maintains backward compatibility
 * Creates a singleton instance that matches the old module.exports pattern
 */
class MySQLDriverWrapper {
  constructor() {
    this.driver = new MySQLDriver();
  }

  async connect(config) {
    return await this.driver.connect(config);
  }

  async close() {
    return await this.driver.close();
  }

  async findUserByUsername(username) {
    return await this.driver.findUserByUsername(username);
  }

  async findGroupsByMemberUid(username) {
    return await this.driver.findGroupsByMemberUid(username);
  }

  async getAllUsers() {
    return await this.driver.getAllUsers();
  }

  async getAllGroups() {
    return await this.driver.getAllGroups();
  }
}

// Create singleton instance
const instance = new MySQLDriverWrapper();

// Export with backward-compatible function interface
module.exports = {
  connect: (config) => instance.connect(config),
  close: () => instance.close(),
  findUserByUsername: (username) => instance.findUserByUsername(username),
  findGroupsByMemberUid: (username) => instance.findGroupsByMemberUid(username),
  getAllUsers: () => instance.getAllUsers(),
  getAllGroups: () => instance.getAllGroups(),
};
