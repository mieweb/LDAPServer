const { DirectoryProvider, filterUtils } = require('@ldap-gateway/core');
const mysqlDriver = require('../db/drivers/mysql');
const logger = require('../utils/logger');

/**
 * MySQL Directory Provider
 * Handles user and group directory operations against MySQL database
 */
class MySQLDirectoryProvider extends DirectoryProvider {
  constructor() {
    super();
    this.config = {
      type: 'mysql',
      host: process.env.MYSQL_HOST || "mysql",
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "rootpassword", 
      database: process.env.MYSQL_DATABASE || "ldap_user_db",
    };
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      logger.info('[MySQLDirectoryProvider] Initializing MySQL connection...');
      await mysqlDriver.connect(this.config);
      this.initialized = true;
      logger.info(`[MySQLDirectoryProvider] Connected to MySQL: ${this.config.host}/${this.config.database}`);
    }
  }

  async findUser(username) {
    try {
      await this.initialize();
      
      logger.debug(`[MySQLDirectoryProvider] Finding user: ${username}`);
      const user = await mysqlDriver.findUserByUsername(username);
      
      if (user) {
        logger.debug(`[MySQLDirectoryProvider] User found: ${username}`);
      } else {
        logger.debug(`[MySQLDirectoryProvider] User not found: ${username}`);
      }
      
      return user;
      
    } catch (error) {
      logger.error(`[MySQLDirectoryProvider] Error finding user ${username}:`, error);
      return null;
    }
  }

  async findGroups(filter) {
    try {
      await this.initialize();
      
      logger.debug(`[MySQLDirectoryProvider] Finding groups with filter: ${filter}`);
      
      // Parse the filter to extract all conditions
      const filterConditions = filterUtils.parseGroupFilter(filter);
      logger.debug(`[MySQLDirectoryProvider] Parsed filter conditions:`, filterConditions);
      
      // If memberUid filter is present, use optimized query
      if (filterConditions.memberUid) {
        const username = filterConditions.memberUid;
        logger.debug(`[MySQLDirectoryProvider] Finding groups for member: ${username}`);
        const groups = await mysqlDriver.findGroupsByMemberUid(username);
        
        // Apply cn filter if present
        if (filterConditions.cn) {
          const filtered = groups.filter(g => g.name === filterConditions.cn);
          logger.debug(`[MySQLDirectoryProvider] After cn filter (${filterConditions.cn}): ${filtered.length} groups`);
          return filtered;
        }
        
        return groups;
      }
      
      // Get all groups and apply filters
      let groups = await mysqlDriver.getAllGroups();
      
      // Apply cn filter if present
      if (filterConditions.cn) {
        groups = groups.filter(g => g.name === filterConditions.cn);
        logger.debug(`[MySQLDirectoryProvider] After cn filter (${filterConditions.cn}): ${groups.length} groups`);
      }
      
      // Apply gidNumber filter if present
      if (filterConditions.gidNumber && filterConditions.gidNumber !== '*') {
        const gidNum = parseInt(filterConditions.gidNumber, 10);
        groups = groups.filter(g => g.gid_number === gidNum || g.gidNumber === gidNum);
        logger.debug(`[MySQLDirectoryProvider] After gidNumber filter (${gidNum}): ${groups.length} groups`);
      }
      
      logger.debug(`[MySQLDirectoryProvider] Returning ${groups.length} groups`);
      return groups;
      
    } catch (error) {
      logger.error('[MySQLDirectoryProvider] Error finding groups:', error);
      return [];
    }
  }

  async getAllUsers() {
    try {
      await this.initialize();
      
      logger.debug('[MySQLDirectoryProvider] Getting all users');
      const users = await mysqlDriver.getAllUsers();
      
      logger.debug(`[MySQLDirectoryProvider] Found ${users.length} users`);
      return users;
      
    } catch (error) {
      logger.error('[MySQLDirectoryProvider] Error getting all users:', error);
      return [];
    }
  }

  async getAllGroups() {
    try {
      await this.initialize();
      
      logger.debug('[MySQLDirectoryProvider] Getting all groups');
      const groups = await mysqlDriver.getAllGroups();
      
      logger.debug(`[MySQLDirectoryProvider] Found ${groups.length} groups`);
      return groups;
      
    } catch (error) {
      logger.error('[MySQLDirectoryProvider] Error getting all groups:', error);
      return [];
    }
  }

  async cleanup() {
    if (this.initialized) {
      logger.info('[MySQLDirectoryProvider] Cleaning up MySQL connection...');
      await mysqlDriver.close();
      this.initialized = false;
      logger.info('[MySQLDirectoryProvider] MySQL connection closed');
    }
  }
}

module.exports = {
  name: 'mysql',
  type: 'directory',
  provider: MySQLDirectoryProvider,
};