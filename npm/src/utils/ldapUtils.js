/**
 * LDAP entry creation utilities for the core package
 */

/**
 * An object representing an LDAP entry
 * @typedef {Object} LdapUser
 * @property {string} username - Posix style username
 * @property {number} uid_number - User ID number
 * @property {number} gid_number - Group ID number
 * @property {string} [first_name] - User's given name
 * @property {string} [last_name] - User's family name
 * @property {string} [full_name] - User's full name
 * @property {string} [mail] - User's email address
 * @property {string} [home_directory] - User's home directory
 * @property {string} [login_shell] - User's login shell (e.g. "/bin/bash")
 */

/**
 * Generate the user's Full Name from first and/or last name, depending
 * on which are provided.
 * @param {LdapUser} user - User object
 * @returns {string|null} Full name
 */
function generateFullName(user) {
  if (user.full_name)
    return user.full_name;
  
  if (user.first_name && user.last_name)
    return `${user.first_name} ${user.last_name}`;
  
  if (user.first_name)
    return user.first_name;
  
  if (user.last_name)
    return user.last_name;

  return null;
}

/**
 * Create an LDAP entry for a user
 * @param {LdapUser} user - User object from directory provider
 * @param {string} baseDn - Base DN for the LDAP directory
 * @returns {Object} LDAP entry object
 * @throws {Error} If uid_number or gid_number is missing
 */
function createLdapEntry(user, baseDn) {
  // Validate required numeric identifiers
  if (user.uid_number === null || user.uid_number === undefined) {
    throw new Error(`uid_number is required for user ${user.username}`);
  }
  if (user.gid_number === null || user.gid_number === undefined) {
    throw new Error(`gid_number is required for user ${user.username}`);
  }

  const fullName = generateFullName(user);

  // mandatory and generated attributes
  const entry = {
    dn: `uid=${user.username},${baseDn}`,
    attributes: {
      objectClass: ["top", "posixAccount", "inetOrgPerson"],
      uid: user.username,
      uidNumber: user.uid_number,
      gidNumber: user.gid_number,
      cn: fullName || user.username,  // required attribute
      mail: user.mail || `${user.username}@${extractDomainFromBaseDn(baseDn)}`,
      homeDirectory: user.home_directory || `/home/${user.username}`,
      loginShell: user.login_shell || "/bin/bash", // Default to bash if not specified
    },
  };

  // optional attributes
  if (user.first_name)
    entry.attributes.givenName = user.first_name;

  if (user.last_name)
    entry.attributes.sn = user.last_name;

  if (fullName)
    entry.attributes.gecos = fullName;

  return entry;
}

/**
 * Create an LDAP entry for a group
 * @param {Object} group - Group object from directory provider
 * @param {string} baseDn - Base DN for the LDAP directory
 * @returns {Object} LDAP group entry object
 */
function createLdapGroupEntry(group, baseDn) {
  const gidNumber = group.gid_number || group.gidNumber;
  const entry = {
    dn: group.dn || `cn=${group.name},${baseDn}`,
    attributes: {
      objectClass: group.objectClass || ['posixGroup'],
      cn: group.name,
      gidNumber: gidNumber,
    }
  };

  // Add member UIDs if they exist (support both field names)
  const memberUids = group.memberUids || group.member_uids;
  if (memberUids && memberUids.length > 0) {
    // Ensure it's always an array (LDAP requirement for multi-valued attributes)
    entry.attributes.memberUid = Array.isArray(memberUids) ? memberUids : [memberUids];
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
  if (!baseDn || String(baseDn).trim().length === 0) {
    throw new Error('Invalid base DN');
  }

  const dcParts = String(baseDn).match(/dc=([^,]+)/gi);
  if (!dcParts) {
    throw new Error(`Invalid base DN: ${baseDn}`);
  }

  return dcParts
    .map(part => part.split('=')[1].trim())
    .join('.');
}


module.exports = {
  createLdapEntry,
  createLdapGroupEntry,
  extractDomainFromBaseDn
};