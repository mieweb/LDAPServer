const { DirectoryProvider, filterUtils } = require('@ldap-gateway/core');
const SqlDriverFactory = require('../db/drivers/sqlDriverFactory');
const logger = require('../utils/logger');

/**
 * Generic SQL Directory Provider
 * Handles user and group directory operations against SQL databases (MySQL, PostgreSQL, SQLite)
 */
class SQLDirectoryProvider extends DirectoryProvider {
  constructor() {
    super();
    
    // Get configuration from environment
    this.config = SqlDriverFactory.getConfigFromEnv();
    
    // Create appropriate driver
    this.driver = SqlDriverFactory.createDriver(this.config.driver, this.config);
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      logger.info(`[SQLDirectoryProvider] Initializing ${this.config.driver.toUpperCase()} connection...`);
      await this.driver.connect(this.config);
      this.initialized = true;
      logger.info(`[SQLDirectoryProvider] Connected to ${this.config.driver.toUpperCase()}: ${this.config.host || this.config.filename}/${this.config.database || ''}`);
    }
  }

  async findUser(username) {
    try {
      await this.initialize();
      
      logger.debug(`[SQLDirectoryProvider] Finding user: ${username}`);
      const user = await this.driver.findUserByUsername(username);
      
      if (user) {
        logger.debug(`[SQLDirectoryProvider] User found: ${username}`);
      } else {
        logger.debug(`[SQLDirectoryProvider] User not found: ${username}`);
      }
      
      return user;
      
    } catch (error) {
      logger.error(`[SQLDirectoryProvider] Error finding user ${username}:`, error);
      return null;
    }
  }

  async findGroups(filter) {
    try {
      await this.initialize();
      
      logger.debug(`[SQLDirectoryProvider] Finding groups with filter: ${filter}`);
      
      // Parse the filter to extract all conditions
      const filterConditions = filterUtils.parseGroupFilter(filter);
      logger.debug(`[SQLDirectoryProvider] Parsed filter conditions:`, filterConditions);
      
      // If memberUid filter is present, use optimized query (skip wildcards)
      if (filterConditions.memberUid && filterConditions.memberUid !== '*') {
        const username = filterConditions.memberUid;
        logger.debug(`[SQLDirectoryProvider] Finding groups for member: ${username}`);
        const groups = await this.driver.findGroupsByMemberUid(username);
        
        // Apply cn filter if present (skip wildcards)
        if (filterConditions.cn && filterConditions.cn !== '*') {
          const filtered = groups.filter(g => g.name === filterConditions.cn);
          logger.debug(`[SQLDirectoryProvider] After cn filter (${filterConditions.cn}): ${filtered.length} groups`);
          return filtered;
        }
        
        return groups;
      }
      
      // Get all groups and apply filters
      let groups = await this.driver.getAllGroups();
      
      // Apply cn filter if present (skip wildcards)
      if (filterConditions.cn && filterConditions.cn !== '*') {
        groups = groups.filter(g => g.name === filterConditions.cn);
        logger.debug(`[SQLDirectoryProvider] After cn filter (${filterConditions.cn}): ${groups.length} groups`);
      }
      
      // Apply gidNumber filter if present
      if (filterConditions.gidNumber && filterConditions.gidNumber !== '*') {
        const gidNum = parseInt(filterConditions.gidNumber, 10);
        groups = groups.filter(g => g.gid_number === gidNum || g.gidNumber === gidNum);
        logger.debug(`[SQLDirectoryProvider] After gidNumber filter (${gidNum}): ${groups.length} groups`);
        
        // If no explicit group found, check for user private group
        if (groups.length === 0) {
          const users = await this.driver.getAllUsers();
          const user = users.find(u => u.gid_number === gidNum || u.gidNumber === gidNum);
          if (user) {
            logger.debug(`[SQLDirectoryProvider] Creating implicit user private group for gid ${gidNum} (user: ${user.username})`);
            groups = [{
              name: user.username,
              memberUids: [user.username],
              gid_number: gidNum,
              gidNumber: gidNum,
              dn: `cn=${user.username},${process.env.LDAP_BASE_DN}`,
              objectClass: ["posixGroup"],
            }];
          }
        }
      }
      
      logger.debug(`[SQLDirectoryProvider] Returning ${groups.length} groups`);
      return groups;
      
    } catch (error) {
      logger.error('[SQLDirectoryProvider] Error finding groups:', error);
      return [];
    }
  }

  async getAllUsers() {
    try {
      await this.initialize();
      
      logger.debug('[SQLDirectoryProvider] Getting all users');
      const users = await this.driver.getAllUsers();
      
      logger.debug(`[SQLDirectoryProvider] Found ${users.length} users`);
      return users;
      
    } catch (error) {
      logger.error('[SQLDirectoryProvider] Error getting all users:', error);
      return [];
    }
  }

  async getAllGroups() {
    try {
      await this.initialize();
      
      logger.debug('[SQLDirectoryProvider] Getting all groups');
      const groups = await this.driver.getAllGroups();
      
      logger.debug(`[SQLDirectoryProvider] Found ${groups.length} groups`);
      return groups;
      
    } catch (error) {
      logger.error('[SQLDirectoryProvider] Error getting all groups:', error);
      return [];
    }
  }

  async cleanup() {
    if (this.initialized) {
      logger.info(`[SQLDirectoryProvider] Cleaning up ${this.config.driver.toUpperCase()} connection...`);
      await this.driver.close();
      this.initialized = false;
      logger.info(`[SQLDirectoryProvider] ${this.config.driver.toUpperCase()} connection closed`);
    }
  }
}

module.exports = {
  name: 'sql',
  type: 'directory',
  provider: SQLDirectoryProvider,
};
