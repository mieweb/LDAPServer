const fs = require('fs');
const DirectoryProviderInterface = require('./DirectoryProviderInterface');
const logger = require('../../../utils/logger');

class ProxmoxDirectory extends DirectoryProviderInterface {
  constructor(configPath) {
    super();
    this.configPath = configPath;
    this.users = [];
    this.groups = [];
    this.loadConfig();
  }

  loadConfig() {
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      this.parseConfig(data);
      logger.info("[ProxmoxDirectory] Loaded Proxmox user.cfg data");
    } catch (err) {
      logger.error("[ProxmoxDirectory] Error reading config file:", { error: err });
    }
  }

  parseConfig(content) {
  const lines = content.split('\n');
  const users = [];
  const groups = [];
  let uidBase = 1000;

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
        gid_number: uidBase, // use same for group, or assign another
        home_directory: `/home/${cleanUsername}`,
        password: undefined
      });

      uidBase++; // increment so each user gets a unique UID/GID
    }

    if (line.startsWith('group:')) {
      const [_, groupName, members] = line.split(':');
      if (groupName === 'administrators' || groupName === 'interns') {
        const memberUids = members ? members.split(',').map(u => u.split('@')[0]) : [];
        groups.push({
          name: groupName,
          memberUids,
          dn: `cn=${groupName},${process.env.LDAP_BASE_DN}`,
          objectClass: ["posixGroup"],
        });
      }
    }
  }

  this.users = users;
  this.groups = groups;
}


  async findUser(username) {
    console.log(this.users.find(u => u.username === username) || null)
    return this.users.find(u => u.username === username) || null;
  }

  async findGroups(filter) {
    const memberUidMatch = filter.match(/memberUid=([^)&]+)/i);
    if (memberUidMatch) {
      const username = memberUidMatch[1];
      return this.groups.filter(group => group.memberUids.includes(username));
    }
    return this.groups;
  }

  async getAllUsers() {
    return this.users;
  }

  async getAllGroups() {
    return this.groups;
  }
}

module.exports = ProxmoxDirectory;
