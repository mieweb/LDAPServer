/**
 * Authentication provider interface for LDAP Gateway Core
 * Implement this interface to add custom authentication backends
 */
class AuthProvider {
  /**
   * @param {Object} options - Provider configuration options (overrides env vars)
   */
  constructor(options = {}) {
    this.options = options;
  }

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

  /**
   * Initialize the authentication provider (optional)
   * Called before first use to set up connections, load configs, etc.
   * @returns {Promise<void>}
   */
  async initialize() {
    // Optional - providers that need initialization should override this
  }

  /**
   * Clean up resources used by the authentication provider (optional)
   * Called during graceful shutdown to close connections, file watchers, etc.
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Optional - providers that need cleanup should override this
  }
}

module.exports = AuthProvider;