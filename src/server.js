const ldap = require('ldapjs');
const dotenv = require('dotenv').config();
const logger = require('./utils/logger');
const { extractCredentials, getUsernameFromFilter } = require('./utils/utils');
const { setupGracefulShutdown } = require('./utils/shutdownUtils');
const dbConfig = require('./config/dbConfig');
const DatabaseService = require('./services/databaseServices');
const AuthService = require('./services/authService');
const DBBackend = require('./authProviders/dbBackend');
const LDAPBackend = require('./authProviders/ldapBackend');
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

  const backends = {
    [AUTHENTICATION_BACKEND.DATABASE]: new DBBackend(db),
    [AUTHENTICATION_BACKEND.LDAP]: new LDAPBackend(ldapServerPool),
  };

  const selectedBackend = backends[process.env.AUTH_BACKEND] || backends[AUTHENTICATION_BACKEND.LDAP];

  const authService = new AuthService(selectedBackend);

  // Create the LDAP server
  const server = ldap.createServer({
    certificate: process.env.LDAP_CERT_CONTENT,
    key: process.env.LDAP_KEY_CONTENT,
  });

  // Handle LDAP BIND (authentication) requests
  server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
    const { username, password } = extractCredentials(req); // Extract username and password from request


    try {
      // Authenticate the user using the selected backend
      const isAuthenticated = await authService.authenticate(username, password, req);

      logger.debug(`User ${username} authenticated: ${isAuthenticated}`);
      if (!isAuthenticated) {
        return next(new ldap.InvalidCredentialsError('Invalid credentials')); // Reject if authentication fails
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
      return next(new ldap.OperationsError('Authentication error')); // Handle errors gracefully
    }
  });

  // Handle LDAP SEARCH requests (user/group lookup)
server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
  const filterStr = req.filter.toString();
  logger.debug("LDAP Search Request:", { filterStr });

  const username = getUsernameFromFilter(filterStr);

  if (username || /(objectClass=posixAccount)|(objectClass=inetOrgPerson)/i.test(filterStr)) {
    if (username) {
      await handleUserSearch(username, res, db);
    } else {
      const users = await db.getAllUsers();
      for (const user of users) {
        const entry = createLdapEntry(user);
        res.send(entry);
      }
      res.end();
    }
  } else if (/(objectClass=posixGroup)|(memberUid=)/i.test(filterStr)) {
    await handleGroupSearch(filterStr, res, db);
  } else {
    logger.debug("LDAP Search Request: no match, ending");
    res.end();
  }
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
