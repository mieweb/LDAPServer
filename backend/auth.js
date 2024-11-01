const { authenticate } = require("ldap-authentication");
const { getPool } = require("./db");
const readline = require("readline");

// Function to prompt for user input
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

// Function to authenticate user and fetch additional info from MySQL
async function authenticateAndFetchUser(username, password) {
  const options = {
    ldapOpts: {
      url: "ldap://localhost:1389",
    },
    userDn: `cn=${username},ou=users,dc=mieweb,dc=com`,
    userPassword: password,
    userSearchBase: "dc=mieweb,dc=com",
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

// Main function to get user input and execute the authentication
async function main() {
  const username = await askQuestion("Enter Username: ");
  const password = await askQuestion("Enter Password: ");

  await authenticateAndFetchUser(username, password);
}

main();
