const ldap = require('ldapjs');
const dotenv = require('dotenv').config();
const logger = require('./utils/logger');
const { extractCredentials, getUsernameFromFilter, isAllUsersRequest } = require('./utils/utils');
const { setupGracefulShutdown } = require('./utils/shutdownUtils');
const dbConfig = require('./config/dbConfig');
const DatabaseService = require('./services/databaseServices');
const AuthService = require('./services/authService');
const DBAuth = require('./auth/providers/auth/dbBackend');
const LDAPAuth = require('./auth/providers/auth/ldapBackend');
const ProxmoxAuth = require('./auth/providers/auth/proxmoxBackend');
const DBDirectory = require('./auth/providers/directory/DBDirectory');
const ProxmoxDirectory = require('./auth/providers/directory/ProxmoxDirectory');
const resolveLDAPHosts = require('./utils/resolveLdapHosts');
const NotificationService = require('./services/notificationService');
const { AUTHENTICATION_BACKEND } = require('./constants/constants');
const { handleUserSearch, handleGroupSearch } = require('./handlers/searchHandlers');
const { createLdapEntry } = require('./utils/ldapUtils');

// Initialize the database connection
const db = new DatabaseService(dbConfig);

// Function to start the LDAP server
async function startServer() {
  await db.initialize();

  let ldapServerPool = [];
  if (process.env.AUTH_BACKEND === AUTHENTICATION_BACKEND.LDAP) {
    ldapServerPool = await resolveLDAPHosts();
  }

  // Set up directory providers
  const directoryBackends = {
    db: new DBDirectory(db),
    proxmox: new ProxmoxDirectory('user.cfg'),
  };
  const selectedDirectory = directoryBackends[process.env.DIRECTORY_BACKEND] || directoryBackends['db'];
  console.log("selected directory", selectedDirectory)

  // Set up authentication providers
  const authBackends = {
    db: new DBAuth(db),
    ldap: new LDAPAuth(ldapServerPool),
    proxmox: new ProxmoxAuth('test.cfg'),
  };
  const selectedBackend = authBackends[process.env.AUTH_BACKEND] || authBackends[AUTHENTICATION_BACKEND.DATABASE];
  const authService = new AuthService(selectedBackend);
  console.log("authservice", authService)

  // Create the LDAP server
  const server = ldap.createServer({
    certificate: process.env.LDAP_CERT_CONTENT,
    key: process.env.LDAP_KEY_CONTENT,
  });

  // Anonymous bind support
  server.bind('', (req, res, next) => {
    logger.debug("Anonymous bind request - allowing for search operations");
    res.end();
  });

  // Authenticated bind (LDAP BIND)
  server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
    const { username, password } = extractCredentials(req);

    logger.debug("Authenticated bind request", { username, password });

    try {
      // Authenticate the user using the selected backend
      const isAuthenticated = await authService.authenticate(username, password, req);

      logger.debug(`User ${username} authenticated: ${isAuthenticated}`);
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

  // LDAP SEARCH
  server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
    const filterStr = req.filter.toString();
    const bindDN = req.connection.ldap.bindDN;

    logger.debug("\n🔍 =========================");
    logger.debug("🔍 LDAP SEARCH REQUEST:");
    logger.debug("🔍 Filter:", filterStr);
    logger.debug("🔍 Bind DN:", bindDN ? bindDN.toString() : 'anonymous');
    logger.debug("🔍 Base Object:", req.baseObject.toString());
    logger.debug("🔍 Scope:", req.scope);
    logger.debug("🔍 Attributes:", req.attributes);
    logger.debug("🔍 =========================\n");

    const username = getUsernameFromFilter(filterStr);
    console.log("getUsernameFromFilter:", username);

    if (username) {
      logger.debug(`📤 RETURNING SPECIFIC USER: ${username}`);
      const response = await handleUserSearch(username, res, selectedDirectory);
      console.log("RESPONSE", response)
      return;
    }

    if (isAllUsersRequest(filterStr, req.attributes)) {
      logger.debug("📤 RETURNING ALL USERS - detected user sync request:", filterStr);

      const users = await selectedDirectory.getAllUsers();
      logger.debug(`📤 Found ${users.length} users`);

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

    const isGroupSearch =
      /(objectClass=posixGroup)|(objectClass=groupOfNames)|(memberUid=)/i.test(filterStr) ||
      (filterStr.length === 0 && (req.attributes.includes('member') || req.attributes.includes('uniqueMember') || req.attributes.includes('memberOf'))) ||
      req.attributes.includes('gidNumber') ||
      req.attributes.includes('memberUid');

    if (isGroupSearch) {
      logger.debug("📤 RETURNING GROUPS FOR GROUP SEARCH:", filterStr);
      await handleGroupSearch(filterStr, res, selectedDirectory);
      return;
    }

    if (/objectClass=/i.test(filterStr)) {
      logger.debug("📤 GENERIC OBJECTCLASS SEARCH - RETURNING BOTH USERS AND GROUPS:", filterStr);

      const users = await selectedDirectory.getAllUsers();
      for (const user of users) {
        const entry = createLdapEntry(user);
        res.send(entry);
      }

      await handleGroupSearch(filterStr, res, selectedDirectory);
      return;
    }

    logger.debug("❌ No matching pattern found in filter, ending");
    res.end();
  });

  // Start the LDAP server
  const PORT = 636;
  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`LDAP Server listening on port ${PORT}`);
  });

  // Graceful shutdown
  setupGracefulShutdown({ db });
}

module.exports = startServer;
