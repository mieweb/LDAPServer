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
  // Strip out non-printables
  const password = req.credentials.replace(/[^\x20-\x7E]/g, '');
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
  if (/(objectClass=posixAccount)|(objectClass=inetOrgPerson)|(objectClass=person)/i.test(filterStr)) {
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
  return /objectClass=/i.test(filterStr) || filterStr.length === 0;
}

module.exports = {
  extractCredentials,
  getUsernameFromFilter,
  isAllUsersRequest,
  isGroupSearchRequest,
  isMixedSearchRequest
};