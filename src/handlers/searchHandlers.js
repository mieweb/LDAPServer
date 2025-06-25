const { createLdapEntry } = require("../utils/ldapUtils");
const logger = require("../utils/logger");

const handleGroupSearch = async (filterStr, res, db) => {
    try {
        const memberUidMatch = filterStr.match(/memberUid=([^)&]+)/i);

        if (!memberUidMatch) {
            logger.debug("[GROUP SEARCH] No memberUid found in filter");
            return res.end();
        }

        const username = memberUidMatch[1];
        const groups = await db.findGroupsByMemberUid(username);

        logger.debug("[GROUP SEARCH] Found groups", { groupsCount: groups.length });

        groups.forEach((group) => {
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
    } catch (error) {
        logger.error("[GROUP SEARCH] Error:", { error });
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
