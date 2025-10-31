/**
 * Backend Template
 * 
 * Copy this file to create your own custom backend provider.
 * Replace 'MyBackend' with your backend name.
 * 
 * For Authentication Backend: Implement authenticate() method
 * For Directory Backend: Implement findUser(), getAllUsers(), findGroups(), getAllGroups()
 */

const { AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');

// ============================================================================
// AUTHENTICATION BACKEND TEMPLATE
// ============================================================================

class MyAuthBackend extends AuthProvider {
  constructor(options = {}) {
    super();
    
    // Initialize your backend with options
    // Options may include: databaseService, ldapServerPool, or custom config
    this.options = options;
    
    // Access environment variables for configuration
    this.apiUrl = process.env.MY_API_URL;
    this.apiKey = process.env.MY_API_KEY;
    
    // Initialize any connections, clients, or state here
  }

  /**
   * Authenticate a user
   * @param {string} username - Username to authenticate
   * @param {string} password - Password to verify
   * @param {Object} req - LDAP request object (optional, for logging/context)
   * @returns {Promise<boolean>} True if authenticated, false otherwise
   */
  async authenticate(username, password, req) {
    try {
      // Implement your authentication logic here
      // Examples:
      // - Query an API
      // - Check a database
      // - Validate against a file
      // - Call an external service
      
      // Example: Simple validation
      if (!username || !password) {
        return false;
      }
      
      // Your authentication logic here...
      
      return true; // or false
    } catch (error) {
      console.error('[MyAuthBackend] Authentication error:', error);
      return false;
    }
  }
}

// ============================================================================
// DIRECTORY BACKEND TEMPLATE
// ============================================================================

class MyDirectoryBackend extends DirectoryProvider {
  constructor(options = {}) {
    super();
    
    this.options = options;
    
    // Access environment variables
    this.dataPath = process.env.MY_DATA_PATH;
    
    // Initialize your data source
  }

  /**
   * Find a specific user by username
   * @param {string} username - Username to search for
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findUser(username) {
    try {
      // Query your data source for the user
      
      // Return user in LDAP format
      return {
        uid: username,
        cn: 'Full Name',
        sn: 'Last Name',
        givenName: 'First Name',
        mail: `${username}@example.com`,
        uidNumber: 1000,
        gidNumber: 1000,
        homeDirectory: `/home/${username}`,
        loginShell: '/bin/bash'
      };
    } catch (error) {
      console.error('[MyDirectoryBackend] Error finding user:', error);
      return null;
    }
  }

  /**
   * Get all users in the directory
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsers() {
    try {
      // Fetch all users from your data source
      const users = [];
      
      // Return array of user objects
      return users;
    } catch (error) {
      console.error('[MyDirectoryBackend] Error getting all users:', error);
      return [];
    }
  }

  /**
   * Find groups matching a filter
   * @param {Object|string} filter - LDAP filter or parsed filter object
   * @returns {Promise<Array>} Array of group objects
   */
  async findGroups(filter) {
    try {
      // Parse filter if needed
      // For simple cases, you might just return all groups
      
      const groups = [];
      
      // Return array of group objects
      return groups;
    } catch (error) {
      console.error('[MyDirectoryBackend] Error finding groups:', error);
      return [];
    }
  }

  /**
   * Get all groups in the directory
   * @returns {Promise<Array>} Array of group objects
   */
  async getAllGroups() {
    try {
      // Fetch all groups from your data source
      
      const groups = [];
      
      // Return array of group objects in LDAP format
      // Example:
      // {
      //   cn: 'groupname',
      //   gidNumber: 1000,
      //   memberUid: ['user1', 'user2'],
      //   description: 'Group description'
      // }
      
      return groups;
    } catch (error) {
      console.error('[MyDirectoryBackend] Error getting all groups:', error);
      return [];
    }
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

// For Authentication Backend, export:
module.exports = {
  name: 'my-auth',           // Change this to your backend name
  type: 'auth',              // Keep as 'auth'
  provider: MyAuthBackend    // Your auth class
};

// For Directory Backend, export:
// module.exports = {
//   name: 'my-directory',      // Change this to your backend name
//   type: 'directory',         // Keep as 'directory'
//   provider: MyDirectoryBackend // Your directory class
// };

// You can only export one type per file (auth OR directory, not both)
