/**
 * Example: JSON File-Based Directory Backend
 * 
 * This example shows how to create a custom directory backend
 * that reads user and group data from JSON files.
 * 
 * Setup:
 * 1. Rename this file (remove .example.js, e.g., json-directory.js)
 * 2. Create users.json and groups.json files
 * 3. Set DIRECTORY_BACKEND=json-directory in your .env file
 * 4. Set JSON_USERS_PATH and JSON_GROUPS_PATH environment variables
 * 5. Restart the server
 * 
 * Example users.json:
 * [
 *   {
 *     "uid": "jdoe",
 *     "cn": "John Doe",
 *     "mail": "jdoe@example.com",
 *     "uidNumber": 1001,
 *     "gidNumber": 1000,
 *     "homeDirectory": "/home/jdoe",
 *     "loginShell": "/bin/bash"
 *   }
 * ]
 * 
 * Example groups.json:
 * [
 *   {
 *     "cn": "developers",
 *     "gidNumber": 1000,
 *     "memberUid": ["jdoe", "asmith"]
 *   }
 * ]
 */

const { DirectoryProvider } = require('@ldap-gateway/core');
const fs = require('fs');
const path = require('path');

class JsonDirectoryBackend extends DirectoryProvider {
  constructor(options = {}) {
    super();
    
    // Load configuration from environment
    this.usersPath = process.env.JSON_USERS_PATH || path.join(process.cwd(), 'users.json');
    this.groupsPath = process.env.JSON_GROUPS_PATH || path.join(process.cwd(), 'groups.json');
    
    // Cache for loaded data
    this.usersCache = null;
    this.groupsCache = null;
    this.lastLoad = null;
    
    // Cache duration (5 minutes)
    this.cacheDuration = parseInt(process.env.JSON_CACHE_DURATION || '300000', 10);
    
    console.log(`[JsonDirectoryBackend] Initialized with users: ${this.usersPath}, groups: ${this.groupsPath}`);
  }

  /**
   * Load users from JSON file
   * @private
   */
  loadUsers() {
    try {
      // Check cache
      if (this.usersCache && this.lastLoad && 
          (Date.now() - this.lastLoad) < this.cacheDuration) {
        return this.usersCache;
      }
      
      if (!fs.existsSync(this.usersPath)) {
        console.warn(`[JsonDirectoryBackend] Users file not found: ${this.usersPath}`);
        return [];
      }
      
      const data = fs.readFileSync(this.usersPath, 'utf8');
      this.usersCache = JSON.parse(data);
      this.lastLoad = Date.now();
      
      console.log(`[JsonDirectoryBackend] Loaded ${this.usersCache.length} users`);
      return this.usersCache;
    } catch (error) {
      console.error('[JsonDirectoryBackend] Error loading users:', error.message);
      return [];
    }
  }

  /**
   * Load groups from JSON file
   * @private
   */
  loadGroups() {
    try {
      // Check cache
      if (this.groupsCache && this.lastLoad && 
          (Date.now() - this.lastLoad) < this.cacheDuration) {
        return this.groupsCache;
      }
      
      if (!fs.existsSync(this.groupsPath)) {
        console.warn(`[JsonDirectoryBackend] Groups file not found: ${this.groupsPath}`);
        return [];
      }
      
      const data = fs.readFileSync(this.groupsPath, 'utf8');
      this.groupsCache = JSON.parse(data);
      
      console.log(`[JsonDirectoryBackend] Loaded ${this.groupsCache.length} groups`);
      return this.groupsCache;
    } catch (error) {
      console.error('[JsonDirectoryBackend] Error loading groups:', error.message);
      return [];
    }
  }

  /**
   * Find a specific user by username
   * @param {string} username - Username to search for
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findUser(username) {
    try {
      const users = this.loadUsers();
      const user = users.find(u => u.uid === username);
      
      if (!user) {
        console.log(`[JsonDirectoryBackend] User not found: ${username}`);
        return null;
      }
      
      console.log(`[JsonDirectoryBackend] Found user: ${username}`);
      return user;
    } catch (error) {
      console.error('[JsonDirectoryBackend] Error finding user:', error);
      return null;
    }
  }

  /**
   * Get all users in the directory
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsers() {
    try {
      const users = this.loadUsers();
      console.log(`[JsonDirectoryBackend] Returning ${users.length} users`);
      return users;
    } catch (error) {
      console.error('[JsonDirectoryBackend] Error getting all users:', error);
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
      const groups = this.loadGroups();
      
      // For simplicity, return all groups
      // In a real implementation, you would parse and apply the filter
      console.log(`[JsonDirectoryBackend] Returning ${groups.length} groups (filter not applied)`);
      return groups;
    } catch (error) {
      console.error('[JsonDirectoryBackend] Error finding groups:', error);
      return [];
    }
  }

  /**
   * Get all groups in the directory
   * @returns {Promise<Array>} Array of group objects
   */
  async getAllGroups() {
    try {
      const groups = this.loadGroups();
      console.log(`[JsonDirectoryBackend] Returning ${groups.length} groups`);
      return groups;
    } catch (error) {
      console.error('[JsonDirectoryBackend] Error getting all groups:', error);
      return [];
    }
  }

  /**
   * Invalidate cache (useful for testing or reload operations)
   */
  invalidateCache() {
    this.usersCache = null;
    this.groupsCache = null;
    this.lastLoad = null;
    console.log('[JsonDirectoryBackend] Cache invalidated');
  }
}

// Export the backend
module.exports = {
  name: 'json-directory',
  type: 'directory',
  provider: JsonDirectoryBackend
};
