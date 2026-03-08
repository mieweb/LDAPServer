const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const logger = require('../utils/logger');

/**
 * Configuration loader with standardized search order
 * Searches for .env files in:
 * 1. Current working directory
 * 2. /etc/ldap-gateway/.env
 * 3. Process environment variables
 */
class ConfigurationLoader {
  constructor() {
    this.config = {};
    this.loaded = false;
  }

  /**
   * Load configuration from various sources
   * @returns {Promise<Object>} Combined configuration object
   */
  async loadConfig() {
    if (this.loaded) {
      return this.config;
    }

    // Build configuration object from environment variables
    require('dotenv').config(); // Load .env from current directory if exists
    this.config = await this._buildConfigFromEnv();
    this.loaded = true;

    return this.config;
  }

  /**
   * Build configuration object from environment variables
   * @private
   */
  async _buildConfigFromEnv() {
    return {
      authBackends: process.env.AUTH_BACKENDS.split(','),
      directoryBackend: process.env.DIRECTORY_BACKEND,
      commonName: process.env.LDAP_COMMON_NAME || 'localhost',
      ldapBaseDn: process.env.LDAP_BASE_DN || this._buildBaseDnFromCommonName(),
      port: process.env.PORT || (process.env.LDAP_UNENCRYPTED === 'true' ? 389 : 636),
      bindIp: process.env.BIND_IP || '0.0.0.0',
      unencrypted: process.env.LDAP_UNENCRYPTED === 'true' || process.env.LDAP_UNENCRYPTED === '1',
      backendDir: process.env.BACKEND_DIR || null,
      requireAuthForSearch: process.env.REQUIRE_AUTH_FOR_SEARCH !== 'false',
      // Load realm configuration (null if not configured)
      realms: this._loadRealmConfig(),
      // Load certificates - this handles all certificate logic
      ...(await this._loadCertificates()),
      // Load TLS configuration
      ...this._loadTlsConfig()
    };
  }

  /**
   * Build LDAP Base DN from common name
   * @private
   */
  _buildBaseDnFromCommonName() {
    const commonName = process.env.LDAP_COMMON_NAME || 'localhost';
    if (commonName === 'localhost') {
      return 'dc=localhost';
    }
    return commonName.split('.').map(part => `dc=${part}`).join(',');
  }

  /**
   * Load realm configuration from REALM_CONFIG env var.
   * Supports both inline JSON strings and file paths.
   * Returns null if REALM_CONFIG is not set (single-realm backward compat).
   * @private
   * @returns {Array|null} Array of realm config objects or null
   */
  _loadRealmConfig() {
    const realmConfigValue = process.env.REALM_CONFIG;
    if (!realmConfigValue) {
      return null;
    }

    let realms;
    const trimmed = realmConfigValue.trim();

    // Try inline JSON first (starts with [ for an array)
    if (trimmed.startsWith('[')) {
      try {
        realms = JSON.parse(trimmed);
      } catch (err) {
        logger.error(`Failed to parse REALM_CONFIG as JSON: ${err.message}`);
        throw new Error(`Invalid REALM_CONFIG JSON: ${err.message}`);
      }
    } else {
      // Treat as file path
      const filePath = path.resolve(trimmed);
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        realms = JSON.parse(content);
      } catch (err) {
        logger.error(`Failed to load REALM_CONFIG from file '${filePath}': ${err.message}`);
        throw new Error(`Failed to load REALM_CONFIG from '${filePath}': ${err.message}`);
      }
    }

