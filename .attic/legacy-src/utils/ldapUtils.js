const logger = require("./logger");


function createLdapEntry(user) {
  // Temp-Fix: Webchart schema doesn't have these right now
  const uidNumber = user.uid_number !== undefined && user.uid_number !== null ? user.uid_number.toString() : "0";
  const gidNumber = user.gid_number !== undefined && user.gid_number !== null ? user.gid_number.toString() : "0";

  const entry = {
    dn: `uid=${user.username},${process.env.LDAP_BASE_DN}`,
    attributes: {
      objectClass: ["top", "posixAccount", "inetOrgPerson", "shadowAccount"],
      uid: user.username,
      uidNumber,
      gidNumber,
      cn: user.full_name || user.username,
      gecos: user.full_name || user.username,
      sn: user.surname || "Unknown",
      mail: user.mail || `${user.username}@mieweb.com`, // Mandatory
      homeDirectory: user.home_directory,
      loginShell: "/bin/bash",
      shadowLastChange: "0",
      userpassword: user?.password,
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

