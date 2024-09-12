const { authenticate } = require("ldap-authentication");
const { getPool } = require("./db");

async function authenticateAndFetchUser(username, password) {
  const options = {
    ldapOpts: {
      url: "ldap://localhost",
    },
    userDn: `cn=${username},ou=users,dc=myorg,dc=com`,
    userPassword: password,
    userSearchBase: "dc=myorg,dc=com",
    usernameAttribute: "cn",
    username: username,
    attributes: ["cn"],
  };

  try {
    // Authenticate the user against LDAP
    let user = await authenticate(options);
    console.log("User Authentication successful:", user);

    // Fetch additional info from MySQL
    const pool = await getPool();
    const connection = await pool.getConnection();

    // Query to fetch additional data using 'cn'
    const [rows] = await connection.execute(
      "SELECT * FROM user_details WHERE user_name = ?",
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

authenticateAndFetchUser("Chris Evans", "Evan123");
