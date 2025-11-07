const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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

    // Build configuration object from environment variables
    require('dotenv').config(); // Load .env from current directory if exists
    this.config = this._buildConfigFromEnv();
    this.loaded = true;

    return this.config;
  }

  /**
   * Build configuration object from environment variables
   * @private
   */
  _buildConfigFromEnv() {
    return {
      authBackend: process.env.AUTH_BACKENDS.split(','),
      directoryBackend: process.env.DIRECTORY_BACKEND,
      commonName: process.env.LDAP_COMMON_NAME || 'localhost',
      ldapBaseDn: process.env.LDAP_BASE_DN || this._buildBaseDnFromCommonName(),
      port: process.env.PORT || process.env.LDAP_UNENCRYPTED === 'true' ? 636 : 389,
      bindIp: process.env.BIND_IP || '127.0.0.1',
      unencrypted: process.env.LDAP_UNENCRYPTED === 'true' || process.env.LDAP_UNENCRYPTED === '1',
      backendDir: process.env.BACKEND_DIR || null,
      // Load certificates - this handles all certificate logic
      ...this._loadCertificates()
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
   * Load SSL/TLS certificates (handles all certificate logic)
   * @private
   */
  _loadCertificates() {
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
        const createdCerts = this._createCertificates();
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
   * Create self-signed certificates
   * @private
   */
  _createCertificates() {
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

      // Use the configured common name directly
      const commonName = process.env.LDAP_COMMON_NAME || 'localhost';

      // Create self-signed certificate
      const opensslCmd = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=${commonName}"`;
      
      execSync(opensslCmd, { stdio: 'pipe' });

      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        logger.info('Self-signed certificates created successfully');
        return { certPath, keyPath };
      } else {
        throw new Error('Certificate files were not created');
      }
    } catch (error) {
      logger.error('Failed to create certificates:', error.message);
      logger.error('Please ensure OpenSSL is installed and available in PATH');
      process.exit(1);
    }
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
module.exports = ConfigurationLoader;