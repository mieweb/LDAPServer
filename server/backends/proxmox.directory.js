const fs = require('fs');
const crypto = require('crypto');
const chokidar = require('chokidar');
const { DirectoryProvider, filterUtils } = require('@ldap-gateway/core');

const logger = require('../utils/logger');
const { name } = require('./proxmox.auth');

class ProxmoxDirectory extends DirectoryProvider {
  constructor() {
    super();
    this.configPath = process.env.PROXMOX_USER_CFG || null;
    this.users = [];
    this.groups = [];
    this.watcher = null;
    this.reloadTimer = null;
    this.DEBOUNCE_MS = 500;
    
    if (this.configPath) {
      this.loadConfig();
      this.setupFileWatcher();
    } else {
      logger.warn("[ProxmoxDirectory] No PROXMOX_USER_CFG environment variable set. Using empty user/group lists.");
    }
  }

  setupFileWatcher() {
    if (!this.configPath) {
      logger.debug("[ProxmoxDirectory] No config path to watch");
      return;
    }

    if (!fs.existsSync(this.configPath)) {
      logger.warn(`[ProxmoxDirectory] Cannot setup watcher - config file does not exist: ${this.configPath}`);
      return;
    }

    try {
      // Use chokidar for reliable file watching (same as auth backend)
      this.watcher = chokidar.watch(this.configPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        },
        // Important for mounted file systems like /mnt/pve
        usePolling: true,
        interval: 1000,
        atomic: true,
        followSymlinks: false
      });

      this.watcher.on('change', (path) => {
        logger.info(`[ProxmoxDirectory] User config file changed: ${path}`);
        this.scheduleReload();
      });

      this.watcher.on('add', (path) => {
        logger.info(`[ProxmoxDirectory] User config file added: ${path}`);
        this.scheduleReload();
      });

      this.watcher.on('unlink', (path) => {
        logger.warn(`[ProxmoxDirectory] User config file removed: ${path}`);
        this.users = [];
        this.groups = [];
      });

      this.watcher.on('error', (error) => {
        logger.error(`[ProxmoxDirectory] File watcher error:`, { error: error.message });
      });

      this.watcher.on('ready', () => {
        logger.info(`[ProxmoxDirectory] Chokidar file watcher ready and monitoring: ${this.configPath}`);
      });

