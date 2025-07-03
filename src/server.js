const ldap = require('ldapjs');
const dotenv = require('dotenv').config();
const logger = require('./utils/logger');
const { extractCredentials, getUsernameFromFilter, isAllUsersRequest } = require('./utils/utils');
const { setupGracefulShutdown } = require('./utils/shutdownUtils');
const dbConfig = require('./config/dbConfig');
const DatabaseService = require('./services/databaseServices');
const AuthService = require('./services/authService');
const DBBackend = require('./authProviders/dbBackend');
const LDAPBackend = require('./authProviders/ldapBackend');
const NotificationService = require('./services/notificationService');
const { AUTHENTICATION_BACKEND } = require('./constants/constants');
const { handleUserSearch, handleGroupSearch } = require('./handlers/searchHandlers');
const { createLdapEntry } = require('./utils/ldapUtils');

// Initialize the database connection
const db = new DatabaseService(dbConfig);

// Function to start the LDAP server
async function startServer() {
  await db.initialize();
  
  const backends = {
    [AUTHENTICATION_BACKEND.DATABASE]: new DBBackend(db),
    [AUTHENTICATION_BACKEND.LDAP]: new LDAPBackend(),
  };
  
  const selectedBackend = backends[process.env.AUTH_BACKEND] || backends[AUTHENTICATION_BACKEND.LDAP];
  const authService = new AuthService(selectedBackend);

  // Create the LDAP server
  const server = ldap.createServer({
    certificate: process.env.LDAP_CERT_CONTENT,
    key: process.env.LDAP_KEY_CONTENT,
  });

  // IMPORTANT: Add anonymous bind support FIRST
  server.bind('', (req, res, next) => {
    logger.debug("Anonymous bind request - allowing for search operations");
    res.end(); // Allow anonymous bind
  });

  // Handle LDAP BIND (authentication) requests for specific users
  server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
    const { username, password } = extractCredentials(req);
    
    logger.debug("Authenticated bind request", { username });
    
    try {
      // Authenticate the user using the selected backend
      const isAuthenticated = await authService.authenticate(username, password, req);
      
      if (!isAuthenticated) {
        return next(new ldap.InvalidCredentialsError('Invalid credentials'));
      }
      
      if (process.env.ENABLE_NOTIFICATION === 'true') {
        const response = await NotificationService.sendAuthenticationNotification(username);
        if (response.action === "APPROVE") {
          res.end();
        } else {
          return next(new ldap.InvalidCredentialsError('Authentication rejected'));
        }
      } else {
        res.end();
      }
    } catch (error) {
      logger.error("Bind error", { error });
      return next(new ldap.OperationsError('Authentication error'));
    }
  });

  // Handle LDAP SEARCH requests (user/group lookup)
server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
  const filterStr = req.filter.toString();
  const bindDN = req.connection.ldap.bindDN;
  
  // DETAILED DEBUGGING
  logger.debug("\n🔍 =========================");
  logger.debug("🔍 LDAP SEARCH REQUEST:");
  logger.debug("🔍 Filter:", filterStr);
  logger.debug("🔍 Filter Length:", filterStr.length);
  logger.debug("🔍 Bind DN:", bindDN ? bindDN.toString() : 'anonymous');
  logger.debug("🔍 Base Object:", req.baseObject.toString());
  logger.debug("🔍 Scope:", req.scope);
  logger.debug("🔍 Attributes:", req.attributes);
  logger.debug("🔍 =========================\n");
  
  const username = getUsernameFromFilter(filterStr);
  
  // Handle specific user searches (only when we have a real username, not wildcard)
  if (username) {
    logger.debug(`📤 RETURNING SPECIFIC USER: ${username}`);
    await handleUserSearch(username, res, db);
    return;
  }
  
  // Handle requests for ALL users (empty filter, wildcard, or user objectClass)
  if (isAllUsersRequest(filterStr, req.attributes)) {
    logger.debug("📤 RETURNING ALL USERS - detected user sync request:", filterStr);
    
    const users = await db.getAllUsers();
    logger.debug(`📤 Found ${users.length} users in database`);
    
    for (const user of users) {
      const entry = createLdapEntry(user);
      logger.debug("📤 Sending user entry:", {
        dn: entry.dn,
        uid: entry.attributes.uid,
        objectClass: entry.attributes.objectClass,
        cn: entry.attributes.cn
      });
      res.send(entry);
    }
    
    logger.debug("✅ User search completed, ending response");
    res.end();
    return;
  }
  
  // Handle group searches - multiple conditions
  const isGroupSearch = 
    /(objectClass=posixGroup)|(objectClass=groupOfNames)|(memberUid=)/i.test(filterStr) ||
    (filterStr.length === 0 && (req.attributes.includes('member') || req.attributes.includes('uniqueMember') || req.attributes.includes('memberOf'))) ||
    req.attributes.includes('gidNumber') ||
    req.attributes.includes('memberUid');
    
  if (isGroupSearch) {
    logger.debug("📤 RETURNING GROUPS FOR GROUP SEARCH:", filterStr);
    logger.debug("📤 Group search triggered by:", {
      hasGroupObjectClass: /(objectClass=posixGroup)|(objectClass=groupOfNames)/.test(filterStr),
      hasMemberUid: /(memberUid=)/.test(filterStr),
      isEmptyFilterWithGroupAttrs: filterStr.length === 0 && (req.attributes.includes('member') || req.attributes.includes('uniqueMember') || req.attributes.includes('memberOf')),
      hasGidNumber: req.attributes.includes('gidNumber'),
      hasMemberUidAttr: req.attributes.includes('memberUid')
    });
    await handleGroupSearch(filterStr, res, db);
    return;
  }
  
  // Handle generic objectClass search (return both users and groups)
  if (/objectClass=/i.test(filterStr)) {
    logger.debug("📤 GENERIC OBJECTCLASS SEARCH - RETURNING BOTH USERS AND GROUPS:", filterStr);
    
    // Return users first
    const users = await db.getAllUsers();
    logger.debug(`📤 Found ${users.length} users in database`);
    
    for (const user of users) {
      const entry = createLdapEntry(user);
      logger.debug("📤 Sending user entry:", {
        dn: entry.dn,
        uid: entry.attributes.uid,
        objectClass: entry.attributes.objectClass,
        cn: entry.attributes.cn
      });
      res.send(entry);
    }
    
    // Then return groups
    logger.debug("📤 Now returning groups...");
    await handleGroupSearch(filterStr, res, db);
    return;
  }
  
  logger.debug("❌ No matching pattern found in filter, ending");
  res.end();
});



  // Start the server and listen on port 636 (LDAP)
  const PORT = 636;
  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`LDAP Server listening on port ${PORT}`);
  });

  // Handle graceful shutdown of resources
  setupGracefulShutdown({ db });
}

// Export the server start function
module.exports = startServer;