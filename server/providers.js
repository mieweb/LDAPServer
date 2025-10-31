const { AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');
const backendLoader = require('./utils/backendLoader');

// Import existing backends
const DBAuth = require('./auth/providers/auth/dbBackend');
const LDAPAuth = require('./auth/providers/auth/ldapBackend');
const ProxmoxAuth = require('./auth/providers/auth/proxmoxBackend');
const DBDirectory = require('./auth/providers/directory/DBDirectory');
const ProxmoxDirectory = require('./auth/providers/directory/ProxmoxDirectory');

/**
 * Wrapper for existing database authentication backend
 */
class DatabaseAuthProvider extends AuthProvider {
  constructor(databaseService) {
    super();
    this.dbAuth = new DBAuth(databaseService);
  }

  async authenticate(username, password, req) {
    return await this.dbAuth.authenticate(username, password, req);
  }
}

/**
 * Wrapper for existing LDAP authentication backend
 */
class LdapAuthProvider extends AuthProvider {
  constructor(ldapServerPool) {
    super();
    this.ldapAuth = new LDAPAuth(ldapServerPool);
  }

  async authenticate(username, password, req) {
    return await this.ldapAuth.authenticate(username, password, req);
  }
}

/**
 * Wrapper for existing Proxmox authentication backend
 */
class ProxmoxAuthProvider extends AuthProvider {
  constructor(shadowCfgPath) {
    super();
    this.proxmoxAuth = new ProxmoxAuth(shadowCfgPath);
  }

  async authenticate(username, password, req) {
    return await this.proxmoxAuth.authenticate(username, password, req);
  }
}

/**
 * Wrapper for existing database directory backend
 */
class DatabaseDirectoryProvider extends DirectoryProvider {
  constructor(databaseService) {
    super();
    this.dbDirectory = new DBDirectory(databaseService);
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
}

/**
 * Wrapper for existing Proxmox directory backend
 */
class ProxmoxDirectoryProvider extends DirectoryProvider {
  constructor(userCfgPath) {
    super();
    this.proxmoxDirectory = new ProxmoxDirectory(userCfgPath);
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
    // First check for dynamically loaded backends
    const DynamicBackend = backendLoader.getAuthBackend(type);
    if (DynamicBackend) {
      return new DynamicBackend(options);
    }

    // Fall back to compiled backends
    switch (type) {
      case 'db':
        return new DatabaseAuthProvider(options.databaseService);
      case 'ldap':
        return new LdapAuthProvider(options.ldapServerPool);
      case 'proxmox':
        return new ProxmoxAuthProvider(options.shadowCfgPath);
      default:
        throw new Error(`Unknown auth provider type: ${type}`);
    }
  }

  static createDirectoryProvider(type, options = {}) {
    // First check for dynamically loaded backends
    const DynamicBackend = backendLoader.getDirectoryBackend(type);
    if (DynamicBackend) {
      return new DynamicBackend(options);
    }

    // Fall back to compiled backends
    switch (type) {
      case 'db':
        return new DatabaseDirectoryProvider(options.databaseService);
      case 'proxmox':
        return new ProxmoxDirectoryProvider(options.userCfgPath);
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