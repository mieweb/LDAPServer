const { DirectoryProvider, filterUtils } = require('@ldap-gateway/core');
const logger = require('../utils/logger');
const { Sequelize } = require('sequelize');

/**
 * Normalize member_uids field from database
 * MySQL/PostgreSQL with native JSON types return arrays directly via Sequelize
 * SQLite stores JSON as TEXT and returns strings that need parsing
 * @param {Object} group - Group object from database
 * @returns {Object} Group with normalized member_uids array
 */
function normalizeMemberUids(group) {
  if (typeof group.member_uids === 'string') {
    try {
      group.member_uids = JSON.parse(group.member_uids);
    } catch (e) {
      logger.warn(`[SQLDirectoryProvider] Failed to parse member_uids JSON for group ${group.name}: ${e.message}`);
      group.member_uids = [];
    }
  }
  return group;
}

/**
 * SQL Directory Provider
 * Handles user and group directory operations against SQL database
 */
class SQLDirectoryProvider extends DirectoryProvider {
  constructor() {
    super();
    this.sequelize = new Sequelize(
      process.env.SQL_URI,
      { logging: msg => logger.debug(msg) }
    );
  }

  // constructor handles initialization
  async initialize() { return; }

  async findUser(username) {
    try {
      logger.debug(`[SQLDirectoryProvider] Finding user: ${username}`);
      const [results, _] = await this.sequelize.query(
        process.env.SQL_QUERY_ONE_USER,
        { replacements: [username] }
      );

      if (results.length === 0) {
        logger.debug(`[SQLDirectoryProvider] User not found: ${username}`);
        return null;
      }

      logger.debug(`[SQLDirectoryProvider] User found: ${username}`);
      return results[0];
    } catch (error) {
      logger.error(`[SQLDirectoryProvider] Error finding user ${username}:`, error);
      return null;
    }
  }

  async findGroups(filter) {
    try {
      logger.debug(`[SQLDirectoryProvider] Finding groups with filter: ${filter}`);
      
      // Parse the filter to extract all conditions
      const filterConditions = filterUtils.parseGroupFilter(filter);
      logger.debug(`[SQLDirectoryProvider] Parsed filter conditions:`, filterConditions);
      
      // If memberUid filter is present, use optimized query (skip wildcards)
      if (filterConditions.memberUid && filterConditions.memberUid !== '*') {
        const username = filterConditions.memberUid;
        logger.debug(`[SQLDirectoryProvider] Finding groups for member: ${username}`);
        const [groups, _] = await this.sequelize.query(
          process.env.SQL_QUERY_GROUPS_BY_MEMBER,
          { replacements: [username] }
        );
        
        // Normalize member_uids from JSON strings to arrays
        const normalizedGroups = groups.map(normalizeMemberUids);
        
        // Apply cn filter if present (skip wildcards)
        if (filterConditions.cn && filterConditions.cn !== '*') {
          const filtered = normalizedGroups.filter(g => g.name === filterConditions.cn);
          logger.debug(`[SQLDirectoryProvider] After cn filter (${filterConditions.cn}): ${filtered.length} groups`);
          return filtered;
        }
        
        return normalizedGroups;
      }
      
      // Get all groups and apply filters
      let groups = await this.getAllGroups();
      
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
          const users = await this.getAllUsers();
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
      logger.debug('[SQLDirectoryProvider] Getting all users');
      const [users, _] = await this.sequelize.query(process.env.SQL_QUERY_ALL_USERS);
      
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
      const [groups, _] = await this.sequelize.query(process.env.SQL_QUERY_ALL_GROUPS);
      
      // Normalize member_uids from JSON strings to arrays
      const normalizedGroups = groups.map(normalizeMemberUids);
      
      logger.debug(`[SQLDirectoryProvider] Found ${normalizedGroups.length} groups`);
      return normalizedGroups;
      
    } catch (error) {
      logger.error('[SQLDirectoryProvider] Error getting all groups:', error);
      return [];
    }
  }

  async cleanup() {
    logger.info('[SQLDirectoryProvider] Cleaning up SQL connection...');
    await this.sequelize.close();
    logger.info('[SQLDirectoryProvider] SQL connection closed');
  }
}

module.exports = {
  name: 'sql',
  type: 'directory',
  provider: SQLDirectoryProvider,
};