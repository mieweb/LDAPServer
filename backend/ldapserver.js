const ldap = require("ldapjs");
const mysql = require("mysql2/promise");
const fs = require("fs");
require("dotenv").config();

// MySQL configuration
const dbConfig = {
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
};

// LDAP server setup
const server = ldap.createServer();

// Bind operation for authenticating users
server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
  console.log("bind incoming");
  const { credentials: password, dn } = req;
  const username = dn.toString().split(",")[0].split("=")[1];

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      "SELECT * FROM user_details WHERE user_name = ? AND password = ?",
      [username, password]
    );

    if (rows.length > 0) {
      console.log(`User ${username} authenticated successfully.`);
      res.end();
      next();
    } else {
      console.log(`Authentication failed for user ${username}.`);
      next(new ldap.InvalidCredentialsError());
    }

    await connection.end();
  } catch (err) {
    console.error("Database error:", err);
    next(new ldap.OperationsError());
  }
});

// Search operation for fetching user details
server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
  console.log("search incoming");
  const username = req.filter.toString().split("=")[1].replace(")", "");
  console.log("username", username);

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      "SELECT * FROM user_details WHERE user_name = ?",
      [username]
    );

    console.log("rows", rows);

    if (rows.length > 0) {
      const user = rows[0];
      const userEntry = {
        dn: `cn=${user.user_name},${process.env.LDAP_BASE_DN}`,
        attributes: {
          objectClass: [
            "top",
            "person",
            "organizationalPerson",
            "posixAccount",
          ],
          cn: user.user_name,
          uid: user.user_name,
          uidNumber: user.uid,
          gidNumber: user.gid,
          homeDirectory: user.home_directory,
          loginShell: user.shell,
          userPassword: user.password,
        },
      };
      console.log(userEntry);
      res.send(userEntry);
    }

    res.end();
    await connection.end();
  } catch (err) {
    console.error("Error during search:", err);
    next(new ldap.OperationsError());
  }
});

// Start the server on the specified port
server.listen(process.env.LDAP_PORT, "0.0.0.0", () => {
  console.log(`LDAP server listening on port ${process.env.LDAP_PORT}`);
});
