const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const fs = require("fs");
const crypto = require("crypto");

// MySQL connection configuration
const dbConfig = {
  host: process.env.MYSQL_HOST || "mysql",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "rootpassword",
  database: process.env.MYSQL_DATABASE || "ldap_user_db",
};

// Helper function to hash passwords
function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(
      password,
      salt,
      1000, // iterations
      64, // key length
      "sha512"
    )
    .toString("hex");
}

// Main server function
async function startLDAPServer() {
  try {
    const server = ldap.createServer({
      // certificate: fs.readFileSync("/certificates/server-cert.pem"),
      // key: fs.readFileSync("/certificates/server-key.pem"),
    });

    // Bind operation - authentication
    server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
      console.log("Start Bind operation...");
      const dnParts = req.dn.toString().split(",");
      const username = dnParts[0].split("=")[1];
      const password = req.credentials;

      try {
        const connection = await mysql.createConnection(dbConfig);
        try {
          const [rows] = await connection.execute(
            "SELECT username, password, salt FROM users WHERE username = ?",
            [username]
          );

          if (rows.length === 0) {
            return next(
              new ldap.InvalidCredentialsError("RAYYYYYYYYYY User not found")
            );
          }

          const user = rows[0];

          // Verify password
          if (hashPassword(password, user.salt) !== user.password) {
            return next(
              new ldap.InvalidCredentialsError("Invalid credentials")
            );
          }

          res.end();
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
      console.log(
        "[DEBUG] Connection Bind DN:",
        req.connection.ldap.bindDN.toString()
      );
      console.log("[DEBUG] Request Log ID:", req.logId);

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
        const entry = {
          dn: `cn=${user.username},${process.env.LDAP_BASE_DN}`,
          attributes: {
            objectClass: ["posixAccount", "inetOrgPerson", "shadowAccount"],
            uid: user.username,
            uidNumber: user.uid_number.toString(),
            gidNumber: user.gid_number.toString(),
            cn: user.full_name || user.username,
            gecos: user.full_name || user.username,
            homeDirectory: user.home_directory,
            loginShell: "/bin/bash",
            shadowLastChange: "0",
            userpassword: `{CRYPT}${user.password}`,
          },
        };

        console.log("\n[DEBUG] Responding with entry:");
        console.log(JSON.stringify(entry, null, 2));

        res.send(entry);
        res.end();
      } catch (error) {
        console.error("[ERROR] Search operation failed:", error.message);
        return next(new ldap.OperationsError("Search failed"));
      }
    });

    const PORT = process.env.LDAP_PORT || 389;
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
