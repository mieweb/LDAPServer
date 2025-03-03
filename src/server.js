require("dotenv").config();
const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const express = require("express");

const dbConfig = require("./config/dbconfig");
const NotificationService = require("./services/notificationService");

const { NOTIFICATION_ACTIONS } = require("./constants/constants");
const { extractCredentials } = require("./utils/utils");
const { createLdapEntry } = require("./utils/ldapUtils");

// Initialize Express app
const app = express();
app.use(express.json());

async function authenticateWithLDAP(username, password) {
  console.log("Authenticating with LDAP:", username, password);
  return new Promise((resolve, reject) => {
    try {
      const client = ldap.createClient({
        url: "ldap://localhost:389",
        timeout: 5000, // Add a timeout
        connectTimeout: 5000, // Add a connect timeout
      });

      // Add error event handlers
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

app.post("/update-app-id", async (req, res) => {
  const { username, appId } = req.body;

  if (!username || !appId) {
    return res.status(400).json({ message: "Username and appId are required" });
  }

  try {
    const connection = await mysql.createConnection(dbConfig);

    // Check if the user exists
    const [rows] = await connection.execute(
      "SELECT username FROM users WHERE username = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    await connection.execute("UPDATE users SET appId = ? WHERE username = ?", [
      appId,
      username,
    ]);

    const [updatedUser] = await connection.execute(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    await connection.end();

    // Return the updated user data
    return res
      .status(200)
      .json({ message: "AppId linked successfully", user: updatedUser[0] });
  } catch (error) {
    console.error("Error linking appId:", error);
    return res.status(500).json({ message: "Error linking appId" });
  }
});

// Main server function
async function startLDAPServer() {
  try {
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
        const connection = await mysql.createConnection(dbConfig);
        try {
          const [rows] = await connection.execute(
            "SELECT username, appId FROM users WHERE username = ?",
            [username]
          );

          if (rows.length === 0) {
            return next(new ldap.InvalidCredentialsError("User not found"));
          }

          const user = rows[0];

          console.log("User found:", user);

          const isAuthenticated = await authenticateWithLDAP(
            username,
            password
          );

          console.log("LDAP Authentication result:", isAuthenticated);

          if (!isAuthenticated) {
            console.log("LDAP authentication failed for user:", username);
            return next(
              new ldap.InvalidCredentialsError("Invalid credentials")
            );
          }

          console.log("User authenticated:", username);
          // Handle notification if user has appId
          if (user.appId) {
            try {
              console.log("Sending notification to appId:", user.appId);
              const response =
                await NotificationService.sendAuthenticationNotification(
                  user.appId
                );

              if (response.action === NOTIFICATION_ACTIONS.APPROVE) {
                console.log("Notification approved for user:", username);
                res.end();
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
          } else {
            // If authentication succeeded and no appId for notification
            console.log("Authentication successful (no notification needed)");
            res.end();
          }
        } finally {
          await connection.end();
        }
      } catch (error) {
        return next(new ldap.OperationsError("Authentication failed"));
      }
    });

    async function handleUserSearch(username, res) {
      console.log("[USER] Searching for:", username);

      const connection = await mysql.createConnection(dbConfig);
      const [users] = await connection.execute(
        `SELECT * FROM users WHERE username = ?`,
        [username]
      );

      if (users.length === 0) {
        await connection.end();
        res.end();
        return;
      }

      const user = users[0];
      const entry = createLdapEntry(user);

      res.send(entry);
      res.end();
      await connection.end();
    }

    const handleGroupSearch = async (filterStr, res) => {
      const memberUidMatch = filterStr.match(/memberUid=([^)&]+)/i);
      const connection = await mysql.createConnection(dbConfig);

      try {
        if (memberUidMatch) {
          // Search groups by memberUid
          const username = memberUidMatch[1];
          // make this configurable in a script
          const [groups] = await connection.execute(
            `SELECT g.name, g.gid, g.member_uids 
         FROM \`groups\` g
         WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))`,
            [username]
          );

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
      } finally {
        await connection.end();
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

    app.listen(3000, () => {
      console.log("API Server listening on port 3000");
    });
  } catch (error) {
    console.error("Failed to start LDAP server:", error);
    process.exit(1);
  }
}

startLDAPServer();
