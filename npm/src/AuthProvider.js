/**
 * Authentication provider interface for LDAP Gateway Core
 * Implement this interface to add custom authentication backends
 */
class AuthProvider {
  /**
   * Authenticate a user with username and password
   * @param {string} username - The username to authenticate
   * @param {string} password - The password to verify
   * @param {Object} req - Request context object containing additional data
   * @returns {Promise<boolean>} - True if authentication successful, false otherwise
   * @throws {Error} - If authentication check fails due to system error
   */
  async authenticate(username, password, req) {
    throw new Error('authenticate must be implemented');
  }
}

module.exports = AuthProvider;