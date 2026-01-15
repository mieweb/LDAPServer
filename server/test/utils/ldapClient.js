// LDAP Client Test Utility
// 
// Wrapper around ldapjs client for testing LDAP operations
// Provides promise-based API and automatic cleanup

const ldap = require('ldapjs');

class LdapTestClient {
  constructor(options = {}) {
    this.url = options.url || 'ldap://localhost:3890';
    this.timeout = options.timeout || 5000;
    this.client = null;
    this.bound = false;
  }

  // Connect to LDAP server
  async connect() {
    return new Promise((resolve, reject) => {
      this.client = ldap.createClient({
        url: this.url,
        timeout: this.timeout,
        connectTimeout: this.timeout,
        tlsOptions: {
          rejectUnauthorized: false // For test certificates
        }
      });

      this.client.on('connect', () => {
        resolve();
      });

      this.client.on('error', (err) => {
        reject(err);
      });

      this.client.on('connectError', (err) => {
        reject(err);
      });
    });
  }

  /**
   * Bind (authenticate) to LDAP server
   * @param {string} dn - Distinguished name (e.g., "uid=testuser,dc=example,dc=com")
   * @param {string} password - Password
   * @returns {Promise<void>}
   */
  async bind(dn, password) {
    if (!this.client) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.client.bind(dn, password, (err) => {
        if (err) {
          this.bound = false;
          reject(err);
        } else {
          this.bound = true;
          resolve();
        }
      });
    });
  }

  /**
   * Search LDAP directory
   * @param {string} base - Base DN for search
   * @param {Object} options - Search options
   * @param {string} options.filter - LDAP filter (e.g., "(uid=testuser)")
   * @param {string} options.scope - Search scope ('base', 'one', 'sub')
   * @param {Array} options.attributes - Attributes to return
   * @returns {Promise<Array>} Array of search results
   */
  async search(base, options = {}) {
    if (!this.client) {
      await this.connect();
    }

    const searchOptions = {
      filter: options.filter || '(objectClass=*)',
      scope: options.scope || 'sub',
      attributes: options.attributes || [],
      timeLimit: options.timeLimit || 10,
      sizeLimit: options.sizeLimit || 100
    };

    return new Promise((resolve, reject) => {
      const entries = [];

      this.client.search(base, searchOptions, (err, res) => {
        if (err) {
          return reject(err);
        }

        res.on('searchEntry', (entry) => {
          entries.push({
            dn: entry.objectName.toString(),
            attributes: entry.attributes.reduce((acc, attr) => {
              // Handle multi-value attributes
              const values = attr.values || attr.vals || [];
              acc[attr.type] = values.length === 1 ? values[0] : values;
              return acc;
            }, {})
          });
        });

        res.on('error', (err) => {
          reject(err);
        });

        res.on('end', (result) => {
          if (result.status !== 0) {
            reject(new Error(`Search failed with status ${result.status}`));
          } else {
            resolve(entries);
          }
        });
      });
    });
  }

  // Unbind and disconnect from LDAP server
  async unbind() {
    if (!this.client) {
      return;
    }

    return new Promise((resolve) => {
      this.client.unbind((err) => {
        this.bound = false;
        this.client = null;
        // Ignore unbind errors
        resolve();
      });
    });
  }

  // Check if client is bound (authenticated)
  isBound() {
    return this.bound;
  }

  // Destroy client connection (for cleanup)
  async destroy() {
    if (this.client) {
      try {
        await this.unbind();
      } catch (err) {
        // Ignore errors during cleanup
      }
    }
    this.client = null;
    this.bound = false;
  }
}

module.exports = LdapTestClient;
