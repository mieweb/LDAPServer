const ldap = require("ldapjs");

const dbConfig = require("./config/dbconfig");
const DatabaseService = require("./services/databaseServices");
const NotificationService = require("./services/notificationService");
const logger = require("./utils/logger");

const { NOTIFICATION_ACTIONS } = require("./constants/constants");
const { handleUserSearch } = require("./handlers/userSearchHandler");
const { handleGroupSearch } = require("./handlers/groupSearchHandler");
const { extractCredentials, getUsernameFromFilter } = require("./utils/utils");
const { setupGracefulShutdown } = require("./utils/shutdownUtils");

const db = new DatabaseService(dbConfig);

// Rate-limiting in-memory tracking
const failedAttempts = new Map();

function trackFailedAttempt(username) {
  const attempts = failedAttempts.get(username) || 0;
  failedAttempts.set(username, attempts + 1);

  if (attempts > 5) {
    logger.warn("Possible rainbow attack detected", { username });
  }
}

async function authenticateWithLDAP(username, password, req) {
  logger.debug("Authenticating with LDAP", { username, clientIP: req.connection.remoteAddress });

  return new Promise((resolve, reject) => {
    try {
      const client = ldap.createClient({
        url: process.env.LDAP_URL,
        timeout: 5000,
        connectTimeout: 5000,
      });

      client.on("error", (err) => {
        logger.error("LDAP client error:", { err, clientIP: req.connection.remoteAddress });
        resolve(false);
      });

      client.on("connectTimeout", (err) => {
        logger.error("LDAP connection timeout:", { err, clientIP: req.connection.remoteAddress });
        resolve(false);
      });

      client.on("connectError", (err) => {
        logger.error("LDAP connection error:", { err, clientIP: req.connection.remoteAddress });
        resolve(false);
      });

      const userDN = `cn=${username},ou=users,dc=mieweb,dc=com`;
      client.bind(userDN, password, (err) => {
        if (err) {
          logger.error("InvalidCredentials", { username, clientIP: req.connection.remoteAddress });
          trackFailedAttempt(username);
          client.unbind();
          resolve(false);
        } else {
          logger.info("LDAP Authentication successful", { username });
          client.unbind();
          resolve(true);
        }
      });
    } catch (err) {
      logger.error("Error creating LDAP client", { err, clientIP: req.connection.remoteAddress });
      resolve(false);
    }
  });
}

async function startLDAPServer() {
  try {
    // Initialize database connection pool
    await db.initialize();
    logger.info(`Database connection pool initialized (${dbConfig.type})`);

    const certContent = process.env.LDAP_CERT_CONTENT;
    const keyContent = process.env.LDAP_KEY_CONTENT;

    if (!certContent || !keyContent) {
      logger.error("Error: Certificate or key content is missing in environment variables!");
      process.exit(1);
    }

    const server = ldap.createServer({
      certificate: certContent,
      key: keyContent,
    });

    server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
      const { username, password } = extractCredentials(req);
      logger.debug("Authenticating user", { username, clientIP: req.connection.remoteAddress });

      try {
        const user = await db.findUserByUsername(username);

        if (!user) {
          return next(new ldap.InvalidCredentialsError("User not found"));
        }

        const isAuthenticated = await authenticateWithLDAP(username, password, req);

        if (!isAuthenticated) {
          return next(new ldap.InvalidCredentialsError("Invalid credentials"));
        }

        try {
          const response = await NotificationService.sendAuthenticationNotification(username);

          if (response.action === NOTIFICATION_ACTIONS.APPROVE) {
            res.end();
          } else if (response.action === NOTIFICATION_ACTIONS.TIMEOUT) {
            return next(new ldap.UnavailableError("Authentication timeout"));
          } else {
            return next(new ldap.InvalidCredentialsError("Authentication rejected"));
          }
        } catch (notificationError) {
          logger.error("Notification error", { notificationError });
          return next(new ldap.OperationsError("Notification failed"));
        }
      } catch (error) {
        logger.error("Authentication error", { error });
        return next(new ldap.OperationsError("Authentication failed"));
      }
    });

    server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
      try {
        const filterStr = req.filter.toString();
        logger.debug("LDAP Search Query", { filter: filterStr, clientIP: req.connection.remoteAddress });

        const username = getUsernameFromFilter(filterStr);

        if (username) {
          await handleUserSearch(username, res, db);
        } else if (/(objectClass=posixGroup)|(memberUid=)/i.test(filterStr)) {
          await handleGroupSearch(filterStr, res, db);
        } else {
          res.end();
        }
      } catch (error) {
        logger.error("Search operation failed", { error });
        return next(new ldap.OperationsError("Search operation failed"));
      }
    });

    const PORT = 636;
    server.listen(PORT, "0.0.0.0", () => {
      logger.info(`Secure LDAP Authentication Server listening on port ${PORT}`);
    });

    setupGracefulShutdown({ db });
  } catch (error) {
    logger.error("Failed to start LDAP server", { error });
    process.exit(1);
  }
}

if (require.main === module) {
  startLDAPServer();
}

module.exports = {
  authenticateWithLDAP,
};
