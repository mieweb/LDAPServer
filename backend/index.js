const { authenticate } = require("ldap-authentication");
const mysql = require("mysql2/promise");
const ldap = require("ldapjs");

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
const client = ldap.createClient({
  url: "ldap://localhost:389",
});

async function addUserToLDAP(userData) {
  return new Promise((resolve, reject) => {
    client.bind("cn=admin,dc=myorg,dc=com", "secret", (err) => {
      if (err) {
        console.error("Error binding:", err);
        return reject(err);
      }

      const dn = `cn=${userData.cn},ou=users,dc=myorg,dc=com`;
      const userEntry = {
        cn: userData.cn,
        sn: userData.sn,
        objectClass: ["person", "organizationalPerson"],
        userPassword: userData.userPassword,
      };

      client.add(dn, userEntry, (err) => {
        if (err) {
          console.error("Error adding user:", err);
          return reject(err);
        } else {
          console.log("User added successfully");
          return resolve();
        }
      });
    });
  });
}

// Example usage
const user = {
  cn: "Evan Pant",
  sn: "Pant",
  userPassword: "evan123",
};

addUserToLDAP(user)
  .then(() => console.log("Operation completed successfully"))
  .catch((err) => console.error("Operation failed:", err))
  .finally(() => client.unbind());
