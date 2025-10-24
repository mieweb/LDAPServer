const ldap = require('ldapjs');
const { EventEmitter } = require('events');

/**
 * Core LDAP Engine for the LDAP Gateway
 * Handles LDAP server setup, bind operations, and search operations
 */
class LdapEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      baseDn: options.baseDn || 'dc=localhost',
      port: options.port || 636,
      certificate: options.certificate || null,
      key: options.key || null,
      enableNotification: options.enableNotification || false,
      ...options
    };
    
    this.authProvider = null;
    this.directoryProvider = null;
    this.server = null;
    this.logger = options.logger || console;
  }

  /**
   * Set the authentication provider
   * @param {AuthProvider} provider - Implementation of AuthProvider interface
   */
  setAuthProvider(provider) {
    this.authProvider = provider;
  }

  /**
   * Set the directory provider  
   * @param {DirectoryProvider} provider - Implementation of DirectoryProvider interface
   */
  setDirectoryProvider(provider) {
    this.directoryProvider = provider;
  }

  /**
   * Initialize and start the LDAP server
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.authProvider) {
      throw new Error('AuthProvider must be set before starting');
    }
    if (!this.directoryProvider) {
      throw new Error('DirectoryProvider must be set before starting');
    }

    // Create server options
    const serverOptions = {};
    if (this.config.certificate && this.config.key) {
      serverOptions.certificate = this.config.certificate;
      serverOptions.key = this.config.key;
      this.logger.info("LDAP server configured with SSL/TLS certificates");
    } else {
      this.logger.warn("LDAP server running without SSL/TLS certificates");
    }

    this.server = ldap.createServer(serverOptions);

    // Setup bind handlers
    this._setupBindHandlers();
    
    // Setup search handlers
    this._setupSearchHandlers();

    // Setup error handlers
    this._setupErrorHandlers();

    // Start listening
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, "0.0.0.0", (err) => {
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
   * Stop the LDAP server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('LDAP Server stopped');
        this.emit('stopped');
        resolve();
      });
    });
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

    // Authenticated bind
    this.server.bind(this.config.baseDn, async (req, res, next) => {
      const { username, password } = this._extractCredentials(req);
      this.logger.debug("Authenticated bind request", { username });

      try {
        this.emit('bindRequest', { username, anonymous: false });
        
        const isAuthenticated = await this.authProvider.authenticate(username, password, req);
        
        if (!isAuthenticated) {
          this.emit('bindFail', { username, reason: 'invalid_credentials' });
          const error = new ldap.InvalidCredentialsError('Invalid credentials');
          return next(error);
        }

        // Handle notification service if enabled
        if (this.config.enableNotification) {
          this.emit('notificationRequest', { username });
          // For now, assume notification is approved
          // In a real implementation, this would wait for notification response
          this.emit('notificationResponse', { username, action: 'APPROVE' });
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
    this.server.search(this.config.baseDn, async (req, res, next) => {
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
        remoteAddress: socket.remoteAddress,
        remotePort: socket.remotePort 
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
    const { 
      getUsernameFromFilter, 
      isAllUsersRequest, 
      isGroupSearchRequest, 
      isMixedSearchRequest 
    } = require('./utils/filterUtils');
    const { createLdapEntry, createLdapGroupEntry } = require('./utils/ldapUtils');

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
      const groups = await this.directoryProvider.getAllGroups();
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