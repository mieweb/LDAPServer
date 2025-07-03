function extractCredentials(req) {
  const dnParts = req.dn.toString().split(",");
  const username = dnParts[0].split("=")[1];
  const password = req.credentials;
  return { username, password };
}

const getUsernameFromFilter = (filterStr) => {
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
};

// Helper function to determine if this is a request for all users
const isAllUsersRequest = (filterStr, attributes) => {
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
};

module.exports = { extractCredentials, getUsernameFromFilter, isAllUsersRequest };