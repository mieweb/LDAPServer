// const ldap = require("ldapjs");
// const mysql = require("mysql2/promise");
// const crypto = require("crypto");
// require("dotenv").config();

// // MySQL connection configuration
// const dbConfig = {
//   host: process.env.MYSQL_HOST || "mysql",
//   user: process.env.MYSQL_USER || "root",
//   password: process.env.MYSQL_PASSWORD || "rootpassword",
//   database: process.env.MYSQL_DATABASE || "ldap_user_db",
// };

// // Helper function to hash passwords
// function hashPassword(password, salt) {
//   return crypto
//     .pbkdf2Sync(
//       password,
//       salt,
//       1000, // iterations
//       64, // key length
//       "sha512"
//     )
//     .toString("hex");
// }

// // Main server function
// async function startLDAPServer() {
//   try {
//     const server = ldap.createServer();

//     // Bind operation - authentication
//     server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
//       console.log("Start Bind operation...");
//       const dnParts = req.dn.toString().split(",");
//       const username = dnParts[0].split("=")[1];
//       const password = req.credentials;

//       try {
//         const connection = await mysql.createConnection(dbConfig);
//         try {
//           const [rows] = await connection.execute(
//             "SELECT username, password, salt FROM users WHERE username = ?",
//             [username]
//           );

//           if (rows.length === 0) {
//             return next(new ldap.InvalidCredentialsError("User not found"));
//           }

//           const user = rows[0];

//           // Verify password
//           if (hashPassword(password, user.salt) !== user.password) {
//             return next(
//               new ldap.InvalidCredentialsError("Invalid credentials")
//             );
//           }

//           res.end();
//         } finally {
//           await connection.end();
//         }
//       } catch (error) {
//         console.error("Authentication error:", error);
//         return next(new ldap.OperationsError("Authentication failed"));
//       }
//     });

//     server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
//       console.log("\n[DEBUG] Incoming search request:");
//       console.log("Filter:", req.filter.toString());
//       console.log("Attributes Requested:", req.attributes);
//       console.log(
//         "[DEBUG] Connection Bind DN:",
//         req.connection.ldap.bindDN.toString()
//       );
//       console.log("[DEBUG] Request Log ID:", req.logId);

//       const match = req.filter.toString().match(/\(uid=([^)]*)\)/);
//       const username = match ? match[1] : null;

//       if (!username) {
//         console.error("[ERROR] Invalid filter for extracting username");
//         res.end();
//         return next(new ldap.OperationsError("Invalid filter"));
//       }

//       try {
//         const connection = await mysql.createConnection(dbConfig);
//         const [rows] = await connection.execute(
//           `SELECT
//             username,
//             uid_number,
//             gid_number,
//             home_directory,
//             full_name,
//             password
//            FROM users
//            WHERE username = ?`,
//           [username]
//         );

//         if (rows.length === 0) {
//           console.error("[ERROR] User not found:", username);
//           res.end();
//           return next();
//         }

//         const user = rows[0];
//         const entry = {
//           dn: `cn=${user.username},${process.env.LDAP_BASE_DN}`,
//           attributes: {
//             objectClass: ["posixAccount", "inetOrgPerson", "shadowAccount"],
//             uid: user.username,
//             uuid: user.username,
//             uidNumber: 1001,
//             gidNumber: 1001,
//             cn: user.full_name || user.username,
//             sn: "pant",
//             gecos: user.full_name || user.username,
//             homeDirectory: user.home_directory,
//             loginShell: "/bin/bash",
//             shadowLastChange: "0",
//             userpassword: `{CRYPT}${user.password}`,
//             mail: "anisha@gmail.com",
//           },
//         };

//         console.log("\n[DEBUG] Responding with entry:");
//         console.log(JSON.stringify(entry, null, 2));

//         res.send(entry);
//         res.end();
//       } catch (error) {
//         console.error("[ERROR] Search operation failed:", error.message);
//         return next(new ldap.OperationsError("Search failed"));
//       }
//     });

//     const PORT = process.env.LDAP_PORT || 389;
//     server.listen(PORT, "0.0.0.0", () => {
//       console.log(
//         `Secure LDAP Authentication Server listening on port ${PORT}`
//       );
//     });
//   } catch (error) {
//     console.error("Failed to start LDAP server:", error);
//     process.exit(1);
//   }
// }

// // Call the start function
// startLDAPServer();

const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
require("dotenv").config();

const dbConfig = {
  host: process.env.MYSQL_HOST || "mysql",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "rootpassword",
  database: process.env.MYSQL_DATABASE || "ldap_user_db",
};

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
}

