class DirectoryProviderInterface {
  /**
   * Find a single user by username
   * @param {string} username
   * @returns {Promise<Object|null>} user object or null if not found
   */
  async findUser(username) {
    throw new Error('findUser must be implemented');
  }

  /**
   * Find groups matching a filter (could be by memberUid or other criteria)
   * @param {string} filter
   * @returns {Promise<Array>} array of group objects
   */
  async findGroups(filter) {
    throw new Error('findGroups must be implemented');
  }

  /**
   * Return all users in the directory
   * @returns {Promise<Array>} array of user objects
   */
  async getAllUsers() {
    throw new Error('getAllUsers must be implemented');
  }

  /**
   * Return all groups in the directory
   * @returns {Promise<Array>} array of group objects
   */
  async getAllGroups() {
    throw new Error('getAllGroups must be implemented');
  }
}

module.exports = DirectoryProviderInterface;
