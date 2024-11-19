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

const server = ldap.createServer({
  certificate: fs.readFileSync("./ldap-cert.pem"),
  key: fs.readFileSync("./ldap-key.pem"),
});

server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
  console.log("Bind operation initiated.");
  const { credentials: password, dn } = req;
  const username = dn.toString().split(",")[0].split("=")[1];

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
      "SELECT * FROM user_details WHERE user_name = ? AND password = ?",
      [username, password]
    );

    if (rows.length > 0) {
      res.end();
      next();
    } else {
      next(new ldap.InvalidCredentialsError());
    }

    await connection.end();
  } catch (err) {
    next(new ldap.OperationsError());
  }
});

server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
  console.log("Search operation initiated.");
  const filter = req.filter.toString();

  let query, queryParams;

  if (filter === "(objectClass=*)") {
    // Broad search query to fetch all users from MySQL
    query = "SELECT * FROM user_details";
    queryParams = [];
  } else {
    // Extract the username for specific searches
    const username = filter.split("=")[1].replace(")", "");
    console.log("Specific search for username:", username);
    query = "SELECT * FROM user_details WHERE user_name = ?";
    queryParams = [username];
  }

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(query, queryParams);

    if (rows.length > 0) {
      rows.forEach((user) => {
        const userEntry = {
          dn: `cn=${user.user_name},ou=users,${process.env.LDAP_BASE_DN}`,
          attributes: {
            objectClass: [
              "top",
              "person",
              "organizationalPerson",
              "posixAccount",
            ],
            cn: user.user_name,
            sn: user.sn,
            uid: user.user_name,
            uidNumber: user.uid,
            gidNumber: user.gid,
            homeDirectory: user.home_directory,
            loginShell: user.shell,
            userPassword: user.password,
          },
        };
        res.send(userEntry);
        console.log("Sending LDAP response for user:", user.user_name);
      });
    } else {
      console.log("No users found for query.");
    }

    res.end();
    await connection.end();
  } catch (err) {
    console.error("Error during search:", err);
    next(new ldap.OperationsError());
  }
});

server.listen(process.env.LDAP_PORT, "0.0.0.0", () => {
  console.log(`LDAP server listening on port ${process.env.LDAP_PORT}`);
});
