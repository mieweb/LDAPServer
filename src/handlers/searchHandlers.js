const logger = require('../utils/logger');
const { createLdapEntry, createLdapGroupEntry } = require('../utils/ldapUtils');

async function handleUserSearch(username, res, selectedDirectory) {
  try {
    logger.debug(`[handleUserSearch] Searching for user: ${username}`);
    
    const user = await selectedDirectory.findUser(username);
    
    if (user) {
      const entry = createLdapEntry(user);
      // logger.debug("Sending user entry:", {
      //   dn: entry.dn,
      //   uid: entry.attributes.uid,
      //   uidNumber: entry.attributes.uidNumber,
      //   gidNumber: entry.attributes.gidNumber
      // });
      res.send(entry);
    } else {
      logger.debug(`[handleUserSearch] User ${username} not found`);
    }
    
    res.end();
  } catch (error) {
    logger.error(`[handleUserSearch] Error searching for user ${username}:`, error);
    res.end();
  }
}

async function handleGroupSearch(filterStr, res, selectedDirectory) {
  try {
    logger.debug(`[handleGroupSearch] Group search with filter: ${filterStr}`);
    
    const groups = await selectedDirectory.findGroups(filterStr);
    
    logger.debug(`[handleGroupSearch] Found ${groups.length} groups`);
    
    for (const group of groups) {
      const entry = createLdapGroupEntry(group);
      logger.debug("Sending group entry:", {
        dn: entry.dn,
        cn: entry.attributes.cn,
        gidNumber: entry.attributes.gidNumber,
        memberUids: entry.attributes.memberUid?.length || 0
      });
      res.send(entry);
    }
    
    logger.debug("[handleGroupSearch] Group search completed, ending response");
    res.end();
  } catch (error) {
    logger.error("[handleGroupSearch] Error in group search:", error);
    res.end();
  }
}

module.exports = {
  handleUserSearch,
  handleGroupSearch
};