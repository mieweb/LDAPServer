// main.js (or index.js / app.js)
const { ldapConfig, mysqlConfig } = require("./config");
const { authenticate } = require("ldap-authentication");
const { getPool } = require("./db");
const { askQuestion } = require("./utils/utils");

async function authenticateAndFetchUser(username, password) {
  const options = {
    ldapOpts: {
      url: ldapConfig.url,
    },
    userDn: `cn=${username},ou=users,${ldapConfig.baseDN}`,
    userPassword: password,
    userSearchBase: ldapConfig.userSearchBase,
    usernameAttribute: "cn",
    username: username,
    attributes: ["cn"],
  };

  try {
    let user = await authenticate(options);
    console.log("User Authentication successful:", user);

    const pool = await getPool();
    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      `SELECT * FROM ${mysqlConfig.tableName} WHERE user_name = ?`,
      [user.cn]
    );

    if (rows.length > 0) {
      console.log("Additional User Data:", rows[0]);
    } else {
      console.log("No additional data found for this user.");
    }

    connection.release();
  } catch (err) {
    console.error("Error:", err);
  }
}

async function main() {
  const username = await askQuestion("Enter Username: ");
  const password = await askQuestion("Enter Password: ");
  await authenticateAndFetchUser(username, password);
}

main();