function parseFilter(filter) {
  const result = {
    type: null,
    username: null,
    groupName: null,
    gidNumber: null,
    memberUid: null,
  };

  try {
    // Remove outer parentheses if present
    let cleanFilter = filter.replace(/^\((.*)\)$/, "$1");

    // Handle complex (&...) filters
    if (cleanFilter.startsWith("&")) {
      cleanFilter = cleanFilter.slice(1); // Remove the &
      const conditions = cleanFilter.split(/(?=\([^(]*\))/g);

      for (const condition of conditions) {
        // Handle uid=* filters
        const uidMatch = condition.match(/\(uid=([^)]*)\)/);
        if (uidMatch) {
          result.type = "user";
          result.username = uidMatch[1].replace(/\*/g, ""); // Remove wildcards
        }

        // Handle cn=* filters
        const cnMatch = condition.match(/\(cn=([^)]*)\)/);
        if (cnMatch) {
          result.type = "group";
          result.groupName = cnMatch[1].replace(/\*/g, "");
        }

        // Handle gidNumber=* filters
        const gidMatch = condition.match(/\(gidNumber=([^)]*)\)/);
        if (gidMatch) {
          result.gidNumber = parseInt(gidMatch[1], 10);
        }

        // Handle memberuid=* filters
        const memberMatch = condition.match(/\(memberuid=([^)]*)\)/);
        if (memberMatch) {
          result.memberUid = memberMatch[1].replace(/\*/g, "");
        }
      }
    }
    // Handle simple filters (single condition)
    else {
      const simpleMatch = cleanFilter.match(
        /^(uid|cn|gidNumber|memberuid)=([^)]*)$/
      );
      if (simpleMatch) {
        const [_, key, value] = simpleMatch;
        const cleanValue = value.replace(/\*/g, "");

        switch (key) {
          case "uid":
            result.type = "user";
            result.username = cleanValue;
            break;
          case "cn":
            result.type = "group";
            result.groupName = cleanValue;
            break;
          case "gidNumber":
            result.gidNumber = parseInt(cleanValue, 10);
            break;
          case "memberuid":
            result.memberUid = cleanValue;
            break;
        }
      }
    }
  } catch (error) {
    console.error("Filter parsing error:", error);
  }

  return result;
}

async function startLDAPServer() {
  try {
    const server = ldap.createServer();
    console.log("LDAP server is initializing...");

    server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
      try {
        console.log("Incoming LDAP search request:", req.filter.toString());

        const filter = parseFilter(req.filter.toString());
        console.log("Connecting to MySQL database...", filter);

        const connection = await mysql.createConnection(dbConfig);
        console.log("Database connection established");

        if (filter.type === "user" && filter.username) {
          console.log(`Searching for user: ${filter.username}`);

          const [users] = await connection.execute(
            `SELECT * FROM users WHERE username = ?`,
            [filter.username]
          );

          if (users.length) {
            console.log(`User found: ${JSON.stringify(users[0])}`);

            const user = users[0];
            const entry = {
              dn: `cn=${user.username},${process.env.LDAP_BASE_DN}`,
              attributes: {
                objectClass: ["posixAccount", "inetOrgPerson", "shadowAccount"],
                uid: user.username,
                uidNumber: user.uid_number,
                gidNumber: user.gid_number,
                cn: user.full_name || user.username,
                sn: "pant",
                gecos: user.full_name || user.username,
                homeDirectory: user.home_directory,
                loginShell: "/bin/bash",
                shadowLastChange: "0",
                userPassword: `{CRYPT}${user.password}`,
                mail: "anisha@gmail.com",
                modifyTimestamp: new Date().toISOString(),
                krbPrincipalName: `${user.username}@MIEWEB.COM`,
                userAccountControl: 512,
              },
            };

            sendFilteredEntry(res, entry, req.attributes);
          } else {
            console.log("User not found in database");
          }
        }

        if (filter.type === "group" || filter.memberUid || filter.gidNumber) {
          console.log("Searching for group with conditions:", filter);

          let groupQuery = "SELECT * FROM ldap_groups";
          const params = [];

          if (filter.groupName) {
            groupQuery += " WHERE group_name = ?";
            params.push(filter.groupName);
          } else if (filter.gidNumber) {
            groupQuery += " WHERE gid_number = ?";
            params.push(filter.gidNumber);
          } else if (filter.memberUid) {
            groupQuery += " WHERE JSON_CONTAINS(member_uids, ?)";
            params.push(JSON.stringify([filter.memberUid]));
          }

          console.log("Executing group query:", groupQuery, "Params:", params);

          const [groups] = await connection.execute(groupQuery, params);

          if (groups.length) {
            console.log(`Found ${groups.length} group(s)`);

            for (const group of groups) {
              console.log("Processing group:", group.group_name);

              const entry = {
                dn: `cn=${group.group_name},${process.env.LDAP_BASE_DN}`,
                attributes: {
                  objectClass: ["posixGroup"],
                  cn: group.group_name,
                  gidNumber: group.gid_number,
                  memberUid: group.member_uids,
                },
              };

              sendFilteredEntry(res, entry, req.attributes);
            }
            clear;
          } else {
            console.log("No matching groups found");
          }
        }

        await connection.end();
        console.log("Closed database connection");
        res.end();
      } catch (error) {
        console.error("Search error:", error);
        res.end();
      }
    });

    function sendFilteredEntry(res, entry, requestedAttributes) {
      console.log("Sending LDAP entry:", entry.dn);

      const filteredEntry = {
        dn: entry.dn,
        attributes: {},
      };

      const requested = new Set(
        requestedAttributes.map((a) => a.toLowerCase())
      );

      for (const [attr, value] of Object.entries(entry.attributes)) {
        if (requested.has("*") || requested.has(attr.toLowerCase())) {
          filteredEntry.attributes[attr] = value;
        }
      }

      console.log("Filtered entry:", filteredEntry);
      res.send(filteredEntry);
    }

    const PORT = process.env.LDAP_PORT || 389;
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`LDAP server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startLDAPServer();
