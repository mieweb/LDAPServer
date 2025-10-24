/**
 * LDAP entry creation utilities for the core package
 */

/**
 * Create an LDAP entry for a user
 * @param {Object} user - User object from directory provider
 * @param {string} baseDn - Base DN for the LDAP directory
 * @returns {Object} LDAP entry object
 */
function createLdapEntry(user, baseDn) {
  // Handle UID and GID numbers
  const uidNumber = user.uid_number !== undefined && user.uid_number !== null ? user.uid_number.toString() : "0";
  const gidNumber = user.gid_number !== undefined && user.gid_number !== null ? user.gid_number.toString() : "0";

  const entry = {
    dn: `uid=${user.username},${baseDn}`,
    attributes: {
      objectClass: ["top", "posixAccount", "inetOrgPerson", "shadowAccount"],
      uid: user.username,
      uidNumber,
      gidNumber,
      cn: user.full_name || user.username,
      gecos: user.full_name || user.username,
      sn: user.surname || "Unknown",
      mail: user.mail || `${user.username}@${extractDomainFromBaseDn(baseDn)}`,
      homeDirectory: user.home_directory || `/home/${user.username}`,
      loginShell: "/bin/bash",
      shadowLastChange: "0",
      userpassword: user?.password,
    },
  };

  return entry;
}

/**
 * Create an LDAP entry for a group
 * @param {Object} group - Group object from directory provider
 * @param {string} baseDn - Base DN for the LDAP directory
 * @returns {Object} LDAP group entry object
 */
function createLdapGroupEntry(group, baseDn) {
  const entry = {
    dn: group.dn || `cn=${group.name},${baseDn}`,
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

  return entry;
}

/**
 * Extract domain from base DN (e.g., "dc=example,dc=com" -> "example.com")
 * @param {string} baseDn - LDAP base DN
 * @returns {string} Domain name
 */
function extractDomainFromBaseDn(baseDn) {
  const dcParts = baseDn.match(/dc=([^,]+)/g);
  if (dcParts) {
    return dcParts.map(part => part.replace('dc=', '')).join('.');
  }
  return 'localhost';
}

module.exports = {
  createLdapEntry,
  createLdapGroupEntry,
  extractDomainFromBaseDn
};