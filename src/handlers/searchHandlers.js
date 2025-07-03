const { createLdapEntry } = require("../utils/ldapUtils");
const logger = require("../utils/logger");

const handleGroupSearch = async (filterStr, res, db) => {
  try {
    logger.debug("[GROUP SEARCH] Starting group search with filter:", filterStr);
    
    // Check if this is a memberUid search for a specific user
    const memberUidMatch = filterStr.match(/memberUid=([^)&]+)/i);
    
    if (memberUidMatch) {
      // Search for groups containing a specific user
      const username = memberUidMatch[1];
      logger.debug("[GROUP SEARCH] Looking for groups containing user:", username);
      
      const groups = await db.findGroupsByMemberUid(username);
      logger.debug("[GROUP SEARCH] Found groups for user", { username, groupsCount: groups.length });
      
      groups.forEach((group) => {
        const groupEntry = {
          dn: `cn=${group.name},ou=groups,${process.env.LDAP_BASE_DN}`,
          attributes: {
            objectClass: ["posixGroup"],
            cn: group.name,
            gidNumber: group.gid.toString(),
            memberUid: Array.isArray(group.member_uids) ? group.member_uids : [group.member_uids],
          },
        };
        logger.debug("[GROUP SEARCH] Sending group entry:", groupEntry);
        res.send(groupEntry);
      });
    } else {
      // Return all groups (for empty filter or general group searches)
      logger.debug("[GROUP SEARCH] Returning all groups (empty filter or general search)");
      
      const groups = await db.getAllGroups();
      logger.debug("[GROUP SEARCH] Found total groups", { groupsCount: groups.length });
      
      if (groups && groups.length > 0) {
        groups.forEach((group) => {
          const groupEntry = {
            dn: `cn=${group.name},ou=groups,${process.env.LDAP_BASE_DN}`,
            attributes: {
              objectClass: ["posixGroup"],
              cn: group.name,
              gidNumber: group.gid.toString(),
              memberUid: Array.isArray(group.member_uids) ? group.member_uids : 
                         (group.member_uids ? [group.member_uids] : []),
            },
          };
          logger.debug("[GROUP SEARCH] Sending group entry:", groupEntry);
          res.send(groupEntry);
        });
      } else {
        logger.debug("[GROUP SEARCH] No groups found in database");
      }
    }
  } catch (error) {
    logger.error("[GROUP SEARCH] Error:", { 
      error: error.message,
      stack: error.stack,
      filterStr: filterStr 
    });
  } finally {
    res.end();
  }
};

const handleUserSearch = async (username, res, db) => {
    try {
        logger.debug("[USER SEARCH] Searching for:", { username });

        const user = await db.findUserByUsername(username);

        if (!user) {
            logger.debug("[USER SEARCH] No user found");
            return res.end();
        }

        logger.info("[USER SEARCH] User found", { username, userId: user.id }); 
        logger.debug("[USER SEARCH] User object from DB", { user });

        const entry = createLdapEntry(user);
        logger.debug("[USER SEARCH] LDAP entry created", { entry }); 
        
        res.send(entry);
    } catch (error) {
        logger.error("[USER SEARCH] Error:", { error });
    } finally {
        res.end();
    }
};


module.exports = {
    handleUserSearch,
    handleGroupSearch,
};
