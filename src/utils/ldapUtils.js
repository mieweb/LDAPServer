const logger = require("./logger");


function createLdapEntry(user) {
  // // Temp-Fix: Webchart schema doesn't have these right now
  const uidNumber = user.user_id !== undefined && user.user_id !== null
    ? (parseInt(user.user_id) + 10000).toString()
    : "10000";
  const gidNumber = user.gidNumber !== undefined && user.gidNumber !== null
    ? (parseInt(user.gidNumber) + 10000).toString()
    : "10000";


  const entry = {
    dn: `uid=${user.username},${process.env.LDAP_BASE_DN}`,
    attributes: {
      objectClass: ["top", "posixAccount", "inetOrgPerson", "shadowAccount"],
      uid: user.username,
      uidNumber,
      gidNumber,
      cn: user.first_name,
      gecos: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      sn: user.last_name || "Unknown",
      mail: user.email || `${user.username}@mieweb.com`,
      homeDirectory: `/home/${user.username}`,
      loginShell: "/bin/bash",
      shadowLastChange: "1",
    },
  };

  return entry;
}

function createLdapGroupEntry(group) {
  const entry = {
    dn: group.dn || `cn=${group.name},${process.env.LDAP_BASE_DN}`,
    attributes: {
      objectClass: group.objectClass || ['posixGroup'],
      cn: group.name,
      gidNumber: group.gid_number || group.gidNumber,
    }
  };

  // Add member UIDs if they exist
  if (group.memberUids && group.memberUids.length > 0) {
    entry.attributes.memberUid = group.memberUids;
  }

  // Add member DNs if they exist
  if (group.members && group.members.length > 0) {
    entry.attributes.member = group.members;
  }

  logger.debug("Created LDAP group entry:", {
    dn: entry.dn,
    cn: entry.attributes.cn,
    gidNumber: entry.attributes.gidNumber,
    memberUids: entry.attributes.memberUid?.length || 0
  });

  return entry;
}

module.exports = { createLdapEntry, createLdapGroupEntry };

