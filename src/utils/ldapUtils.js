const logger = require("./logger");

// Ensure we return a numeric string or undefined
function pickObsUid(user) {
  const v = user?.ldap_uid_number; // set by the DB layer you just updated
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s === "") return undefined;

  // uidNumber in LDAP must be an integer
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    logger.warn("Invalid ldap_uid_number (not an integer). Falling back.", { value: s, user: user?.username });
    return undefined;
  }
  return String(n);
}

function createLdapEntry(user) {
  // 1) Prefer observation-mapped UID (ldap_uid_number)
  // 2) Fallback: old behavior (user_id + 10000)
  const obsUid = pickObsUid(user);
  const uidNumber =
    obsUid ??
    (user.user_id !== undefined && user.user_id !== null
      ? String(parseInt(user.user_id, 10) + 10000)
      : "10000");

  const gidNumber =
    (user.gidNumber !== undefined && user.gidNumber !== null
      ? String(parseInt(user.gidNumber, 10) + 10000)
      : "10000");

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

  logger.debug("Created LDAP user entry", {
    dn: entry.dn,
    uid: entry.attributes.uid,
    uidNumber: entry.attributes.uidNumber,
    gidNumber: entry.attributes.gidNumber,
    uidSource: obsUid ? "observation" : "fallback",
  });

  console.log("entry", entry)

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

  logger.debug("Created LDAP group entry", {
    dn: entry.dn,
    cn: entry.attributes.cn,
    gidNumber: entry.attributes.gidNumber,
    memberUids: entry.attributes.memberUid?.length || 0
  });

  return entry;
}

module.exports = { createLdapEntry, createLdapGroupEntry };
