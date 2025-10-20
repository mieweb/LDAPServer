const DirectoryProviderInterface = require('./DirectoryProviderInterface');

class DBDirectory extends DirectoryProviderInterface {
  constructor(dbService) {
    super();
    this.db = dbService;
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

  cleanup() {
    // No cleanup needed for DB directory
  }
}

module.exports = DBDirectory;
