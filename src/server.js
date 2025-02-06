require("dotenv").config();
const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const dbConfig = require("./config/dbconfig");
const { hashPassword } = require("./utils/passwordUtils");
const NotificationService = require("./services/notificationService");
const { NOTIFICATION_ACTIONS } = require("./constants/constants");
const { extractCredentials } = require("./utils/utils");
const { createLdapEntry } = require("./utils/ldapUtils");

// Main server function
async function startLDAPServer() {
  try {
    const certPath = path.join(__dirname, "certificates", "server-cert.pem");
    const keyPath = path.join(__dirname, "certificates", "server-key.pem");

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.error("Error: Certificate files are missing!");
      process.exit(1);
    }

    const server = ldap.createServer({
      certificate: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    });

    server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
      console.log("Start Bind operation...");
      const { username, password } = extractCredentials(req);

      try {
        const connection = await mysql.createConnection(dbConfig);
        try {
          const [rows] = await connection.execute(
            "SELECT username, password, salt FROM users WHERE username = ?",
            [username]
          );

          if (rows.length === 0) {
            return next(new ldap.InvalidCredentialsError("User not found"));
          }

          const user = rows[0];

          // Verify password
          console.log("Verifying password...");
          if (hashPassword(password, user.salt) !== user.password) {
            return next(
              new ldap.InvalidCredentialsError("Invalid credentials")
            );
          }

          // Send push notification
          console.log("Sending push notification...");
          try {
            const response =
              await NotificationService.sendAuthenticationNotification();

            console.log("Notification response:", response);

            if (response.action === NOTIFICATION_ACTIONS.APPROVE) {
              console.log("User approved request.");
              res.end();
            } else {
              console.log("User rejected request.");
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
        } finally {
          await connection.end();
        }
      } catch (error) {
        console.error("Authentication error:", error);
        return next(new ldap.OperationsError("Authentication failed"));
      }
    });

    server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
      console.log("\n[DEBUG] Incoming search request:");
      console.log("Filter:", req.filter.toString());
      console.log("Attributes Requested:", req.attributes);

      const match = req.filter.toString().match(/\(uid=([^)]*)\)/);
      const username = match ? match[1] : null;

      if (!username) {
        console.error("[ERROR] Invalid filter for extracting username");
        res.end();
        return next(new ldap.OperationsError("Invalid filter"));
      }

      try {
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute(
          `SELECT 
            username, 
            uid_number, 
            gid_number, 
            home_directory, 
            full_name,
            password
           FROM users 
           WHERE username = ?`,
          [username]
        );

        if (rows.length === 0) {
          console.error("[ERROR] User not found:", username);
          res.end();
          return next();
        }

        const user = rows[0];
        const entry = createLdapEntry(user);

        console.log("\n[DEBUG] Responding with entry:");
        console.log(JSON.stringify(entry, null, 2));

        res.send(entry);
        res.end();
      } catch (error) {
        console.error("[ERROR] Search operation failed:", error.message);
        return next(new ldap.OperationsError("Search failed"));
      }
    });

    const PORT = 636;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Secure LDAP Authentication Server listening on port ${PORT}`
      );
    });
  } catch (error) {
    console.error("Failed to start LDAP server:", error);
    process.exit(1);
  }
}

// Call the start function
startLDAPServer();
