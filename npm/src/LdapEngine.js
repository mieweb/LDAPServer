const ldap = require('ldapjs');
const { EventEmitter } = require('events');
const { createLdapEntry, createLdapGroupEntry } = require('./utils/ldapUtils');
const { 
  getUsernameFromFilter, 
  isAllUsersRequest, 
  isGroupSearchRequest, 
  isMixedSearchRequest 
} = require('./utils/filterUtils');

/**
 * Core LDAP Engine for the LDAP Gateway
 * Handles LDAP server setup, bind operations, and search operations
 */
class LdapEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      baseDn: options.baseDn || 'dc=localhost',
      bindIp: options.bindIp || '0.0.0.0',
      port: options.port || 389,
      certificate: options.certificate || null,
      key: options.key || null,
      tlsMinVersion: options.tlsMinVersion || null,
      tlsMaxVersion: options.tlsMaxVersion || null,
      tlsCiphers: options.tlsCiphers || null,
      requireAuthForSearch: options.requireAuthForSearch !== false,
      ...options
    };
    
    this.authProviders = options.authProviders;
    this.directoryProvider = options.directoryProvider;
    this.server = null;
    this.logger = options.logger || console;
    this._stopping = false;
  }

  /**
   * Initialize and start the LDAP server
   * @returns {Promise<void>}
   */
  async start() {
    this.directoryProvider.initialize();
    for (const authProvider of this.authProviders) {
      authProvider.initialize();
    }

    // Create server options
    const serverOptions = {};
    if (this.config.certificate && this.config.key) {
      serverOptions.certificate = this.config.certificate;
      serverOptions.key = this.config.key;
      this.logger.info("LDAP server configured with SSL/TLS certificates");
      
      // Apply TLS version and cipher configuration
      if (this.config.tlsMinVersion) {
        serverOptions.minVersion = this.config.tlsMinVersion;
        this.logger.info(`TLS minimum version set to: ${this.config.tlsMinVersion}`);
      }
      if (this.config.tlsMaxVersion) {
        serverOptions.maxVersion = this.config.tlsMaxVersion;
        this.logger.info(`TLS maximum version set to: ${this.config.tlsMaxVersion}`);
      }
      if (this.config.tlsCiphers) {
        serverOptions.ciphers = this.config.tlsCiphers;
        this.logger.info(`TLS ciphers configured: ${this.config.tlsCiphers}`);
      }
    } else {
      this.logger.warn("LDAP server running without SSL/TLS certificates");
      // Warn if TLS options are configured but certificates are missing
      if (this.config.tlsMinVersion || this.config.tlsMaxVersion || this.config.tlsCiphers) {
        this.logger.warn("TLS version/cipher options are configured but will be ignored because no certificates are provided");
      }
    }

    this.server = ldap.createServer(serverOptions);
    
    // Prevent EventEmitter memory leak warnings
    this.server.setMaxListeners(20);

    // Setup bind handlers
    this._setupBindHandlers();
    
    // Setup search handlers
    this._setupSearchHandlers();

    // Setup error handlers
    this._setupErrorHandlers();

    // Start listening
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.bindIp, (err) => {
        if (err) {
          const { normalizeServerError } = require('./utils/errorUtils');
          const normalizedError = normalizeServerError(err);
          this.emit('startupError', normalizedError);
          reject(normalizedError);
        } else {
          this.logger.info(`LDAP Server listening on port ${this.config.port}`);
          this.emit('started', { 
            port: this.config.port,
            baseDn: this.config.baseDn,
            hasCertificate: !!(this.config.certificate && this.config.key)
          });
          resolve();
        }
      });
    });
  }

  /**
   * Stop the LDAP server and cleanup all providers
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server || this._stopping) {
      return;
    }

    this._stopping = true;

    try {
      // First close the LDAP server
      await new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('LDAP Server stopped');
          resolve();
        });
      });

      // Then cleanup all providers
      await this._cleanupProviders();

      this.emit('stopped');
    } finally {
      // Clear server reference to prevent multiple calls
      this.server = null;
      this._stopping = false;
    }
  }

  /**
   * Cleanup all configured providers
   * @private
   */
  async _cleanupProviders() {
    // Cleanup directory provider
    if (this.directoryProvider && typeof this.directoryProvider.cleanup === 'function') {
      this.logger.debug('Cleaning up directory provider...');
      try {
        await this.directoryProvider.cleanup();
        this.logger.debug('Directory provider cleaned up');
      } catch (err) {
        this.logger.error('Error cleaning up directory provider:', err);
      }
    }

    // Cleanup all auth providers
    if (this.authProviders && Array.isArray(this.authProviders)) {
      for (const [index, authProvider] of this.authProviders.entries()) {
        if (authProvider && typeof authProvider.cleanup === 'function') {
          this.logger.debug(`Cleaning up auth provider ${index + 1}...`);
          try {
            await authProvider.cleanup();
            this.logger.debug(`Auth provider ${index + 1} cleaned up`);
          } catch (err) {
            this.logger.error(`Error cleaning up auth provider ${index + 1}:`, err);
          }
        }
      }
    }
  }

  /**
   * Setup bind handlers for authentication
   * @private
   */
  _setupBindHandlers() {
    // Anonymous bind support
    this.server.bind('', (req, res, next) => {
      this.logger.debug("Anonymous bind request - allowing for search operations");
      this.emit('bindRequest', { username: 'anonymous', anonymous: true });
      this.emit('bindSuccess', { username: 'anonymous', anonymous: true });
      res.end();
    });

    // Authenticated bind - catch all DNs under our base
    this.server.bind(this.config.baseDn, async (req, res, next) => {
      const { username, password } = this._extractCredentials(req);
      this.logger.debug("Authenticated bind request", { username, dn: req.dn.toString() });

      try {
        this.emit('bindRequest', { username, anonymous: false });
        
        // Authenticate against all auth providers - all must return true
        const authResults = await Promise.all(
          this.authProviders.map(provider => provider.authenticate(username, password, req))
        );
        const isAuthenticated = authResults.every(result => result === true);
        
        if (!isAuthenticated) {
          this.emit('bindFail', { username, reason: 'invalid_credentials' });
          const error = new ldap.InvalidCredentialsError('Invalid credentials');
          return next(error);
        }

        this.emit('bindSuccess', { username, anonymous: false });
        res.end();
      } catch (error) {
        this.logger.error("Bind error", { error, username });
        const { normalizeAuthError } = require('./utils/errorUtils');
        const normalizedError = normalizeAuthError(error);
        this.emit('bindError', { username, error: normalizedError });
        return next(normalizedError);
      }
    });
  }

  /**
   * Setup search handlers for directory operations
   * @private
   */
  _setupSearchHandlers() {
    // Authorization middleware (if enabled)
    const authorizeSearch = (req, res, next) => {
      if (!this.config.requireAuthForSearch) {
        return next();
      }

      // Check if connection has authenticated bindDN (not anonymous)
      const bindDN = req.connection.ldap.bindDN;
      const bindDNStr = bindDN ? bindDN.toString() : 'null';
      const isAnonymous = !bindDN || bindDNStr === 'cn=anonymous';
      
      if (isAnonymous) {
        this.logger.debug(`Anonymous search rejected - authentication required`);
        return next(new ldap.InsufficientAccessRightsError('Authentication required for search operations'));
      }
      
      this.logger.debug(`Authenticated search allowed for ${bindDNStr}`);
      return next();
    };

    // Search handler with authorization middleware
    this.server.search(this.config.baseDn, authorizeSearch, async (req, res, next) => {
      const filterStr = req.filter.toString();
      this.logger.debug(`LDAP Search - Filter: ${filterStr}, Attributes: ${req.attributes}`);

      let entryCount = 0;
      const startTime = Date.now();

      try {
        this.emit('searchRequest', { 
          filter: filterStr, 
          attributes: req.attributes,
          baseDn: req.baseObject.toString(),
          scope: req.scope
        });
        
        entryCount = await this._handleSearch(filterStr, req.attributes, res);
        
        const duration = Date.now() - startTime;
        this.emit('searchResponse', { 
          filter: filterStr, 
          attributes: req.attributes,
          entryCount,
          duration
        });
        
        this.logger.debug(`Search completed: ${entryCount} entries in ${duration}ms`);
        res.end();
      } catch (error) {
        this.logger.error("Search error", { error, filter: filterStr });
        const { normalizeSearchError } = require('./utils/errorUtils');
        const normalizedError = normalizeSearchError(error);
        this.emit('searchError', { 
          filter: filterStr, 
          error: normalizedError,
          duration: Date.now() - startTime
        });
        return next(normalizedError);
      }
    });
  }

  /**
   * Setup error handlers
   * @private
   */
  _setupErrorHandlers() {
    this.server.on('error', (err) => {
      this.logger.error('LDAP Server error:', err);
      this.emit('serverError', err);
    });

    this.server.on('clientError', (err, socket) => {
      this.logger.error('LDAP Client connection error:', { 
        error: err.message, 
        remoteAddress: socket?.remoteAddress,
        remotePort: socket?.remotePort 
      });
      this.emit('clientError', { error: err, socket });
    });
  }

  /**
   * Handle search operations with proper filter parsing and entry creation
   * @private
   * @returns {number} Number of entries sent
   */
  async _handleSearch(filterStr, attributes, res) {
    let entryCount = 0;
    const username = getUsernameFromFilter(filterStr);

    // Handle specific user requests
    if (username) {
      this.logger.debug(`Searching for specific user: ${username}`);
      const user = await this.directoryProvider.findUser(username);
      if (user) {
        const entry = createLdapEntry(user, this.config.baseDn);
        this.emit('entryFound', { type: 'user', entry: entry.dn });
        res.send(entry);
        entryCount = 1;
      }
      return entryCount;
    }

    // Handle all users requests
    if (isAllUsersRequest(filterStr, attributes)) {
      this.logger.debug(`Searching for all users with filter: ${filterStr}`);
      const users = await this.directoryProvider.getAllUsers();
      this.logger.debug(`Found ${users.length} users`);
      
      for (const user of users) {
        const entry = createLdapEntry(user, this.config.baseDn);
        this.emit('entryFound', { type: 'user', entry: entry.dn });
        res.send(entry);
        entryCount++;
      }
      return entryCount;
    }

    // Handle group search requests
    if (isGroupSearchRequest(filterStr, attributes)) {
      this.logger.debug(`Searching for groups with filter: ${filterStr}`);
      const groups = await this.directoryProvider.findGroups(filterStr);
      this.logger.debug(`Found ${groups.length} groups`);
      
      for (const group of groups) {
        const entry = createLdapGroupEntry(group, this.config.baseDn);
        this.emit('entryFound', { type: 'group', entry: entry.dn });
        res.send(entry);
        entryCount++;
      }
      return entryCount;
    }

    // Handle mixed searches (both users and groups)
    if (isMixedSearchRequest(filterStr)) {
      this.logger.debug(`Mixed search request with filter: ${filterStr}`);
      
      // Return users first
      const users = await this.directoryProvider.getAllUsers();
      this.logger.debug(`Found ${users.length} users for mixed search`);
      
      for (const user of users) {
        const entry = createLdapEntry(user, this.config.baseDn);
        this.emit('entryFound', { type: 'user', entry: entry.dn });
        res.send(entry);
        entryCount++;
      }

      // Then return groups
      const groups = await this.directoryProvider.getAllGroups();
      this.logger.debug(`Found ${groups.length} groups for mixed search`);
      
      for (const group of groups) {
        const entry = createLdapGroupEntry(group, this.config.baseDn);
        this.emit('entryFound', { type: 'group', entry: entry.dn });
        res.send(entry);
        entryCount++;
      }
      return entryCount;
    }

    this.logger.debug(`No matching search pattern found for filter: ${filterStr}`);
    return entryCount;
  }

  /**
   * Extract credentials from bind request
   * @private
   */
  _extractCredentials(req) {
    const { extractCredentials } = require('./utils/filterUtils');
    return extractCredentials(req);
  }
}

module.exports = LdapEngine;