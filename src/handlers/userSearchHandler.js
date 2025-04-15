const { createLdapEntry } = require("../utils/ldapUtils");
const logger = require("../utils/logger");

async function handleUserSearch(username, res, db) {
  logger.debug("[USER SEARCH] Searching for:", { username });

  const user = await db.findUserByUsername(username);
  if (!user) return res.end();

  const entry = createLdapEntry(user);

  res.send(entry);
  res.end();
}

module.exports = { handleUserSearch };
