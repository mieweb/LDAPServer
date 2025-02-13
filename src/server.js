require("dotenv").config();
const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const express = require("express");

const dbConfig = require("./config/dbconfig");
const NotificationService = require("./services/notificationService");

const { NOTIFICATION_ACTIONS } = require("./constants/constants");
const { hashPassword } = require("./utils/passwordUtils");
const { extractCredentials } = require("./utils/utils");
const { createLdapEntry } = require("./utils/ldapUtils");

// Initialize Express app
const app = express();
app.use(express.json());

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

      try {
        const connection = await mysql.createConnection(dbConfig);
        try {
          const [rows] = await connection.execute(
            "SELECT username, password, salt, appId FROM users WHERE username = ?",
            [username]
          );

          if (rows.length === 0) {
            return next(new ldap.InvalidCredentialsError("User not found"));
          }

          const user = rows[0];

          if (hashPassword(password, user.salt) !== user.password) {
            return next(
              new ldap.InvalidCredentialsError("Invalid credentials")
            );
          }

          try {
            const response =
              await NotificationService.sendAuthenticationNotification(
                user.appId
              );

            if (response.action === NOTIFICATION_ACTIONS.APPROVE) {
              res.end();
            } else {
              return next(
                new ldap.InvalidCredentialsError(
                  "Authentication rejected by user"
                )
              );
            }
          } catch (notificationError) {
            return next(new ldap.OperationsError("Notification failed"));
          }
        } finally {
          await connection.end();
        }
      } catch (error) {
        return next(new ldap.OperationsError("Authentication failed"));
      }
    });

    server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
      const match = req.filter.toString().match(/\(uid=([^)]*)\)/);
      const username = match ? match[1] : null;

      if (!username) {
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
            password,
            appId
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

        res.send(entry);
        res.end();
      } catch (error) {
        return next(new ldap.OperationsError("Search failed"));
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
