const fs = require('fs');
const crypto = require('crypto');
const chokidar = require('chokidar');
const DirectoryProviderInterface = require('./DirectoryProviderInterface');
const logger = require('../../../utils/logger');

class ProxmoxDirectory extends DirectoryProviderInterface {
  constructor(configPath) {
    super();
    this.configPath = configPath;
    this.users = [];
    this.groups = [];
    this.fileWatcher = null;
    this.reloadTimeout = null;
    
    if (configPath) {
      this.loadConfig();
      this.setupFileWatcher();
    } else {
      logger.warn("[ProxmoxDirectory] No config path provided. Using empty user/group lists.");
    }
  }

  /**
   * Set up file watcher to automatically reload config when file changes
   * Using chokidar for better reliability across different file systems
   */
  setupFileWatcher() {
    if (!this.configPath || !fs.existsSync(this.configPath)) {
      logger.warn("[ProxmoxDirectory] Cannot setup file watcher: invalid config path");
      return;
    }

    try {
      // Use chokidar for more reliable file watching
      this.fileWatcher = chokidar.watch(this.configPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        },
        // Important for mounted file systems like /mnt/pve
        usePolling: true,
        interval: 1000,
        // Additional options for better reliability
        atomic: true,
        followSymlinks: false
      });

      this.fileWatcher.on('change', (path) => {
        logger.info(`[ProxmoxDirectory] Config file changed: ${path}`);
        this.scheduleReload();
      });

      this.fileWatcher.on('add', (path) => {
        logger.info(`[ProxmoxDirectory] Config file added: ${path}`);
        this.scheduleReload();
      });

      this.fileWatcher.on('unlink', (path) => {
        logger.warn(`[ProxmoxDirectory] Config file removed: ${path}`);
      });

      this.fileWatcher.on('error', (error) => {
        logger.error(`[ProxmoxDirectory] File watcher error:`, { error: error.message });
      });

      this.fileWatcher.on('ready', () => {
        logger.info(`[ProxmoxDirectory] Chokidar file watcher ready and monitoring: ${this.configPath}`);
      });

      logger.info(`[ProxmoxDirectory] Setting up chokidar file watcher for ${this.configPath}`);
    } catch (err) {
      logger.error("[ProxmoxDirectory] Error setting up file watcher:", { error: err });
    }
  }

  /**
   * Schedule a config reload with debouncing
   */
  scheduleReload() {
    // Debounce rapid file changes
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }
    
    this.reloadTimeout = setTimeout(() => {
      this.loadConfig();
      logger.info("[ProxmoxDirectory] Config reloaded successfully after file change");
    }, 500);
  }

  /**
   * Clean up file watcher when instance is destroyed
   */
  async destroy() {
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      logger.info("[ProxmoxDirectory] File watcher closed");
    }
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }
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
      this.parseConfig(data);
      logger.info(`[ProxmoxDirectory] Loaded Proxmox user.cfg data from ${this.configPath} (${this.users.length} users, ${this.groups.length} groups)`);
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
        const [usernameWithRealm, , , , firstName, lastName, email] = rest.split(':');
        const cleanUsername = usernameWithRealm.split('@')[0];
        
        // Generate stable UID based on username hash
        const stableUid = this.generateStableUid(cleanUsername);
        
        users.push({
          username: cleanUsername,
          full_name: `${firstName || ''} ${lastName || ''}`.trim() || cleanUsername,
          surname: lastName || "Unknown",
          mail: email || `${cleanUsername}@mieweb.com`,
          uid_number: stableUid,
          gid_number: stableUid, // User's primary group
          home_directory: `/home/${cleanUsername}`,
          password: undefined
        });
      }

      if (line.startsWith('group:')) {
        const [_, groupName, members] = line.split(':');
        if (groupName === 'administrators' || groupName === 'interns') {
          const memberUids = members ? members.split(',').map(u => u.split('@')[0]) : [];
          
          groups.push({
            name: groupName,
            memberUids,
            gid_number: gidBase,
            gidNumber: gidBase, 
            dn: `cn=${groupName},${process.env.LDAP_BASE_DN}`,
            objectClass: ["posixGroup"],
          });
          gidBase++;
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
    
    // Debug logging
    logger.debug("[ProxmoxDirectory] Parsed groups:", this.groups.map(g => ({
      name: g.name,
      gidNumber: g.gidNumber,
      gid_number: g.gid_number,
      memberCount: g.memberUids.length
    })));
  }

  async findUser(username) {
    const user = this.users.find(u => u.username === username) || null;
    logger.debug(`[ProxmoxDirectory] findUser(${username}):`, user);
    return user;
  }

  async findGroups(filter) {
    const groups = this.groups;
    logger.debug(`[findGroups] Received filter: ${filter}`);
    logger.debug(`[findGroups] Available groups:`, groups.map(g => ({
      name: g.name,
      gidNumber: g.gidNumber,
      memberCount: g.memberUids.length
    })));

    // Match filters like (memberUid=username)
    const memberUidMatch = filter.match(/memberUid=([^)&]+)/i);
    if (memberUidMatch) {
      const username = memberUidMatch[1];
      logger.debug(`[findGroups] Detected memberUid match for: ${username}`);
      const matched = groups.filter(group => group.memberUids.includes(username));
      logger.debug(`[findGroups] Returning ${matched.length} groups for memberUid:`, 
        matched.map(g => ({ name: g.name, gidNumber: g.gidNumber })));
      return matched;
    }

    // Match filters like (cn=groupname)
    const cnMatch = filter.match(/cn=([^)&]+)/i);
    if (cnMatch) {
      const cn = cnMatch[1];
      logger.debug(`[findGroups] Detected cn match for: ${cn}`);
      const matched = groups.filter(group => group.name === cn);
      logger.debug(`[findGroups] Returning ${matched.length} groups for cn:`, 
        matched.map(g => ({ name: g.name, gidNumber: g.gidNumber })));
      return matched;
    }

    // Match filters like (objectClass=posixGroup)
    const objectClassMatch = filter.match(/objectClass=posixGroup/i);
    if (objectClassMatch) {
      logger.debug(`[findGroups] Detected objectClass=posixGroup. Returning all groups:`,
        groups.map(g => ({ name: g.name, gidNumber: g.gidNumber })));
      return groups;
    }

    // Match filters like (gidNumber=*)
    const gidNumberMatch = filter.match(/gidNumber=/i);
    if (gidNumberMatch) {
      logger.debug(`[findGroups] Detected gidNumber search. Returning all groups.`);
      return groups;
    }

    logger.debug(`[findGroups] No recognized pattern in filter. Returning empty array.`);
    return [];
  }

  async getAllUsers() {
    return this.users;
  }

  async getAllGroups() {
    return this.groups;
  }
}

module.exports = ProxmoxDirectory;