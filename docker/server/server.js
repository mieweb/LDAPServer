const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

// MySQL connection configuration
const dbConfig = {
  host: process.env.MYSQL_HOST || "mysql",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "rootpassword",
  database: process.env.MYSQL_DATABASE || "ldap_user_db",
};

// Main server function
async function startLDAPServer() {
  try {
    const server = ldap.createServer({
      certificate: fs.readFileSync("./certs/server-cert.pem"),
      key: fs.readFileSync("./certs/server-key.pem"),
    });

    // Helper function to verify password
    function verifyPassword(inputPassword, storedPassword, salt) {
      const hashedInput = crypto
        .pbkdf2Sync(
          inputPassword,
          salt,
          1000, // iterations
          64, // key length
          "sha512"
        )
        .toString("hex");

      return hashedInput === storedPassword;
    }

    // Bind operation - authentication
    server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
      // Extract username from DN
      // Expected format: uid=username,dc=mieweb,dc=com
      console.log("Start Bind operation...");
      const dnParts = req.dn.toString().split(",");
      const username = dnParts[0].split("=")[1];
      const password = req.credentials;

      try {
        // Establish MySQL connection
        const connection = await mysql.createConnection(dbConfig);

        try {
          // Query user from MySQL database
          const [rows] = await connection.execute(
            "SELECT username, password, salt FROM users WHERE username = ?",
            [username]
          );

          // Check if user exists
          if (rows.length === 0) {
            return next(new ldap.InvalidCredentialsError("User not found"));
          }

          const user = rows[0];

          // Verify password
          if (!verifyPassword(password, user.password, user.salt)) {
            return next(
              new ldap.InvalidCredentialsError("Invalid credentials")
            );
          }

          // Successful authentication
          res.end();
        } finally {
          // Close the connection
          await connection.end();
        }
      } catch (error) {
        console.error("Authentication error:", error);
        return next(new ldap.OperationsError("Authentication failed"));
      }
    });

    server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
      console.log("Search Process Initiated...");
      console.log("Request Filter:", req.filter.toString());

      let username = null;

      // Handle common LDAP search filters
      if (req.filter.attribute === "uid") {
        username = req.filter.value; // Extract username from (uid=someuser)
      } else if (req.filter.toString().includes("(uid=")) {
        const match = req.filter.toString().match(/\(uid=([^)]*)\)/);
        if (match) {
          username = match[1]; // Extract username
        }
      }

      if (!username) {
        console.error("Invalid filter for username extraction");
        res.end();
        return next(new ldap.OperationsError("Invalid filter"));
      }

      console.log("Extracted username:", username);

      try {
        const connection = await mysql.createConnection(dbConfig);

        try {
          // Query user information from MySQL
          const [rows] = await connection.execute(
            `SELECT 
              username, 
              full_name, 
              email, 
              uid_number, 
              gid_number, 
              home_directory 
            FROM users 
            WHERE username = ?`,
            [username]
          );

          if (rows.length === 0) {
            console.log("No user found for the given filter");
            res.end();
            return next();
          }

          const user = rows[0];

          // Construct LDAP-like entry
          const entry = {
            dn: `uid=${user.username},${process.env.LDAP_BASE_DN}`,
            attributes: {
              objectClass: ["posixAccount", "inetOrgPerson"],
              uid: user.username,
              cn: user.full_name,
              mail: user.email,
              uidNumber: user.uid_number.toString(),
              gidNumber: user.gid_number.toString(),
              homeDirectory: user.home_directory,
            },
          };

          console.log("Sending LDAP entry:", entry);

          res.send(entry);
          res.end();
        } finally {
          await connection.end();
        }
      } catch (error) {
        console.error("Search operation failed:", error);
        return next(new ldap.OperationsError("Search failed"));
      }
    });

    const PORT = process.env.LDAP_PORT || 1390;
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
