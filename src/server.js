require("dotenv").config();
const ldap = require("ldapjs");

const dbConfig = require("./config/dbconfig");
const DatabaseService = require("./services/databaseServices");
const NotificationService = require("./services/notificationService");

const { NOTIFICATION_ACTIONS } = require("./constants/constants");
const { extractCredentials } = require("./utils/utils");
const { createLdapEntry } = require("./utils/ldapUtils");
const { setupGracefulShutdown } = require("./utils/shutdownUtils");

const db = new DatabaseService(dbConfig);

async function authenticateWithLDAP(username, password) {
  console.log("Authenticating with LDAP:", username, password);
  return new Promise((resolve, reject) => {
    try {
      const client = ldap.createClient({
        url: process.env.LDAP_URL,
        timeout: 5000,
        connectTimeout: 5000,
      });

      client.on("error", (err) => {
        console.error("LDAP client error:", err);
        resolve(false);
      });

      client.on("connectTimeout", (err) => {
        console.error("LDAP connection timeout:", err);
        resolve(false);
      });

      client.on("connectError", (err) => {
        console.error("LDAP connection error:", err);
        resolve(false);
      });

      const userDN = `cn=${username},ou=users,dc=mieweb,dc=com`;
      console.log("userDN", userDN);

      client.bind(userDN, password, (err) => {
        console.log("userDn, password", userDN, password);
        if (err) {
          console.error("LDAP Authentication failed:", err);
          client.unbind();
          resolve(false);
        } else {
          console.log("LDAP Authentication successful for user:", username);
          client.unbind();
          resolve(true);
        }
      });
    } catch (err) {
      console.error("Error creating LDAP client:", err);
      resolve(false);
    }
  });
}

async function startLDAPServer() {
  try {
    // Initialize database connection pool
    await db.initialize();
    console.log(`Database connection pool initialized (${dbConfig.type})`);

    const certContent = process.env.LDAP_CERT_CONTENT;
    const keyContent = process.env.LDAP_KEY_CONTENT;

    if (!certContent || !keyContent) {
      console.error(
        "Error: Certificate or key content is missing in environment variables!"
      );
      process.exit(1);
    }

    const server = ldap.createServer({
      certificate: certContent,
      key: keyContent,
    });

    server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
      const { username, password } = extractCredentials(req);
      console.log("Authenticating user:", username);

      try {
        const user = await db.findUserByUsername(username);

        if (!user) {
          return next(new ldap.InvalidCredentialsError("User not found"));
        }

        console.log("User found:", user);

        const isAuthenticated = await authenticateWithLDAP(username, password);

        console.log("LDAP Authentication result:", isAuthenticated);

        if (!isAuthenticated) {
          console.log("LDAP authentication failed for user:", username);
          return next(new ldap.InvalidCredentialsError("Invalid credentials"));
        }

        console.log("User authenticated:", username);
        try {
          console.log("Sending notification to User", username)
          const response = await NotificationService.sendAuthenticationNotification(username);

          if (response.action === NOTIFICATION_ACTIONS.APPROVE) {
            console.log("Notification approved for user:", username);
            res.end();
          } else if (response.action === NOTIFICATION_ACTIONS.TIMEOUT) {
            console.log("Notification timeout for user:", username);
            return next(
              new ldap.UnavailableError("Authentication timeout (30 seconds)")
            );
          } else {
            console.log("Notification rejected for user:", username);
            return next(
              new ldap.InvalidCredentialsError(
                "Authentication rejected by user"
              )
            );
          }
        } catch (notificationError) {
          console.error("Notification error:", notificationError);
          return next(new ldap.OperationsError("Notification failed"));
        }
      } catch (error) {
        console.error("Authentication error:", error);
        return next(new ldap.OperationsError("Authentication failed"));
      }
    });

    async function handleUserSearch(username, res) {
      console.log("[USER] Searching for:", username);

      const user = await db.findUserByUsername(username);
      if (!user) return res.end();
      const entry = createLdapEntry(user);
      res.send(entry);
      res.end();
    }

    const handleGroupSearch = async (filterStr, res) => {
      const memberUidMatch = filterStr.match(/memberUid=([^)&]+)/i);

      try {
        if (memberUidMatch) {
          // Search groups by memberUid
          const username = memberUidMatch[1];

          // Using driver to find groups
          const groups = await db.findGroupsByMemberUid(username);

          console.log(`[GROUP SEARCH] Found ${groups.length} groups`);

          groups.forEach((group) => {
            console.log(`[GROUP] Sending group: ${group.name}, ${group}`);
            res.send({
              dn: `cn=${group.name},ou=groups,dc=mieweb,dc=com`,
              attributes: {
                objectClass: ["posixGroup"],
                cn: group.name,
                gidNumber: group.gid.toString(),
                memberUid: group.member_uids,
              },
            });
          });
        }

        res.end();
      } catch (error) {
        console.error("[GROUP SEARCH] Error:", error);
        res.end();
      }
    };

    const getUsernameFromFilter = (filterStr) => {
      // Handles: (uid=*), (&(uid=ann)(...)), (|(uid=ann)(...))
      const uidPattern = /\((?:&|\||!)?(?:.*?\(uid=([^)&]+)\)|uid=([^)&]+))/i;
      const match = filterStr.match(uidPattern);
      return match?.[1] || match?.[2] || null;
    };

    server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
      try {
        const filterStr = req.filter.toString();
        const username = getUsernameFromFilter(filterStr);
        console.log(`[SEARCH] Filter: ${filterStr}`);
        console.log(`[SEARCH] Parsed username: ${username || "none"}`);

        // Handle user searches
        if (username) {
          console.log("[HANDLER] Processing user search");
          await handleUserSearch(username, res);
        }
        // Handle group searches (posixGroup or memberUid filters)
        else if (/(objectClass=posixGroup)|(memberUid=)/i.test(filterStr)) {
          console.log("[HANDLER] Processing group search");
          await handleGroupSearch(filterStr, res);
        }
        // Unknown search type
        else {
          console.log("[HANDLER] Unhandled search type");
          res.end();
        }
      } catch (error) {
        console.error("[ERROR] Search failed:", error.message);
        console.error(error.stack);
        return next(new ldap.OperationsError("Search operation failed"));
      }
    });

    const PORT = 636;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Secure LDAP Authentication Server listening on port ${PORT}`
      );
    });

    setupGracefulShutdown({ db });
  } catch (error) {
    console.error("Failed to start LDAP server:", error);
    process.exit(1);
  }
}

startLDAPServer();