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
    const AuthProvider = this.backendLoader.getAuthBackend(type);
    return new AuthProvider(options);
  }

  createDirectoryProvider(type, options = {}) {
    const DirectoryProvider = this.backendLoader.getDirectoryBackend(type);
    return new DirectoryProvider(options);
  }

  /**
   * List all available backends (compiled + dynamic)
   * @returns {Object} Object with auth and directory arrays
   */
  listAvailableBackends() {
    return this.backendLoader.listBackends();
  }

  /**
   * Reload dynamic backends (useful for development)
   */
  reloadBackends() {
    this.backendLoader.reload();
  }
}

module.exports = ProviderFactory;