      logger.info(`[ProxmoxDirectory] Setting up chokidar file watcher for ${this.configPath}`);
    } catch (err) {
      logger.error("[ProxmoxDirectory] Failed to setup file watcher:", { error: err });
    }
  }

  scheduleReload() {
    // Clear existing timer to debounce rapid changes
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      logger.info("[ProxmoxDirectory] Debounce timer expired - reloading config file...");
      
      // Check if file still exists before reloading
      if (fs.existsSync(this.configPath)) {
        this.loadConfig();
        logger.info("[ProxmoxDirectory] User config file reloaded successfully after file change");
      } else {
        logger.warn(`[ProxmoxDirectory] Config file no longer exists: ${this.configPath}`);
      }
      
      this.reloadTimer = null;
    }, this.DEBOUNCE_MS);
  }

  /**
  * Generate a stable UID from a username using a hash function.
  * This ensures the same username always gets the same UID regardless of
  * the order in which users appear in the config file.
  * 
  * @param {string} username - The username to generate a UID for
  * @returns {number} A stable UID in the range 2000-65533
  */
  generateStableUid(username) {
    // Use SHA-256 hash of the username to generate a consistent number
    const hash = crypto.createHash('sha256').update(username).digest('hex');
    // Take first 8 characters of hex and convert to number
    const hashNum = parseInt(hash.substring(0, 8), 16);
    // Map to range 2000-65533 (avoiding reserved UIDs < 1000 and 65534-65535)
    const uidRange = 65533 - 2000 + 1;
    return 2000 + (hashNum % uidRange);
  }

  loadConfig() {
    try {
      if (!this.configPath) {
        logger.warn("[ProxmoxDirectory] No config path provided");
        return;
      }
      
      if (!fs.existsSync(this.configPath)) {
        logger.warn(`[ProxmoxDirectory] Config file does not exist: ${this.configPath}`);
        return;
      }
      
      const data = fs.readFileSync(this.configPath, 'utf8');
      const previousUserCount = this.users.length;
      const previousGroupCount = this.groups.length;
      
      this.parseConfig(data);
      
      logger.info(`[ProxmoxDirectory] Loaded Proxmox user.cfg data from ${this.configPath} ` +
        `(users: ${previousUserCount} → ${this.users.length}, groups: ${previousGroupCount} → ${this.groups.length})`);
    } catch (err) {
      logger.error("[ProxmoxDirectory] Error reading config file:", { error: err });
    }
  }

  parseConfig(content) {
    const lines = content.split('\n');
    const users = [];
    const groups = [];
    let gidBase = 2000; // Start group IDs from 2000

    for (const line of lines) {
      if (line.startsWith('user:')) {
        const [_, rest] = line.split('user:');
        // Proxmox user.cfg format: username@realm:enable:expire:firstname:lastname:email:comment:keys:groups
        const [usernameWithRealm, enabledStr, expireStr, firstName, lastName, email] = rest.split(':');
        const cleanUsername = usernameWithRealm.split('@')[0];

        // Generate stable UID based on username hash
        const stableUid = this.generateStableUid(cleanUsername);

        const userObj = {
          username: cleanUsername,
          uid_number: stableUid,
          gid_number: stableUid
        };

        // Parse enabled field (1 = enabled, 0 = disabled)
        if (enabledStr !== undefined && enabledStr !== '') {
          userObj.enabled = enabledStr === '1';
        }

        // Parse expire field (0 = never expires, timestamp = expiration time)
        if (expireStr !== undefined && expireStr !== '') {
          userObj.expire = parseInt(expireStr, 10);
        }

        // Add optional attributes
        if (firstName)
          userObj.first_name = firstName;

        if (lastName)
          userObj.last_name = lastName;

        if (email)
          userObj.mail = email;

        users.push(userObj);
      }

      if (line.startsWith('group:')) {
        const [_, groupName, members] = line.split(':');
        const memberUids = members ? members.split(',').map(u => u.split('@')[0]) : [];

        // Only include groups that have members (skip empty groups)
        if (memberUids.length > 0) {
          groups.push({
            name: groupName,
            memberUids,
            gid_number: gidBase,
            gidNumber: gidBase,
            dn: `cn=${groupName},${process.env.LDAP_BASE_DN}`,
            objectClass: ["posixGroup"],
          });
          gidBase++;
        } else {
          logger.debug(`[ProxmoxDirectory] Skipping empty group: ${groupName}`);
        }
      }
    }

    // Add a universal sudo group that includes all users
    const allUsernames = users.map(u => u.username);
    groups.push({
      name: "proxmox-sudo",
      memberUids: allUsernames,
      gid_number: 9999,
      gidNumber: 9999,
      dn: `cn=proxmox-sudo,${process.env.LDAP_BASE_DN}`,
      objectClass: ["posixGroup"],
    });

    this.users = users;
    this.groups = groups;
  }

  async findUser(username) {
    const user = this.users.find(u => u.username === username) || null;
    logger.debug(`[ProxmoxDirectory] findUser(${username}):`, user);
    return user;
  }

  async findGroups(filter) {
    logger.debug(`[ProxmoxDirectory] findGroups called with filter: ${filter}`);
    logger.debug(`[ProxmoxDirectory] Available groups:`, this.groups.map(g => ({
      name: g.name,
      gidNumber: g.gidNumber,
      memberCount: g.memberUids.length
    })));

    // Parse the filter to extract all conditions
    const filterConditions = filterUtils.parseGroupFilter(filter);
    logger.debug(`[ProxmoxDirectory] Parsed filter conditions:`, filterConditions);

    let results = [...this.groups];

    // Apply cn filter if present (skip wildcards)
    if (filterConditions.cn && filterConditions.cn !== '*') {
      results = results.filter(group => group.name === filterConditions.cn);
      logger.debug(`[ProxmoxDirectory] After cn filter (${filterConditions.cn}): ${results.length} groups`);
    }

    // Apply memberUid filter if present (skip wildcards)
    if (filterConditions.memberUid && filterConditions.memberUid !== '*') {
      results = results.filter(group => group.memberUids.includes(filterConditions.memberUid));
      logger.debug(`[ProxmoxDirectory] After memberUid filter (${filterConditions.memberUid}): ${results.length} groups`);
    }

    // Apply gidNumber filter if present
    if (filterConditions.gidNumber && filterConditions.gidNumber !== '*') {
      const gidNum = parseInt(filterConditions.gidNumber, 10);
      results = results.filter(group => group.gidNumber === gidNum);
      logger.debug(`[ProxmoxDirectory] After gidNumber filter (${gidNum}): ${results.length} groups`);
      
      // If no explicit group found, check for user private group
      if (results.length === 0) {
        const user = this.users.find(u => u.gid_number === gidNum);
        if (user) {
          logger.debug(`[ProxmoxDirectory] Creating implicit user private group for gid ${gidNum} (user: ${user.username})`);
          results = [{
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

    // objectClass=posixGroup doesn't filter further since all our groups are posixGroups
    // If no specific filters, return all groups
    
    logger.debug(`[ProxmoxDirectory] Returning ${results.length} groups:`,
      results.map(g => ({ name: g.name, gidNumber: g.gidNumber })));
    
    return results;
  }

  async getAllUsers() {
    return this.users;
  }

  async getAllGroups() {
    return this.groups;
  }

  /**
   * Clean up resources (file watcher and timers)
   * Should be called during application shutdown
   */
  cleanup() {
    logger.info("[ProxmoxDirectory] Cleaning up resources...");
    
    // Clear any pending reload timer
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
      logger.debug("[ProxmoxDirectory] Cleared pending reload timer");
    }

    // Close file watcher
    if (this.watcher) {
      try {
        this.watcher.close();
        logger.info("[ProxmoxDirectory] File watcher closed successfully");
      } catch (err) {
        logger.error("[ProxmoxDirectory] Error closing file watcher:", { error: err });
      }
      this.watcher = null;
    }
  }
}

module.exports = {
  name: 'proxmox',
  type: 'directory',
  provider: ProxmoxDirectory,
};