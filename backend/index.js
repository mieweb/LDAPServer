const { authenticate } = require("ldap-authentication");
const mysql = require("mysql2/promise");

async function auth() {
  const options = {
    ldapOpts: {
      url: "ldap://localhost",
    },
    userDn: "cn=John Doe,ou=users,dc=myorg,dc=com",
    userPassword: "password123",
    userSearchBase: "dc=myorg,dc=com",
    usernameAttribute: "cn",
    username: "John Doe",
    attributes: ["cn"],
  };

  try {
    // Authenticate the user against LDAP
    let user = await authenticate(options);
    console.log("User Authentication successful:", user);

    // Fetch additional info from MySQL
    const connection = await mysql.createConnection({
      host: "localhost",
      user: "root",
      password: "",
      database: "ldap_user_db",
    });

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

    await connection.end();
  } catch (err) {
    console.error("Error:", err);
  }
}

auth();
