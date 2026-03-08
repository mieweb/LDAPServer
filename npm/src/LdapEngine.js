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
 * Handles LDAP server setup, bind operations, and search operations.
 * 
 * Supports multi-realm mode: each realm pairs a directory backend + auth chain
 * with a baseDN. Searches are routed by baseDN; binds locate the user across
 * realms sharing a baseDN and apply the correct auth chain.
 * 
 * Backward compatible: when no `realms` option is provided, the engine wraps
 * the legacy `authProviders`/`directoryProvider`/`baseDn` into one implicit realm.
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
    
    // Build realm data structures
    this._initRealms(options);

    // Legacy single-provider refs (for backward compat in tests/external code)
    this.authProviders = options.authProviders || this.allRealms[0]?.authProviders;
    this.directoryProvider = options.directoryProvider || this.allRealms[0]?.directoryProvider;

    // Auth provider registry for per-user auth override (Phase 3)
    // Maps provider type name → AuthProvider instance
    this.authProviderRegistry = options.authProviderRegistry || new Map();

    this.server = null;
    this.logger = options.logger || console;
    this._stopping = false;
  }

  /**
   * Initialize realm data structures from options
   * @private
   */
  _initRealms(options) {
    if (options.realms && Array.isArray(options.realms) && options.realms.length > 0) {
      // Multi-realm mode: realms provided explicitly
      this.allRealms = options.realms.map(r => ({
        name: r.name,
        baseDn: r.baseDn,
        directoryProvider: r.directoryProvider,
        authProviders: r.authProviders || []
      }));
    } else if (options.authProviders && options.directoryProvider) {
      // Legacy single-realm mode: wrap into one implicit realm
      const baseDn = options.baseDn || 'dc=localhost';
      this.allRealms = [{
        name: 'default',
        baseDn,
        directoryProvider: options.directoryProvider,
        authProviders: options.authProviders
      }];
    } else {
      this.allRealms = [];
    }

    // Index realms by baseDN (lowercased) for O(1) routing
    this.realmsByBaseDn = new Map();
    for (const realm of this.allRealms) {
      const key = realm.baseDn.toLowerCase();
      const existing = this.realmsByBaseDn.get(key) || [];
      existing.push(realm);
      this.realmsByBaseDn.set(key, existing);
    }
  }

  /**
   * Initialize and start the LDAP server
   * @returns {Promise<void>}
   */
  async start() {
    // Initialize all realm providers
    for (const realm of this.allRealms) {
      if (realm.directoryProvider && typeof realm.directoryProvider.initialize === 'function') {
        realm.directoryProvider.initialize();
      }
      for (const authProvider of realm.authProviders) {
        if (typeof authProvider.initialize === 'function') {
          authProvider.initialize();
        }
      }
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
          const baseDns = [...new Set(this.allRealms.map(r => r.baseDn))];
          this.emit('started', { 
            port: this.config.port,
            baseDn: this.config.baseDn,
            baseDns,
            realms: this.allRealms.map(r => r.name),
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
   * Cleanup all configured providers across all realms
   * @private
   */
  async _cleanupProviders() {
    for (const realm of this.allRealms) {
      // Cleanup directory provider
      if (realm.directoryProvider && typeof realm.directoryProvider.cleanup === 'function') {
        this.logger.debug(`Cleaning up directory provider for realm '${realm.name}'...`);
        try {
          await realm.directoryProvider.cleanup();
          this.logger.debug(`Directory provider for realm '${realm.name}' cleaned up`);
        } catch (err) {
          this.logger.error(`Error cleaning up directory provider for realm '${realm.name}':`, err);
        }
      }

      // Cleanup auth providers
      for (const [index, authProvider] of realm.authProviders.entries()) {
        if (authProvider && typeof authProvider.cleanup === 'function') {
          this.logger.debug(`Cleaning up auth provider ${index + 1} for realm '${realm.name}'...`);
          try {
            await authProvider.cleanup();
            this.logger.debug(`Auth provider ${index + 1} for realm '${realm.name}' cleaned up`);
          } catch (err) {
            this.logger.error(`Error cleaning up auth provider ${index + 1} for realm '${realm.name}':`, err);
          }
        }
      }
    }
  }

  /**
   * Setup bind handlers for authentication
   * Registers one handler per unique baseDN across all realms.
   * @private
   */
  _setupBindHandlers() {
    // Anonymous bind support
    this.server.bind('', (req, res, next) => {
      this.logger.debug("Anonymous bind request - allowing for search operations");
      this.emit('bindRequest', { username: 'anonymous', anonymous: true });
      this.emit('bindSuccess', { username: 'anonymous', anonymous: true });
      res.end();
      return next();
    });

    // Register one bind handler per unique baseDN
    for (const [baseDn, realms] of this.realmsByBaseDn) {
      this.server.bind(baseDn, (req, res, next) => {
        const { username, password } = this._extractCredentials(req);
        this.logger.debug("Authenticated bind request", { username, dn: req.dn.toString() });

        this.emit('bindRequest', { username, anonymous: false });

        this._authenticateAcrossRealms(realms, username, password, req)
          .then(({ authenticated, realmName }) => {
            if (!authenticated) {
              this.emit('bindFail', { username, reason: 'invalid_credentials' });
              const error = new ldap.InvalidCredentialsError('Invalid credentials');
              return next(error);
            }

            this.logger.debug(`User ${username} authenticated via realm '${realmName}'`);
            this.emit('bindSuccess', { username, anonymous: false, realm: realmName });
            res.end();
            return next();
          })
          .catch(error => {
            this.logger.error("Bind error", { error, username });
            const { normalizeAuthError } = require('./utils/errorUtils');
            const normalizedError = normalizeAuthError(error);
            this.emit('bindError', { username, error: normalizedError });
            return next(normalizedError);
          });
      });
    }
  }

  /**
   * Find the user across realms sharing a baseDN and authenticate with the
   * matching realm's auth chain (or per-user override if auth_backends is set).
   * 
   * Flow: iterate realms in config order → first findUser() hit determines
   * which realm's auth chain to use → if the user record has `auth_backends`,
   * resolve an override chain from the authProviderRegistry → otherwise fall
   * back to the realm's default auth providers → authenticate sequentially.
   * 
   * @private
   * @param {Array} realms - Realms sharing this baseDN
   * @param {string} username
   * @param {string} password
   * @param {Object} req - LDAP request
   * @returns {Promise<{authenticated: boolean, realmName: string|null}>}
   */
  async _authenticateAcrossRealms(realms, username, password, req) {
    // Find which realm owns this user
    let matchedRealm = null;
    let matchedUser = null;
    let matchCount = 0;

    for (const realm of realms) {
      try {
        const user = await realm.directoryProvider.findUser(username);
        if (user) {
          matchCount++;
          if (!matchedRealm) {
            matchedRealm = realm;
            matchedUser = user;
          } else {
            this.logger.warn(
              `User '${username}' found in multiple realms: '${matchedRealm.name}' and '${realm.name}'. ` +
              `Using first match '${matchedRealm.name}'.`
            );
          }
        }
      } catch (err) {
        this.logger.error(`Error finding user '${username}' in realm '${realm.name}':`, err);
      }
    }

    if (!matchedRealm) {
      this.logger.debug(`User '${username}' not found in any realm`);
      return { authenticated: false, realmName: null };
    }

    // Resolve the auth chain: per-user override or realm default
    const authChain = this._resolveAuthChain(matchedRealm, matchedUser, username);

    // Authenticate sequentially against the resolved auth chain
    for (const provider of authChain) {
      const result = await provider.authenticate(username, password, req);
      if (result !== true) {
        return { authenticated: false, realmName: matchedRealm.name };
      }
    }

    return { authenticated: true, realmName: matchedRealm.name };
  }

  /**
   * Resolve the auth provider chain for a user.
   * 
   * If the user record has an `auth_backends` field (comma-separated provider
   * type names), look up each name in the authProviderRegistry to build a
   * per-user override chain.  If `auth_backends` is null/undefined/empty,
   * fall back to the realm's default auth providers.
   * 
   * @private
   * @param {Object} realm - The matched realm
   * @param {Object} user - The user record from the directory provider
   * @param {string} username - Username (for logging)
   * @returns {Array} Array of auth providers to authenticate against
   */
  _resolveAuthChain(realm, user, username) {
    const userBackends = user.auth_backends;

    if (!userBackends || (typeof userBackends === 'string' && userBackends.trim() === '')) {
      // No per-user override — use realm defaults
      return realm.authProviders;
    }

    // Parse comma-separated backend names
    const backendNames = typeof userBackends === 'string'
      ? userBackends.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    if (backendNames.length === 0) {
      return realm.authProviders;
    }

    // Resolve each name from the registry
    const overrideChain = [];
    for (const name of backendNames) {
      const provider = this.authProviderRegistry.get(name);
      if (!provider) {
        this.logger.error(
          `User '${username}' has auth_backends='${userBackends}' but backend '${name}' ` +
          `is not registered. Failing authentication for security.`
        );
        throw new Error(`Unknown auth backend '${name}' for user '${username}'`);
      }
      overrideChain.push(provider);
    }

    this.logger.debug(
      `User '${username}' using per-user auth override: [${backendNames.join(', ')}]`
    );

    return overrideChain;
  }

  /**
   * Setup search handlers for directory operations.
   * Registers one handler per unique baseDN across all realms.
   * @private
   */
  _setupSearchHandlers() {
    // RootDSE handler - handles queries to empty base DN ("") per RFC 4512 section 5.1
    this.server.search('', (req, res, next) => this._handleRootDSE(req, res, next));

    // Authorization middleware (if enabled) for normal searches
    const authorizeSearch = (req, res, next) => {
      if (!this.config.requireAuthForSearch) {
        return next();
      }

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

    // Register one search handler per unique baseDN
    for (const [baseDn, realms] of this.realmsByBaseDn) {
      this.server.search(baseDn, authorizeSearch, async (req, res, next) => {
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
          
          entryCount = await this._handleMultiRealmSearch(realms, filterStr, req.attributes, res);
          
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
   * Handle search across multiple realms sharing a baseDN.
   * Queries each realm's directory provider, deduplicates entries by DN,
   * and sends merged results.
   * @private
   * @param {Array} realms - Realms sharing the same baseDN
   * @param {string} filterStr - LDAP filter string
   * @param {Array} attributes - Requested attributes
   * @param {Object} res - ldapjs response object
   * @returns {number} Number of entries sent
   */
  async _handleMultiRealmSearch(realms, filterStr, attributes, res) {
    // Collect entries from all realms in parallel
    const realmResults = await Promise.all(
      realms.map(realm => this._handleRealmSearch(realm, filterStr, attributes))
    );

    // Deduplicate entries by DN (first realm wins for same DN)
    const seenDNs = new Set();
    let entryCount = 0;

    for (const { entries, realmName } of realmResults) {
      for (const { entry, type } of entries) {
        const dnLower = entry.dn.toLowerCase();
        if (seenDNs.has(dnLower)) {
          this.logger.debug(`Skipping duplicate DN from realm '${realmName}': ${entry.dn}`);
          continue;
        }
        seenDNs.add(dnLower);
        this.emit('entryFound', { type: type || 'user', entry: entry.dn, realm: realmName });
        res.send(entry);
        entryCount++;
      }
    }

    return entryCount;
  }

  /**
   * Handle search operations for a single realm.
   * Returns entries array instead of sending directly to res.
   * @private
   * @param {Object} realm - Realm object with directoryProvider and baseDn
   * @param {string} filterStr - LDAP filter string
   * @param {Array} attributes - Requested attributes
   * @returns {{ entries: Array<{entry: Object, type: string}>, realmName: string }}
   */
  async _handleRealmSearch(realm, filterStr, attributes) {
    const entries = [];
    const { directoryProvider, baseDn, name: realmName } = realm;
    const username = getUsernameFromFilter(filterStr);

    // Handle specific user requests
    if (username) {
      this.logger.debug(`[${realmName}] Searching for specific user: ${username}`);
      const user = await directoryProvider.findUser(username);
      if (user) {
        const entry = createLdapEntry(user, baseDn);
        entries.push({ entry, type: 'user' });
      }
      return { entries, realmName };
    }

    // Handle all users requests
    if (isAllUsersRequest(filterStr, attributes)) {
      this.logger.debug(`[${realmName}] Searching for all users with filter: ${filterStr}`);
      const users = await directoryProvider.getAllUsers();
      this.logger.debug(`[${realmName}] Found ${users.length} users`);
      
      for (const user of users) {
        const entry = createLdapEntry(user, baseDn);
        entries.push({ entry, type: 'user' });
      }
      return { entries, realmName };
    }

    // Handle group search requests
    if (isGroupSearchRequest(filterStr, attributes)) {
      this.logger.debug(`[${realmName}] Searching for groups with filter: ${filterStr}`);
      const groups = await directoryProvider.findGroups(filterStr);
      this.logger.debug(`[${realmName}] Found ${groups.length} groups`);
      
      for (const group of groups) {
        const entry = createLdapGroupEntry(group, baseDn);
        entries.push({ entry, type: 'group' });
      }
      return { entries, realmName };
    }

    // Handle mixed searches (both users and groups)
    if (isMixedSearchRequest(filterStr)) {
      this.logger.debug(`[${realmName}] Mixed search request with filter: ${filterStr}`);
      
      const cnMatch = filterStr.match(/cn=([^)&|]+)/i);
      const cnFilter = cnMatch ? cnMatch[1].trim() : null;
      const isWildcard = cnFilter === '*';
      
      const users = await directoryProvider.getAllUsers();
      this.logger.debug(`[${realmName}] Found ${users.length} users for mixed search`);
      
      for (const user of users) {
        if (cnFilter && !isWildcard) {
          const userCn = user.firstname && user.lastname 
            ? `${user.firstname} ${user.lastname}`
            : user.username;
          if (userCn.toLowerCase() !== cnFilter.toLowerCase()) {
            continue;
          }
        }
        
        const entry = createLdapEntry(user, baseDn);
        entries.push({ entry, type: 'user' });
      }

      const groups = await directoryProvider.getAllGroups();
      this.logger.debug(`[${realmName}] Found ${groups.length} groups for mixed search`);
      
      for (const group of groups) {
        if (cnFilter && !isWildcard && group.name.toLowerCase() !== cnFilter.toLowerCase()) {
          continue;
        }
        
        const entry = createLdapGroupEntry(group, baseDn);
        entries.push({ entry, type: 'group' });
      }
      return { entries, realmName };
    }

    this.logger.debug(`[${realmName}] No matching search pattern found for filter: ${filterStr}`);
    return { entries, realmName };
  }

  /**
   * Extract credentials from bind request
   * @private
   */
  _extractCredentials(req) {
    const { extractCredentials } = require('./utils/filterUtils');
    return extractCredentials(req);
  }

  _handleRootDSE(req, res, next) {
    const filterStr = req.filter.toString();
    const scope = req.scope;
    const requestedAttrs = req.attributes || [];
    this.logger.debug(`RootDSE Search - Filter: ${filterStr}, Scope: ${scope}, Attributes: ${JSON.stringify(requestedAttrs)}`);

    try {
      // Check scope - ldapjs uses numeric constants: 0='base', 1='one', 2='sub'
      if (scope === 'base' || scope === 0) {
        this.emit('rootDSERequest', { filter: filterStr, attributes: requestedAttrs });
        
        // Collect unique baseDNs (preserving original casing from realm config)
        const seenDns = new Set();
        const allBaseDns = [];
        for (const realm of this.allRealms) {
          const key = realm.baseDn.toLowerCase();
          if (!seenDns.has(key)) {
            seenDns.add(key);
            allBaseDns.push(realm.baseDn);
          }
        }
        
        // RootDSE attribute filtering rules (per RFC 4512)
        const hasWildcard = requestedAttrs.includes('*');
        const hasPlus = requestedAttrs.includes('+');
        
        const attributes = {
          objectClass: ['top']
        };
        
        if (hasWildcard && !hasPlus) {
          requestedAttrs.forEach(attr => {
            const attrLower = attr.toLowerCase();
            if (attrLower === 'namingcontexts') {
              attributes.namingContexts = allBaseDns;
            } else if (attrLower === 'supportedldapversion') {
              attributes.supportedLDAPVersion = ['3'];
            }
          });
        } else {
          attributes.namingContexts = allBaseDns;
          attributes.supportedLDAPVersion = ['3'];
        }
        
        const rootDSEEntry = {
          dn: '',
          attributes
        };

        // Work around ldapjs attribute filtering:
        // ldapjs filters attributes based on the requested attributes list.
        // When '+' is requested, we need to replace it with actual operational attribute names.
        // When specific attributes are requested, ensure they're in the list (in lowercase).
        if (hasPlus && !hasWildcard) {
          // Replace '+' with actual operational attribute names (lowercase for ldapjs matching)
          const idx = res.attributes.indexOf('+');
          if (idx !== -1) {
            res.attributes.splice(idx, 1, 'namingcontexts', 'supportedldapversion');
          }
        } else if (requestedAttrs.length > 0 && !hasWildcard) {
          // For specific attribute requests, add them to res.attributes in lowercase
          requestedAttrs.forEach(attr => {
            const attrLower = attr.toLowerCase();
            if (attrLower !== '+' && attrLower !== '*' && res.attributes.indexOf(attrLower) === -1) {
              res.attributes.push(attrLower);
            }
          });
        }

        res.send(rootDSEEntry);
        this.logger.debug('RootDSE entry sent');
        this.emit('rootDSEResponse', { entry: rootDSEEntry });
      }
      
      res.end();
      return next();
    } catch (error) {
      this.logger.error("RootDSE search error", { error, filter: filterStr });
      const { normalizeSearchError } = require('./utils/errorUtils');
      const normalizedError = normalizeSearchError(error);
      this.emit('rootDSEError', { error: normalizedError });
      return next(normalizedError);
    }
  }
}

module.exports = LdapEngine;
