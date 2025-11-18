/**
 * Base SQL Driver Interface
 * Defines the common interface that all SQL drivers must implement
 */
class BaseSqlDriver {
  constructor() {
    this.pool = null;
    this.config = null;
  }

  /**
   * Connect to the database
   * @param {Object} config - Database configuration
   * @returns {Promise<void>}
   */
  async connect(config) {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error('close() must be implemented by subclass');
  }

  /**
   * Execute a parameterized query
   * @param {string} query - SQL query with placeholders
   * @param {Array} params - Parameters for the query
   * @returns {Promise<Array>} Query results
   */
  async query(query, params = []) {
    throw new Error('query() must be implemented by subclass');
  }

  /**
   * Get a connection from the pool
   * @returns {Promise<Object>} Database connection
   */
  async getConnection() {
    throw new Error('getConnection() must be implemented by subclass');
  }

  /**
   * Release a connection back to the pool
   * @param {Object} connection - Database connection to release
   * @returns {Promise<void>}
   */
  async releaseConnection(connection) {
    throw new Error('releaseConnection() must be implemented by subclass');
  }

  /**
   * Find user by username
   * @param {string} username - Username to search for
   * @returns {Promise<Object|null>} User object or null
   */
  async findUserByUsername(username) {
    throw new Error('findUserByUsername() must be implemented by subclass');
  }

  /**
   * Find groups by member username
   * @param {string} username - Username to search for
   * @returns {Promise<Array>} Array of group objects
   */
  async findGroupsByMemberUid(username) {
    throw new Error('findGroupsByMemberUid() must be implemented by subclass');
  }

  /**
   * Get all users
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsers() {
    throw new Error('getAllUsers() must be implemented by subclass');
  }

  /**
   * Get all groups
   * @returns {Promise<Array>} Array of group objects
   */
  async getAllGroups() {
    throw new Error('getAllGroups() must be implemented by subclass');
  }

  /**
   * Convert placeholder format between dialects
   * MySQL uses ?, PostgreSQL uses $1, $2, etc.
   * @param {string} query - Query with placeholders
   * @param {string} fromFormat - Source format ('?' or '$')
   * @param {string} toFormat - Target format ('?' or '$')
   * @returns {string} Converted query
   */
  convertPlaceholders(query, fromFormat = '?', toFormat = '?') {
    if (fromFormat === toFormat) {
      return query;
    }

    if (toFormat === '$') {
      // Convert ? to $1, $2, $3...
      let index = 1;
      return query.replace(/\?/g, () => `$${index++}`);
    } else if (toFormat === '?') {
      // Convert $1, $2, $3... to ?
      return query.replace(/\$\d+/g, '?');
    }

    return query;
  }
}

module.exports = BaseSqlDriver;
