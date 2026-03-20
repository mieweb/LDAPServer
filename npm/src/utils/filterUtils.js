/**
 * LDAP filter and request parsing utilities
 */

/**
 * Extract credentials from an LDAP bind request
 * @param {Object} req - LDAP bind request object
 * @returns {Object} Object with username and password
 */
function extractCredentials(req) {
  const dnParts = req.dn.toString().split(",");
  const username = dnParts[0].split("=")[1];
  const password = req.credentials;

  return { username, password };
}

/**
 * Extract username from LDAP search filter
 * @param {string} filterStr - LDAP filter string
 * @returns {string|null} Username if found, null for wildcard or empty searches
 */
function getUsernameFromFilter(filterStr) {
  // Return null for empty filters - these should be handled as "get all" requests
  if (!filterStr || filterStr.trim().length === 0) {
    return null;
  }
  
  // Handles: (uid=*), (&(uid=ann)(...)), (|(uid=ann)(...))
  const uidPattern = /\((?:&|\||!)?(?:.*?\(uid=([^)&]+)\)|uid=([^)&]+))/i;
  const match = filterStr.match(uidPattern);
  const extractedUsername = match?.[1] || match?.[2] || null;
  
  // Return null for wildcard searches - these should be handled as "get all" requests
  if (extractedUsername === '*') {
    return null;
  }
  
  return extractedUsername;
}

/**
 * Determine if this is a request for all users
 * @param {string} filterStr - LDAP filter string
 * @param {Array} attributes - Requested attributes
 * @returns {boolean} True if this is an all users request
 */
function isAllUsersRequest(filterStr, attributes) {
  // Empty filter with user attributes
  if (!filterStr || filterStr.trim().length === 0) {
    return attributes.some(attr => ['uid', 'firstname', 'lastname', 'email', 'keys', 'enable', 'comment', 'expire'].includes(attr));
  }
  
  // Wildcard uid search
  if (/uid=\*/i.test(filterStr)) {
    return true;
  }
  
  // User objectClass searches
  if (/(objectClass=posixAccount)|(objectClass=inetOrgPerson)|(objectClass=person)|(objectClass=ldapPublicKey)/i.test(filterStr)) {
    return true;
  }
  
  return false;
}

/**
 * Determine if this is a group search request
 * @param {string} filterStr - LDAP filter string
 * @param {Array} attributes - Requested attributes
 * @returns {boolean} True if this is a group search request
 */
function isGroupSearchRequest(filterStr, attributes) {
  // Group objectClass searches
  const isGroupSearch =
    /(objectClass=posixGroup)|(objectClass=groupOfNames)|(memberUid=)/i.test(filterStr) ||
    /gidNumber=/i.test(filterStr) ||
    /cn=/i.test(filterStr) ||  // cn= in filter is for groups (groups use cn= in DN)
    (filterStr.length === 0 && (attributes.includes('member') || attributes.includes('uniqueMember') || attributes.includes('memberOf'))) ||
    attributes.includes('gidNumber') ||
    attributes.includes('memberUid') ||
    (attributes.includes('cn') && attributes.length === 1); // Common group-only attribute requests

  return isGroupSearch;
}

/**
 * Determine if this is a mixed search (both users and groups)
 * @param {string} filterStr - LDAP filter string
 * @returns {boolean} True if this is a mixed search request
 */
function isMixedSearchRequest(filterStr) {
  if (!filterStr) return true;

  // objectClass=* is mixed
  if (/objectClass=\*/i.test(filterStr)) return true;

  if (/objectClass=top/i.test(filterStr)) return true;

  return false;
}

/**
 * Parse LDAP filter string and extract filter conditions
 * Handles compound filters like (&(objectClass=posixGroup)(cn=groupname))
 * @param {string} filterStr - LDAP filter string
 * @returns {Object} Object with extracted filter conditions
 */
function parseGroupFilter(filterStr) {
  if (!filterStr || typeof filterStr !== 'string') {
    return {};
  }

  const result = {};

  // Extract cn (group name)
  const cnMatch = filterStr.match(/cn=([^)&|]+)/i);
  if (cnMatch) {
    result.cn = cnMatch[1].trim();
  }

  // Extract memberUid
  const memberUidMatch = filterStr.match(/memberUid=([^)&|]+)/i);
  if (memberUidMatch) {
    result.memberUid = memberUidMatch[1].trim();
  }

  // Extract gidNumber
  const gidNumberMatch = filterStr.match(/gidNumber=([^)&|]+)/i);
  if (gidNumberMatch) {
    const gidValue = gidNumberMatch[1].trim();
    result.gidNumber = gidValue === '*' ? '*' : gidValue;
  }

  // Check for objectClass=posixGroup
  if (/objectClass=posixGroup/i.test(filterStr)) {
    result.objectClass = 'posixGroup';
  }

  return result;
}

module.exports = {
  extractCredentials,
  getUsernameFromFilter,
  isAllUsersRequest,
  isGroupSearchRequest,
  isMixedSearchRequest,
  parseGroupFilter
};