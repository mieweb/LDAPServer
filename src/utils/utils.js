function extractCredentials(req) {
  const dnParts = req.dn.toString().split(",");
  const username = dnParts[0].split("=")[1];
  const password = req.credentials;

  return { username, password };
}

const getUsernameFromFilter = (filterStr) => {
  // Handles: (uid=*), (&(uid=ann)(...)), (|(uid=ann)(...))
  const uidPattern = /\((?:&|\||!)?(?:.*?\(uid=([^)&]+)\)|uid=([^)&]+))/i;
  const match = filterStr.match(uidPattern);
  return match?.[1] || match?.[2] || null;
};

module.exports = { extractCredentials, getUsernameFromFilter };

