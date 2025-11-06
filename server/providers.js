const { AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');
const backendLoader = require('./utils/backendLoader');

// Import existing backends
const DBAuth = require('./auth/providers/auth/dbBackend');
const LDAPAuth = require('./auth/providers/auth/ldapBackend');
const ProxmoxAuth = require('./auth/providers/auth/proxmoxBackend');
const DBDirectory = require('./auth/providers/directory/DBDirectory');
const ProxmoxDirectory = require('./auth/providers/directory/ProxmoxDirectory');

// Import MFA wrapper
const NotificationAuthProvider = require('./auth/providers/auth/notificationAuthProvider');

/**
 * Wrapper for existing database authentication backend
 */
class DatabaseAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.dbAuth = new DBAuth();
  }

  async initialize() {
    await this.dbAuth.initialize();
  }

  async authenticate(username, password, req) {
    return await this.dbAuth.authenticate(username, password, req);
  }

  async cleanup() {
    await this.dbAuth.cleanup();
  }
}

/**
 * Wrapper for existing LDAP authentication backend
 */
class LdapAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.ldapAuth = new LDAPAuth();
  }

  async initialize() {
    await this.ldapAuth.initialize();
  }

  async authenticate(username, password, req) {
    return await this.ldapAuth.authenticate(username, password, req);
  }

  async cleanup() {
    await this.ldapAuth.cleanup();
  }
}

/**
 * Wrapper for existing Proxmox authentication backend
 */
class ProxmoxAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.proxmoxAuth = new ProxmoxAuth();
  }

  async initialize() {
    await this.proxmoxAuth.initialize();
  }

  async authenticate(username, password, req) {
    return await this.proxmoxAuth.authenticate(username, password, req);
  }

  async cleanup() {
    await this.proxmoxAuth.cleanup();
  }
}

/**
 * Wrapper for existing database directory backend
 */
class DatabaseDirectoryProvider extends DirectoryProvider {
  constructor() {
    super();
    this.dbDirectory = new DBDirectory();
  }

  async initialize() {
    await this.dbDirectory.initialize();
  }

  async findUser(username) {
    return await this.dbDirectory.findUser(username);
  }

  async findGroups(filter) {
    return await this.dbDirectory.findGroups(filter);
  }

  async getAllUsers() {
    return await this.dbDirectory.getAllUsers();
  }

  async getAllGroups() {
    return await this.dbDirectory.getAllGroups();
  }

  async cleanup() {
    await this.dbDirectory.cleanup();
  }
}

/**
 * Wrapper for existing Proxmox directory backend
 */
class ProxmoxDirectoryProvider extends DirectoryProvider {
  constructor() {
    super();
    this.proxmoxDirectory = new ProxmoxDirectory();
  }

  async initialize() {
    if (this.proxmoxDirectory.initialize) {
      await this.proxmoxDirectory.initialize();
    }
  }

  async findUser(username) {
    return await this.proxmoxDirectory.findUser(username);
  }

  async findGroups(filter) {
    return await this.proxmoxDirectory.findGroups(filter);
  }

  async getAllUsers() {
    return await this.proxmoxDirectory.getAllUsers();
  }

  async getAllGroups() {
    return await this.proxmoxDirectory.getAllGroups();
  }

  async cleanup() {
    if (this.proxmoxDirectory.cleanup) {
      await this.proxmoxDirectory.cleanup();
    }
  }
}

/**
 * Factory for creating provider instances
 * Supports both compiled backends and dynamically loaded backends
 */
class ProviderFactory {
  /**
   * Initialize the factory with dynamic backend support
   * @param {string} backendDir - Optional custom directory for backends
   */
  static initialize(backendDir = null) {
    backendLoader.initialize(backendDir);
  }

  static createAuthProvider(type, options = {}) {
    let baseProvider;

    // First check for dynamically loaded backends
    const DynamicBackend = backendLoader.getAuthBackend(type);
    if (DynamicBackend) {
      baseProvider = new DynamicBackend(options);
    } else {
      // Fall back to compiled backends - all self-configure
      switch (type) {
        case 'db':
          baseProvider = new DatabaseAuthProvider();
          break;
        case 'ldap':
          baseProvider = new LdapAuthProvider();
          break;
        case 'proxmox':
          baseProvider = new ProxmoxAuthProvider();
          break;
        default:
          throw new Error(`Unknown auth provider type: ${type}`);
      }
    }

    // Wrap with MFA/notification support if enabled
    if (process.env.ENABLE_NOTIFICATION === 'true') {
      return new NotificationAuthProvider(baseProvider);
    }

    return baseProvider;
  }

  static createDirectoryProvider(type, options = {}) {
    // First check for dynamically loaded backends
    const DynamicBackend = backendLoader.getDirectoryBackend(type);
    if (DynamicBackend) {
      return new DynamicBackend(options);
    }

    // Fall back to compiled backends - all self-configure
    switch (type) {
      case 'db':
        return new DatabaseDirectoryProvider();
      case 'proxmox':
        return new ProxmoxDirectoryProvider();
      default:
        throw new Error(`Unknown directory provider type: ${type}`);
    }
  }

  /**
   * List all available backends (compiled + dynamic)
   * @returns {Object} Object with auth and directory arrays
   */
  static listAvailableBackends() {
    const dynamic = backendLoader.listBackends();
    const compiled = {
      auth: ['db', 'ldap', 'proxmox'],
      directory: ['db', 'proxmox']
    };

    return {
      auth: [...new Set([...compiled.auth, ...dynamic.auth])],
      directory: [...new Set([...compiled.directory, ...dynamic.directory])]
    };
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