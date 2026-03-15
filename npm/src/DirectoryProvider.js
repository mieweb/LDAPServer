/**
 * Directory provider interface for LDAP Gateway Core
 * Implement this interface to add custom directory backends
 */
class DirectoryProvider {
  /**
   * @param {Object} options - Provider configuration options (overrides env vars)
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Find a single user by username
   * @param {string} username - The username to search for
   * @returns {Promise<Object|null>} User object or null if not found
   * @throws {Error} If directory lookup fails due to system error
   */
  async findUser(username) {
    throw new Error('findUser must be implemented');
  }

  /**
   * Find groups matching a filter (could be by memberUid or other criteria)
   * @param {string} filter - Filter criteria for group search
   * @returns {Promise<Array>} Array of group objects
   * @throws {Error} If directory lookup fails due to system error
   */
  async findGroups(filter) {
    throw new Error('findGroups must be implemented');
  }

  /**
   * Return all users in the directory
   * @returns {Promise<Array>} Array of user objects
   * @throws {Error} If directory lookup fails due to system error
   */
  async getAllUsers() {
    throw new Error('getAllUsers must be implemented');
  }

  /**
   * Return all groups in the directory
   * @returns {Promise<Array>} Array of group objects
   * @throws {Error} If directory lookup fails due to system error
   */
  async getAllGroups() {
    throw new Error('getAllGroups must be implemented');
  }

  /**
   * Initialize the directory provider (optional)
   * Called before first use to set up connections, load configs, etc.
   * @returns {Promise<void>}
   */
  async initialize() {
    // Optional - providers that need initialization should override this
  }

  /**
   * Clean up resources used by the directory provider (optional)
   * Called during graceful shutdown to close connections, file watchers, etc.
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Optional - providers that need cleanup should override this
  }
}

module.exports = DirectoryProvider;