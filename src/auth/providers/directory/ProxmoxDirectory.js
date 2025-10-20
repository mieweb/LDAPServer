const fs = require('fs');
const DirectoryProviderInterface = require('./DirectoryProviderInterface');
const logger = require('../../../utils/logger');

class ProxmoxDirectory extends DirectoryProviderInterface {
  constructor(configPath) {
    super();
    this.configPath = configPath;
    this.users = [];
    this.groups = [];
    this.watcher = null;
    this.reloadTimer = null; // For debouncing
    if (configPath) {
      this.loadConfig();
      this.setupFileWatcher();
    } else {
      logger.warn("[ProxmoxDirectory] No config path provided. Using empty user/group lists.");
    }
  }

  setupFileWatcher() {
    if (!this.configPath || !fs.existsSync(this.configPath)) {
      return;
    }

    try {
      // Watch for changes to the config file
      this.watcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          // Debounce: clear any existing timer and set a new one
          if (this.reloadTimer) {
            clearTimeout(this.reloadTimer);
          }
          
          this.reloadTimer = setTimeout(() => {
            logger.info(`[ProxmoxDirectory] Config file changed, reloading: ${this.configPath}`);
            this.loadConfig();
          }, 500); // Wait 500ms after last change before reloading
        }
      });

      this.watcher.on('error', (error) => {
        logger.error("[ProxmoxDirectory] File watcher error:", { error });
      });

      logger.info(`[ProxmoxDirectory] File watcher initialized for ${this.configPath}`);
    } catch (err) {
      logger.error("[ProxmoxDirectory] Failed to setup file watcher:", { error: err });
    }
  }

  cleanup() {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info("[ProxmoxDirectory] File watcher closed");
    }
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
      logger.info(`[ProxmoxDirectory] Loaded Proxmox user.cfg data from ${this.configPath}`);
    } catch (err) {
      logger.error("[ProxmoxDirectory] Error reading config file:", { error: err });
    }
  }

  parseConfig(content) {
    const lines = content.split('\n');
    const users = [];
    const groups = [];
    let uidBase = 1000;
    let gidBase = 2000; // Start group IDs from 2000

    for (const line of lines) {
      if (line.startsWith('user:')) {
        const [_, rest] = line.split('user:');
        const [usernameWithRealm, , , , firstName, lastName, email] = rest.split(':');
        const cleanUsername = usernameWithRealm.split('@')[0];
        
        users.push({
          username: cleanUsername,
          full_name: `${firstName || ''} ${lastName || ''}`.trim() || cleanUsername,
          surname: lastName || "Unknown",
          mail: email || `${cleanUsername}@mieweb.com`,
          uid_number: uidBase,
          gid_number: uidBase, // User's primary group
          home_directory: `/home/${cleanUsername}`,
          password: undefined
        });
        uidBase++;
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