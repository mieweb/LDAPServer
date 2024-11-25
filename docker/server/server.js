const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const fs = require("fs");
require("dotenv").config();

const dbConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

// Load TLS certificates from the shared /certs volume
const tlsOptions = {
  certificate: fs.readFileSync(process.env.LDAP_CERT_PATH),
  key: fs.readFileSync(process.env.LDAP_KEY_PATH),
  ca: fs.readFileSync(process.env.LDAP_CA_CERT_PATH), // Ensure client trust
};

const server = ldap.createServer(tlsOptions);

// server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
//   console.log("Bind operation initiated.");
//   const { credentials: password, dn } = req;
//   const username = dn.toString().split(",")[0].split("=")[1];

//   console.log("Username:", username);

//   try {
//     const connection = await mysql.createConnection(dbConfig);
//     const [rows] = await connection.execute(
//       "SELECT * FROM user_details WHERE user_name = ? AND password = ?",
//       [username, password]
//     );

//     if (rows.length > 0) {
//       console.log("User authenticated:", username);
//       res.end();
//       next();
//     } else {
//       console.log("Invalid credentials for user:", username);
//       next(new ldap.InvalidCredentialsError());
//     }

//     await connection.end();
//   } catch (err) {
//     console.error("Error during bind:", err);
//     next(new ldap.OperationsError());
//   }
// });

server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
  console.log("Bind operation initiated.");
  const { credentials: password, dn } = req;

  // Extract username from DN
  const usernameMatch = dn.toString().match(/uid=([^,]+)/);
  const username = usernameMatch ? usernameMatch[1] : null;

  if (!username) {
    console.log("Invalid bind DN format. No username found.");
    return next(new ldap.InvalidCredentialsError());
  }

  console.log("Bind request for username:", username);

  try {
    // Connect to MySQL
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      "SELECT * FROM user_details WHERE user_name = ? AND password = ?",
      [username, password]
    );

    if (rows.length > 0) {
      console.log("User authenticated successfully:", username);
      res.end(); // Return success
      return next();
    } else {
      console.log("Invalid credentials for user:", username);
      return next(new ldap.InvalidCredentialsError());
    }
  } catch (err) {
    console.error("Error during bind operation:", err);
    return next(new ldap.OperationsError());
  }
});

//   console.log("Search operation initiated.");
//   console.log("Request", req);
//   const filter = req.filter.toString();
//   console.log("Filter", filter);

//   let query, queryParams;

//   if (filter === "(objectClass=*)") {
//     // Broad search query to fetch all users from MySQL
//     query = "SELECT * FROM user_details";
//     queryParams = [];
//   } else {
//     // Extract the username for specific searches
//     const username = filter.split("=")[1].replace(")", "");
//     console.log("Specific search for username:", username);
//     query = "SELECT * FROM user_details WHERE user_name = ?";
//     queryParams = [username];
//   }

//   try {
//     const connection = await mysql.createConnection(dbConfig);
//     const [rows] = await connection.execute(query, queryParams);

//     if (rows.length > 0) {
//       rows.forEach((user) => {
//         const userEntry = {
//           dn: `cn=${user.user_name},ou=users,${process.env.LDAP_BASE_DN}`,
//           attributes: {
//             objectClass: [
//               "top",
//               "person",
//               "organizationalPerson",
//               "posixAccount",
//             ],
//             cn: user.user_name,
//             sn: user.sn || "Unknown", // Handle missing values
//             uid: user.user_name,
//             uidNumber: user.uid || 1000, // Default UID
//             gidNumber: user.gid || 1000, // Default GID
//             homeDirectory: user.home_directory || `/home/${user.user_name}`,
//             loginShell: user.shell || "/bin/bash",
//             userPassword: user.password,
//           },
//         };
//         res.send(userEntry);
//         console.log("Sending LDAP response for user:", user.user_name);
//       });
//     } else {
//       console.log("No users found for query.");
//     }

//     res.end();
//     await connection.end();
//   } catch (err) {
//     console.error("Error during search:", err);
//     next(new ldap.OperationsError());
//   }
// });

server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
  console.log("Search operation initiated.");
  console.log("Received filter:", req.filter.toString());

  const filter = req.filter.toString();

  // Extract the username (uid) from the filter
  const usernameMatch = filter.match(/\(uid=([^)]*)\)/);
  const username = usernameMatch ? usernameMatch[1] : null;

  if (!username) {
    console.log("No valid username found in filter.");
    return res.end();
  }

  console.log("Specific search for username:", username);

  try {
    // Query MySQL to find the user
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      "SELECT * FROM user_details WHERE user_name = ?",
      [username]
    );

    if (rows.length > 0) {
      rows.forEach((user) => {
        const userEntry = {
          dn: `uid=${user.user_name},${process.env.LDAP_BASE_DN}`,
          attributes: {
            objectClass: [
              "top",
              "person",
              "organizationalPerson",
              "inetOrgPerson",
              "posixAccount",
              "shadowAccount",
            ],
            uid: user.user_name,
            cn: user.user_name,
            sn: user.sn || user.user_name,
            uidNumber: user.uid || 1000,
            gidNumber: user.gid || 1000,
            homeDirectory: `/home/${user.user_name}`,
            loginShell: "/bin/bash",
          },
        };
        res.send(userEntry);
        console.log(
          "Sending LDAP response for user:",
          user.user_name,
          userEntry
        );
      });
    } else {
      console.log("No users found for username:", username);
    }

    res.end();
    await connection.end();
  } catch (err) {
    console.error("Error during search operation:", err);
    next(new ldap.OperationsError());
  }
});

server.listen(process.env.LDAP_PORT, "0.0.0.0", () => {
  console.log(`LDAP server listening on port ${process.env.LDAP_PORT}`);
});
