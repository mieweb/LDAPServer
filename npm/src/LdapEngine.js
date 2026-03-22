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
 * with a baseDN. Each baseDN maps to exactly one realm (1:1). Searches and binds
 * are routed by baseDN to the owning realm.
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
    
    this.logger = options.logger || console;

    // Build realm data structures
    this._initRealms(options);

    // Legacy single-provider refs (for backward compat in tests/external code)
    this.authProviders = options.authProviders || this.allRealms[0]?.authProviders;
    this.directoryProvider = options.directoryProvider || this.allRealms[0]?.directoryProvider;

    // Default realm for RootDSE defaultNamingContext (SSSD discovery)
    this.defaultRealm = options.defaultRealm || this.allRealms[0] || null;

    this.server = null;
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
        authProviders: r.authProviders || [],
        // Explicit map of backend type name → provider instance for per-user auth override
        authBackendTypes: r.authBackendTypes || new Map()
      }));
    } else if (options.authProviders && options.directoryProvider) {
      // Legacy single-realm mode: wrap into one implicit realm
      const baseDn = options.baseDn || 'dc=localhost';
      this.allRealms = [{
        name: 'default',
        baseDn,
        directoryProvider: options.directoryProvider,
        authProviders: options.authProviders,
        authBackendTypes: options.authBackendTypes || new Map()
      }];
    } else {
      this.allRealms = [];
    }

    // Warn about realms with auth providers but no type map (per-user overrides won't work)
    for (const realm of this.allRealms) {
      if (realm.authProviders.length > 0 && realm.authBackendTypes.size === 0) {
        this.logger.warn(
          `Realm '${realm.name}' has auth providers but no authBackendTypes map — per-user auth overrides will not work`
        );
      }
    }

    // Index realms by baseDN (lowercased) — each baseDN maps to exactly one realm
    this.realmsByBaseDn = new Map();
    for (const realm of this.allRealms) {
      const key = realm.baseDn.toLowerCase();
      if (this.realmsByBaseDn.has(key)) {
        const existing = this.realmsByBaseDn.get(key);
        throw new Error(
          `Duplicate baseDN '${realm.baseDn}': realm '${realm.name}' conflicts with realm '${existing.name}'. ` +
          `Each baseDN must map to exactly one realm.`
        );
      }
      this.realmsByBaseDn.set(key, realm);
    }
  }

  /**
   * Initialize and start the LDAP server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.allRealms.length === 0) {
      throw new Error(
        'Cannot start LDAP server: no realms configured. ' +
        'Provide either a realms array or authProviders/directoryProvider.'
      );
    }

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

    // Register one bind handler per baseDN (1:1 with realm)
    for (const [baseDn, realm] of this.realmsByBaseDn) {
      this.server.bind(baseDn, (req, res, next) => {
        const { username, password } = this._extractCredentials(req);
        this.logger.debug("Authenticated bind request", { username, dn: req.dn.toString() });

        this.emit('bindRequest', { username, anonymous: false });

        this._authenticateInRealm(realm, username, password, req)
          .then(({ authenticated }) => {
            if (!authenticated) {
              this.emit('bindFail', { username, reason: 'invalid_credentials' });
              const error = new ldap.InvalidCredentialsError('Invalid credentials');
              return next(error);
            }

            this.logger.debug(`User ${username} authenticated via realm '${realm.name}'`);
            this.emit('bindSuccess', { username, anonymous: false, realm: realm.name });
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
   * Authenticate a user within a single realm.
   * Looks up the user in the realm's directory, resolves the auth chain
   * (per-user override or realm default), and authenticates sequentially.
   * 
   * @private
   * @param {Object} realm - The realm to authenticate against
   * @param {string} username
   * @param {string} password
   * @param {Object} req - LDAP request
   * @returns {Promise<{authenticated: boolean}>}
   */
  async _authenticateInRealm(realm, username, password, req) {
    let user;
    try {
      user = await realm.directoryProvider.findUser(username);
    } catch (err) {
      this.logger.error(`Error finding user '${username}' in realm '${realm.name}':`, err);
      return { authenticated: false };
    }

    if (!user) {
      this.logger.debug(`User '${username}' not found in realm '${realm.name}'`);
      return { authenticated: false };
    }

    // Resolve the auth chain: per-user override or realm default
    const authChain = this._resolveAuthChain(realm, user, username);

    // Reject auth if no providers are configured (directory-only realm)
    if (authChain.length === 0) {
      this.logger.warn(`Realm '${realm.name}' has no auth providers configured — rejecting bind for '${username}'`);
      return { authenticated: false };
    }

    // Authenticate sequentially against the resolved auth chain
    for (const provider of authChain) {
      const result = await provider.authenticate(username, password, req);
      if (result !== true) {
        return { authenticated: false };
      }
    }

    return { authenticated: true };
  }

  /**
   * Resolve the auth provider chain for a user.
   * 
   * If the user record has an `auth_backends` field (comma-separated provider
   * type names), look up each name in the realm's authBackendTypes map.
   * If `auth_backends` is null/undefined/empty, fall back to the realm's
   * default auth providers.
   * 
   * Resolution is strictly realm-scoped — if a backend name cannot be resolved
   * within the realm, authentication fails immediately.
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

    // Resolve each name strictly from the realm's auth backend types
    const overrideChain = [];
    for (const name of backendNames) {
      const normalizedName = name.toLowerCase();
      const provider = realm.authBackendTypes.get(normalizedName);
      
      if (!provider) {
        this.logger.error(
          `User '${username}' has auth_backends='${userBackends}' but backend '${normalizedName}' ` +
          `is not found in realm '${realm.name}' (available: [${[...realm.authBackendTypes.keys()].join(', ')}]). ` +
          `Failing authentication for security.`
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

    // Register one search handler per baseDN (1:1 with realm)
    for (const [baseDn, realm] of this.realmsByBaseDn) {
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
          
          entryCount = await this._handleRealmSearch(realm, filterStr, req.attributes, res);
          
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
   * Handle search operations for a single realm and send results.
   * @private
   * @param {Object} realm - Realm object with directoryProvider and baseDn
   * @param {string} filterStr - LDAP filter string
   * @param {Array} attributes - Requested attributes
   * @param {Object} res - ldapjs response object
   * @returns {number} Number of entries sent
   */
  async _handleRealmSearch(realm, filterStr, attributes, res) {
    const { directoryProvider, baseDn, name: realmName } = realm;
    const username = getUsernameFromFilter(filterStr);
    let entryCount = 0;

    const sendEntry = (entry, type) => {
      this.emit('entryFound', { type, entry: entry.dn, realm: realmName });
      res.send(entry);
      entryCount++;
    };

    // Handle specific user requests
    if (username) {
      this.logger.debug(`[${realmName}] Searching for specific user: ${username}`);
      const user = await directoryProvider.findUser(username);
      if (user) {
        sendEntry(createLdapEntry(user, baseDn), 'user');
      }
      return entryCount;
    }

    // Handle all users requests
    if (isAllUsersRequest(filterStr, attributes)) {
      this.logger.debug(`[${realmName}] Searching for all users with filter: ${filterStr}`);
      const users = await directoryProvider.getAllUsers();
      this.logger.debug(`[${realmName}] Found ${users.length} users`);
      
      for (const user of users) {
        sendEntry(createLdapEntry(user, baseDn), 'user');
      }
      return entryCount;
    }

    // Handle group search requests
    if (isGroupSearchRequest(filterStr, attributes)) {
      this.logger.debug(`[${realmName}] Searching for groups with filter: ${filterStr}`);
      const groups = await directoryProvider.findGroups(filterStr);
      this.logger.debug(`[${realmName}] Found ${groups.length} groups`);
      
      for (const group of groups) {
        sendEntry(createLdapGroupEntry(group, baseDn), 'group');
      }
      return entryCount;
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
        
        sendEntry(createLdapEntry(user, baseDn), 'user');
      }

      const groups = await directoryProvider.getAllGroups();
      this.logger.debug(`[${realmName}] Found ${groups.length} groups for mixed search`);
      
      for (const group of groups) {
        if (cnFilter && !isWildcard && group.name.toLowerCase() !== cnFilter.toLowerCase()) {
          continue;
        }
        
        sendEntry(createLdapGroupEntry(group, baseDn), 'group');
      }
      return entryCount;
    }

    this.logger.debug(`[${realmName}] No matching search pattern found for filter: ${filterStr}`);
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
        const allBaseDns = this.allRealms.map(r => r.baseDn);
        const defaultBaseDn = this.defaultRealm ? this.defaultRealm.baseDn : allBaseDns[0];
        
        // RootDSE attribute filtering rules (per RFC 4512):
        // - No attributes requested = return all (user + operational)
        // - '*' + '+' = all user and operational attributes
        // - '+' only = operational attributes only
        // - '*' only = user attrs + specifically requested operational attrs
        // - Specific names only = only those attributes
        const hasWildcard = requestedAttrs.includes('*');
        const hasPlus = requestedAttrs.includes('+');
        const noAttrsRequested = requestedAttrs.length === 0;

        // Helper to populate operational attributes into the attributes object
        const addOperationalAttr = (attrLower, attributes) => {
          if (attrLower === 'namingcontexts') {
            attributes.namingContexts = allBaseDns;
          } else if (attrLower === 'defaultnamingcontext' && defaultBaseDn) {
            attributes.defaultNamingContext = defaultBaseDn;
          } else if (attrLower === 'supportedldapversion') {
            attributes.supportedLDAPVersion = ['3'];
          }
        };
        
        const attributes = {
          objectClass: ['top']
        };
        
        if (noAttrsRequested || (hasWildcard && hasPlus) || (hasPlus && !hasWildcard)) {
          // Return all operational attributes
          attributes.namingContexts = allBaseDns;
          if (defaultBaseDn) {
            attributes.defaultNamingContext = defaultBaseDn;
          }
          attributes.supportedLDAPVersion = ['3'];
        } else if (hasWildcard) {
          // '*' only: user attrs + specifically requested operational attrs
          requestedAttrs.forEach(attr => addOperationalAttr(attr.toLowerCase(), attributes));
        } else {
          // Specific attributes only — return only what was requested
          requestedAttrs.forEach(attr => addOperationalAttr(attr.toLowerCase(), attributes));
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
            res.attributes.splice(idx, 1, 'namingcontexts', 'defaultnamingcontext', 'supportedldapversion');
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
