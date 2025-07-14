const { createLdapEntry } = require("../utils/ldapUtils");
const logger = require("../utils/logger");

const handleUserSearch = async (username, res, directory) => {
  try {
    logger.debug("[USER SEARCH] Searching for:", { username });

    const user = await directory.findUser(username);

    if (!user) {
      logger.debug("[USER SEARCH] No user found");
      return res.end();
    }

    logger.info("[USER SEARCH] User found", { username });
    logger.debug("[USER SEARCH] User object", { user });

    const entry = createLdapEntry(user);
    logger.debug("[USER SEARCH] LDAP entry created", { entry });

    res.send(entry);
  } catch (error) {
    logger.error("[USER SEARCH] Error:", { error });
  } finally {
    res.end();
  }
};

const handleGroupSearch = async (filterStr, res, directory) => {
  try {
    logger.debug("[GROUP SEARCH] Starting group search with filter:", filterStr);

    const groups = await directory.findGroups(filterStr);
    logger.debug("[GROUP SEARCH] Found groups", { groupsCount: groups.length });

    groups.forEach((group) => {
      const groupEntry = {
        dn: group.dn,
        attributes: {
          objectClass: group.objectClass || ["posixGroup"],
          cn: group.name,
          gidNumber: group.gid ? group.gid.toString() : undefined,
          memberUid: Array.isArray(group.memberUids) ? group.memberUids : [],
        },
      };
      logger.debug("[GROUP SEARCH] Sending group entry:", groupEntry);
      res.send(groupEntry);
    });
  } catch (error) {
    logger.error("[GROUP SEARCH] Error:", {
      error: error.message,
      stack: error.stack,
      filterStr
    });
  } finally {
    res.end();
  }
};

module.exports = {
  handleUserSearch,
  handleGroupSearch,
};
