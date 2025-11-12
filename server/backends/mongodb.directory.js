const { DirectoryProvider, filterUtils } = require('@ldap-gateway/core');
const mongoDbDriver = require('../db/drivers/mongoDb');
const logger = require('../utils/logger');

/**
 * MongoDB Directory Provider
 * Handles user and group directory operations against MongoDB database
 */
class MongoDBDirectoryProvider extends DirectoryProvider {
  constructor() {
    super();
    this.config = {
      type: 'mongodb',
      uri: process.env.MONGO_URI || "mongodb://localhost:27017/ldap_user_db",
      database: process.env.MONGO_DATABASE || "ldap_user_db"
    };
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      logger.info('[MongoDBDirectoryProvider] Initializing MongoDB connection...');
      await mongoDbDriver.connect(this.config);
      this.initialized = true;
      logger.info(`[MongoDBDirectoryProvider] Connected to MongoDB: ${this.config.uri}`);
    }
  }

  async findUser(username) {
    try {
      await this.initialize();
      
      logger.debug(`[MongoDBDirectoryProvider] Finding user: ${username}`);
      const user = await mongoDbDriver.findUserByUsername(username);
      
      if (user) {
        logger.debug(`[MongoDBDirectoryProvider] User found: ${username}`);
      } else {
        logger.debug(`[MongoDBDirectoryProvider] User not found: ${username}`);
      }
      
      return user;
      
    } catch (error) {
      logger.error(`[MongoDBDirectoryProvider] Error finding user ${username}:`, error);
      return null;
    }
  }

  async findGroups(filter) {
    try {
      await this.initialize();
      
      logger.debug(`[MongoDBDirectoryProvider] Finding groups with filter: ${filter}`);
      
      // Parse the filter to extract all conditions
      const filterConditions = filterUtils.parseGroupFilter(filter);
      logger.debug(`[MongoDBDirectoryProvider] Parsed filter conditions:`, filterConditions);
      
      // If memberUid filter is present, use optimized query
      if (filterConditions.memberUid) {
        const username = filterConditions.memberUid;
        logger.debug(`[MongoDBDirectoryProvider] Finding groups for member: ${username}`);
        const groups = await mongoDbDriver.findGroupsByMemberUid(username);
        
        // Apply cn filter if present
        if (filterConditions.cn) {
          const filtered = groups.filter(g => g.name === filterConditions.cn);
          logger.debug(`[MongoDBDirectoryProvider] After cn filter (${filterConditions.cn}): ${filtered.length} groups`);
          return filtered;
        }
        
        return groups;
      }
      
      // Get all groups and apply filters
      let groups = await mongoDbDriver.getAllGroups();
      
      // Apply cn filter if present
      if (filterConditions.cn) {
        groups = groups.filter(g => g.name === filterConditions.cn);
        logger.debug(`[MongoDBDirectoryProvider] After cn filter (${filterConditions.cn}): ${groups.length} groups`);
      }
      
      // Apply gidNumber filter if present
      if (filterConditions.gidNumber && filterConditions.gidNumber !== '*') {
        const gidNum = parseInt(filterConditions.gidNumber, 10);
        groups = groups.filter(g => g.gid_number === gidNum || g.gidNumber === gidNum);
        logger.debug(`[MongoDBDirectoryProvider] After gidNumber filter (${gidNum}): ${groups.length} groups`);
      }
      
      logger.debug(`[MongoDBDirectoryProvider] Returning ${groups.length} groups`);
      return groups;
      
    } catch (error) {
      logger.error('[MongoDBDirectoryProvider] Error finding groups:', error);
      return [];
    }
  }

  async getAllUsers() {
    try {
      await this.initialize();
      
      logger.debug('[MongoDBDirectoryProvider] Getting all users');
      const users = await mongoDbDriver.getAllUsers();
      
      logger.debug(`[MongoDBDirectoryProvider] Found ${users.length} users`);
      return users;
      
    } catch (error) {
      logger.error('[MongoDBDirectoryProvider] Error getting all users:', error);
      return [];
    }
  }

  async getAllGroups() {
    try {
      await this.initialize();
      
      logger.debug('[MongoDBDirectoryProvider] Getting all groups');
      const groups = await mongoDbDriver.getAllGroups();
      
      logger.debug(`[MongoDBDirectoryProvider] Found ${groups.length} groups`);
      return groups;
      
    } catch (error) {
      logger.error('[MongoDBDirectoryProvider] Error getting all groups:', error);
      return [];
    }
  }

  async cleanup() {
    if (this.initialized) {
      logger.info('[MongoDBDirectoryProvider] Cleaning up MongoDB connection...');
      await mongoDbDriver.close();
      this.initialized = false;
      logger.info('[MongoDBDirectoryProvider] MongoDB connection closed');
    }
  }
}

module.exports = {
  name: 'mongodb',
  type: 'directory', 
  provider: MongoDBDirectoryProvider,
};