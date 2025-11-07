const { AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');
const BackendLoader = require('./utils/backendLoader');

/**
 * Factory for creating provider instances
 * Supports both compiled backends and dynamically loaded backends
 */
class ProviderFactory {
  constructor(backendDir = null) {
    this.backendDir = backendDir;
    this.backendLoader = new BackendLoader(this.backendDir);
  }

  createAuthProvider(type, options = {}) {
    return new this.backendLoader.getAuthBackend(type);
  }

  createDirectoryProvider(type, options = {}) {
    return new this.backendLoader.getDirectoryBackend(type);
  }

  /**
   * List all available backends (compiled + dynamic)
   * @returns {Object} Object with auth and directory arrays
   */
  static listAvailableBackends() {
    return backendLoader.listBackends();
  }

  /**
   * Reload dynamic backends (useful for development)
   */
  static reloadBackends() {
    backendLoader.reload();
  }
}

module.exports = {
  ProviderFactory,
  DatabaseAuthProvider,
  LdapAuthProvider,
  ProxmoxAuthProvider,
  DatabaseDirectoryProvider,
  ProxmoxDirectoryProvider
};