    // Validate realm config
    this._validateRealmConfig(realms);
    logger.info(`Loaded ${realms.length} realm(s) from REALM_CONFIG`);
    return realms;
  }

  /**
   * Validate realm configuration array.
   * @private
   * @param {*} realms - Parsed realm configuration
   * @throws {Error} If validation fails
   */
  _validateRealmConfig(realms) {
    if (!Array.isArray(realms)) {
      throw new Error('REALM_CONFIG must be a JSON array of realm objects');
    }

    if (realms.length === 0) {
      throw new Error('REALM_CONFIG must contain at least one realm');
    }

    const names = new Set();
    for (let i = 0; i < realms.length; i++) {
      const realm = realms[i];
      const prefix = `REALM_CONFIG[${i}]`;

      if (!realm || typeof realm !== 'object') {
        throw new Error(`${prefix}: must be an object`);
      }

      if (!realm.name || typeof realm.name !== 'string') {
        throw new Error(`${prefix}: 'name' is required and must be a string`);
      }

      if (names.has(realm.name)) {
        throw new Error(`${prefix}: duplicate realm name '${realm.name}'`);
      }
      names.add(realm.name);

      if (!realm.baseDn || typeof realm.baseDn !== 'string') {
        throw new Error(`${prefix} (${realm.name}): 'baseDn' is required and must be a string`);
      }

      if (!realm.directory || typeof realm.directory !== 'object') {
        throw new Error(`${prefix} (${realm.name}): 'directory' is required and must be an object`);
      }

      if (!realm.directory.backend || typeof realm.directory.backend !== 'string') {
        throw new Error(`${prefix} (${realm.name}): 'directory.backend' is required`);
      }

      if (!realm.auth) {
        throw new Error(`${prefix} (${realm.name}): 'auth' is required`);
      }

      if (!Array.isArray(realm.auth.backends) || realm.auth.backends.length === 0) {
        throw new Error(`${prefix} (${realm.name}): 'auth.backends' must be a non-empty array`);
      }

      for (let j = 0; j < realm.auth.backends.length; j++) {
        const backend = realm.auth.backends[j];
        if (!backend || typeof backend !== 'object') {
          throw new Error(`${prefix} (${realm.name}): 'auth.backends[${j}]' must be an object`);
        }
        if (!backend.type || typeof backend.type !== 'string') {
          throw new Error(`${prefix} (${realm.name}): 'auth.backends[${j}].type' is required`);
        }
      }

      logger.info(`Realm '${realm.name}' configured with baseDN '${realm.baseDn}', ` +
        `directory: ${realm.directory.backend}, auth: [${realm.auth.backends.map(b => b.type).join(', ')}]`);
    }
  }

  /**
   * Load SSL/TLS certificates (handles all certificate logic)
   * @private
   */
  async _loadCertificates() {
    // If unencrypted mode is explicitly enabled, return null values
    if (process.env.LDAP_UNENCRYPTED === 'true' || process.env.LDAP_UNENCRYPTED === '1') {
      logger.warn('LDAP server configured for unencrypted mode - SSL/TLS disabled');
      return { 
        certContent: null, 
        keyContent: null 
      };
    }

    let certContent = process.env.LDAP_CERT_CONTENT || null;
    let keyContent = process.env.LDAP_KEY_CONTENT || null;

    // If certificate content is not provided, try to load from paths
    if (!certContent || !keyContent) {
      let certPath = process.env.LDAP_CERT_PATH;
      let keyPath = process.env.LDAP_KEY_PATH;

      // If paths are not provided, create certificates
      if (!certPath || !keyPath) {
        const createdCerts = await this._createCertificates();
        certPath = createdCerts.certPath;
        keyPath = createdCerts.keyPath;
      }

      try {
        if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
          throw new Error(`Certificate files not found: ${certPath}, ${keyPath}`);
        }

        certContent = fs.readFileSync(certPath, 'utf8');
        keyContent = fs.readFileSync(keyPath, 'utf8');
        logger.info('Certificates loaded from files');
      } catch (error) {
        logger.error('Failed to load certificates:', error.message);
        process.exit(1);
      }
    }

    return { certContent, keyContent };
  }

  /**
   * Load TLS configuration options
   * @private
   */
  _loadTlsConfig() {
    const validVersions = ['TLSv1.2', 'TLSv1.3'];
    
    // Parse TLS minimum version
    let tlsMinVersion = null;
    if (process.env.TLS_MIN_VERSION) {
      const minVersion = process.env.TLS_MIN_VERSION.trim();
      if (validVersions.includes(minVersion)) {
        tlsMinVersion = minVersion;
      } else {
        logger.warn(`Invalid TLS_MIN_VERSION: ${minVersion}. Valid options: ${validVersions.join(', ')}`);
      }
    }

    // Parse TLS maximum version
    let tlsMaxVersion = null;
    if (process.env.TLS_MAX_VERSION) {
      const maxVersion = process.env.TLS_MAX_VERSION.trim();
      if (validVersions.includes(maxVersion)) {
        tlsMaxVersion = maxVersion;
      } else {
        logger.warn(`Invalid TLS_MAX_VERSION: ${maxVersion}. Valid options: ${validVersions.join(', ')}`);
      }
    }

    // Validate version order (min <= max)
    if (tlsMinVersion && tlsMaxVersion) {
      const minIdx = validVersions.indexOf(tlsMinVersion);
      const maxIdx = validVersions.indexOf(tlsMaxVersion);
      if (minIdx > maxIdx) {
        logger.warn(`TLS_MIN_VERSION (${tlsMinVersion}) is greater than TLS_MAX_VERSION (${tlsMaxVersion}). Using defaults.`);
        tlsMinVersion = null;
        tlsMaxVersion = null;
      }
    }

    // Parse and validate TLS ciphers
    let tlsCiphers = null;
    if (process.env.TLS_CIPHERS) {
      const cipherString = process.env.TLS_CIPHERS.trim();
      if (cipherString === '') {
        tlsCiphers = null;
      } else {
        // Validate cipher string by testing it with Node.js TLS
        const validation = this._validateCipherString(cipherString);
        if (validation.valid) {
          tlsCiphers = cipherString;
        } else {
          logger.warn(`Invalid TLS_CIPHERS: ${cipherString}. Error: ${validation.error}. Using Node.js defaults.`);
          tlsCiphers = null;
        }
      }
    }

    return { tlsMinVersion, tlsMaxVersion, tlsCiphers };
  }

  /**
   * Validate a TLS cipher string
   * @private
   * @param {string} cipherString - The cipher string to validate
   * @returns {Object} { valid: boolean, error?: string }
   */
  _validateCipherString(cipherString) {
    try {
      const tls = require('tls');
      // Try to create a secure context with the cipher string
      tls.createSecureContext({
        ciphers: cipherString,
        minVersion: 'TLSv1.2' // Use a reasonable default for validation
      });
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Create self-signed certificates
   * @private
   */
  async _createCertificates() {
    const certDir = path.join(process.cwd(), 'cert');
    const certPath = path.join(certDir, 'server.crt');
    const keyPath = path.join(certDir, 'server.key');

    try {
      // Create cert directory if it doesn't exist
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
        logger.info(`Created certificate directory: ${certDir}`);
      }

      // Check if certificates already exist
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        logger.info('Certificates already exist, using existing ones');
        return { certPath, keyPath };
      }

      logger.info('Creating self-signed certificates...');

      const commonName = process.env.LDAP_COMMON_NAME || 'localhost';
      const attrs = [{ name: 'commonName', value: commonName }];
      const pems = await selfsigned.generate(attrs, {
        keySize: 4096,
        days: 3650,
        algorithm: 'sha256'
      });

      fs.writeFileSync(certPath, pems.cert);
      fs.writeFileSync(keyPath, pems.private);

      logger.info('Self-signed certificates created successfully');
      return { certPath, keyPath };
    } catch (error) {
      logger.error('Failed to create certificates:', error.message);
      process.exit(1);
    }
  }

  /**
   * Get a specific configuration value
   * @param {string} key - Configuration key
   * @returns {Promise<*>} Configuration value
   */
  async get(key) {
    if (!this.loaded) {
      await this.loadConfig();
    }
    return this.config[key];
  }

  /**
   * Get all configuration
   * @returns {Promise<Object>} All configuration
   */
  async getAll() {
    if (!this.loaded) {
      await this.loadConfig();
    }
    return { ...this.config };
  }
}

// Export singleton instance
module.exports = ConfigurationLoader;