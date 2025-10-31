const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Dynamic Backend Loader
 * Loads backend providers from JavaScript files at runtime
 * Supports both authentication and directory providers
 */
class BackendLoader {
  constructor() {
    this.loadedBackends = {
      auth: new Map(),
      directory: new Map()
    };
    this.backendDir = null;
  }

  /**
   * Initialize the backend loader with a directory path
   * @param {string} backendDir - Path to directory containing backend files
   */
  initialize(backendDir = null) {
    // Default to ./backends relative to project root
    this.backendDir = backendDir || path.join(process.cwd(), 'backends');
    
    if (!fs.existsSync(this.backendDir)) {
      logger.info(`[BackendLoader] Backend directory not found: ${this.backendDir}`);
      logger.info('[BackendLoader] Skipping dynamic backend loading');
      return;
    }

    logger.info(`[BackendLoader] Scanning for backends in: ${this.backendDir}`);
    this.loadBackends();
  }

  /**
   * Scan directory and load all backend modules
   */
  loadBackends() {
    try {
      const files = fs.readdirSync(this.backendDir);
      
      for (const file of files) {
        // Only process .js files, skip examples and templates
        if (!file.endsWith('.js') || file.includes('.example.') || file === 'template.js') {
          continue;
        }

        const filePath = path.join(this.backendDir, file);
        const stat = fs.statSync(filePath);

        if (stat.isFile()) {
          this.loadBackend(filePath);
        }
      }

      logger.info(`[BackendLoader] Loaded ${this.loadedBackends.auth.size} auth backends`);
      logger.info(`[BackendLoader] Loaded ${this.loadedBackends.directory.size} directory backends`);
    } catch (err) {
      logger.error('[BackendLoader] Error scanning backend directory:', { error: err.message });
    }
  }

  /**
   * Load a single backend module from file
   * @param {string} filePath - Path to backend JS file
   */
  loadBackend(filePath) {
    try {
      // Dynamically require the module
      const backendModule = require(filePath);

      // Validate module structure
      if (!this.validateBackend(backendModule, filePath)) {
        return;
      }

      const { name, type, provider } = backendModule;

      // Register the backend
      if (type === 'auth') {
        this.loadedBackends.auth.set(name, provider);
        logger.info(`[BackendLoader] Registered auth backend: ${name} from ${path.basename(filePath)}`);
      } else if (type === 'directory') {
        this.loadedBackends.directory.set(name, provider);
        logger.info(`[BackendLoader] Registered directory backend: ${name} from ${path.basename(filePath)}`);
      }
    } catch (err) {
      logger.error(`[BackendLoader] Failed to load backend from ${filePath}:`, { error: err.message, stack: err.stack });
    }
  }

  /**
   * Validate that a backend module has required structure
   * @param {Object} backendModule - The loaded module
   * @param {string} filePath - Path to the file (for error messages)
   * @returns {boolean} True if valid
   */
  validateBackend(backendModule, filePath) {
    const fileName = path.basename(filePath);

    if (!backendModule.name) {
      logger.warn(`[BackendLoader] Backend ${fileName} missing 'name' property`);
      return false;
    }

    if (!backendModule.type) {
      logger.warn(`[BackendLoader] Backend ${fileName} missing 'type' property (should be 'auth' or 'directory')`);
      return false;
    }

    if (!['auth', 'directory'].includes(backendModule.type)) {
      logger.warn(`[BackendLoader] Backend ${fileName} has invalid type: ${backendModule.type} (should be 'auth' or 'directory')`);
      return false;
    }

    if (!backendModule.provider) {
      logger.warn(`[BackendLoader] Backend ${fileName} missing 'provider' class`);
      return false;
    }

    // Validate provider is a class/constructor
    if (typeof backendModule.provider !== 'function') {
      logger.warn(`[BackendLoader] Backend ${fileName} provider must be a class/constructor function`);
      return false;
    }

    // Check if provider has required methods (basic check)
    const prototype = backendModule.provider.prototype;
    if (backendModule.type === 'auth' && typeof prototype.authenticate !== 'function') {
      logger.warn(`[BackendLoader] Auth backend ${fileName} missing authenticate() method`);
      return false;
    }

    if (backendModule.type === 'directory') {
      const requiredMethods = ['findUser', 'getAllUsers', 'findGroups', 'getAllGroups'];
      for (const method of requiredMethods) {
        if (typeof prototype[method] !== 'function') {
          logger.warn(`[BackendLoader] Directory backend ${fileName} missing ${method}() method`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get a loaded auth backend by name
   * @param {string} name - Backend name
   * @returns {Function|null} Backend class or null if not found
   */
  getAuthBackend(name) {
    return this.loadedBackends.auth.get(name) || null;
  }

  /**
   * Get a loaded directory backend by name
   * @param {string} name - Backend name
   * @returns {Function|null} Backend class or null if not found
   */
  getDirectoryBackend(name) {
    return this.loadedBackends.directory.get(name) || null;
  }

  /**
   * List all loaded backend names
   * @returns {Object} Object with auth and directory arrays
   */
  listBackends() {
    return {
      auth: Array.from(this.loadedBackends.auth.keys()),
      directory: Array.from(this.loadedBackends.directory.keys())
    };
  }

  /**
   * Reload all backends (useful for hot reload in future)
   */
  reload() {
    // Clear the require cache for all loaded backends
    for (const [name, provider] of this.loadedBackends.auth) {
      const modulePath = this._getModulePath(provider);
      if (modulePath) {
        delete require.cache[modulePath];
      }
    }
    for (const [name, provider] of this.loadedBackends.directory) {
      const modulePath = this._getModulePath(provider);
      if (modulePath) {
        delete require.cache[modulePath];
      }
    }

    // Clear maps
    this.loadedBackends.auth.clear();
    this.loadedBackends.directory.clear();

    // Reload
    this.loadBackends();
  }

  /**
   * Helper to get module path from a class (for cache clearing)
   * @private
   */
  _getModulePath(provider) {
    // This is a best-effort approach - may not work in all cases
    try {
      for (const [modulePath, module] of Object.entries(require.cache)) {
        if (module.exports?.provider === provider) {
          return modulePath;
        }
      }
    } catch (err) {
      // Ignore errors
    }
    return null;
  }
}

// Export singleton instance
module.exports = new BackendLoader();
