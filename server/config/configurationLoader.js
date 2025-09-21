const fs = require('fs');
const path = require('path');
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
   * @returns {Object} Combined configuration object
   */
  loadConfig() {
    if (this.loaded) {
      return this.config;
    }

    // Search order for .env files
    const envPaths = [
      path.join(process.cwd(), '.env'),
      '/etc/ldap-gateway/.env'
    ];

    // Try to load .env files in order
    for (const envPath of envPaths) {
      if (this._loadEnvFile(envPath)) {
        logger.info(`Loaded configuration from: ${envPath}`);
        break;
      }
    }

    // Build configuration object from environment variables
    this.config = this._buildConfigFromEnv();
    this.loaded = true;

    return this.config;
  }

  /**
   * Load environment file if it exists
   * @private
   */
  _loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      require('dotenv').config({ path: filePath });
      return true;
    } catch (error) {
      logger.warn(`Failed to load env file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Build configuration object from environment variables
   * @private
   */
  _buildConfigFromEnv() {
    const { AUTHENTICATION_BACKEND } = require('../constants/constants');

    return {
      authBackend: process.env.AUTH_BACKEND || AUTHENTICATION_BACKEND.DATABASE,
      directoryBackend: process.env.DIRECTORY_BACKEND || 'db',
      commonName: process.env.LDAP_COMMON_NAME || 'localhost',
      ldapBaseDn: process.env.LDAP_BASE_DN || this._buildBaseDnFromCommonName(),
      ldapPort: process.env.LDAP_PORT || null,
      ldapCertPath: process.env.LDAP_CERT_PATH || null,
      ldapKeyPath: process.env.LDAP_KEY_PATH || null,
      ldapCertContent: process.env.LDAP_CERT_CONTENT || null,
      ldapKeyContent: process.env.LDAP_KEY_CONTENT || null,
      proxmoxUserCfg: process.env.PROXMOX_USER_CFG || null,
      proxmoxShadowCfg: process.env.PROXMOX_SHADOW_CFG || null,
      enableNotification: process.env.ENABLE_NOTIFICATION === 'true',
      unencrypted: process.env.LDAP_UNENCRYPTED === 'true' || process.env.LDAP_UNENCRYPTED === '1'
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
   * Get a specific configuration value
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    if (!this.loaded) {
      this.loadConfig();
    }
    return this.config[key];
  }

  /**
   * Get all configuration
   * @returns {Object} All configuration
   */
  getAll() {
    if (!this.loaded) {
      this.loadConfig();
    }
    return { ...this.config };
  }
}

// Export singleton instance
module.exports = new ConfigurationLoader();