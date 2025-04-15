const logger = require("../utils/logger");

async function handleGroupSearch(filterStr, res, db) {
  const memberUidMatch = filterStr.match(/memberUid=([^)&]+)/i);

  try {
    if (memberUidMatch) {
      const username = memberUidMatch[1];

      const groups = await db.findGroupsByMemberUid(username);
      logger.debug("[GROUP SEARCH] Found groups", { groupsCount: groups.length });

      groups.forEach((group) => {
        logger.debug("[GROUP] Sending group", { group });
        res.send({
          dn: `cn=${group.name},ou=groups,dc=mieweb,dc=com`,
          attributes: {
            objectClass: ["posixGroup"],
            cn: group.name,
            gidNumber: group.gid.toString(),
            memberUid: group.member_uids,
          },
        });
      });
    }

    res.end();
  } catch (error) {
    logger.error("[GROUP SEARCH] Error:", { error });
    res.end();
  }
}

module.exports = { handleGroupSearch };
