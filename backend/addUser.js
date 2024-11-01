const ldap = require("ldapjs");
const { getPool } = require("./db");

const client = ldap.createClient({
  url: "ldap://localhost:1389",
});

async function addUserToLDAP(userData) {
  return new Promise((resolve, reject) => {
    client.bind("cn=admin,dc=mieweb,dc=com", "secret", (err) => {
      if (err) {
        console.error("Error binding:", err);
        return reject(err);
      }

      const dn = `cn=${userData.cn},ou=users,dc=mieweb,dc=com`;
      const userEntry = {
        cn: userData.cn,
        sn: userData.sn,
        objectClass: ["person", "organizationalPerson"],
        userPassword: userData.userPassword,
      };

      console.log(dn);
      console.log(userEntry);

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

async function addUserToSQL(userData) {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    const { cn, department = "Unknown", age = 0, salary = "0.00" } = userData;

    // Insert user data into SQL database
    const [result] = await connection.execute(
      "INSERT INTO user_details (user_name, department, age, salary) VALUES (?, ?, ?, ?)",
      [cn, department, age, salary]
    );

    console.log("User added to SQL database:", result);
  } catch (err) {
    console.error("Error adding user to SQL database:", err);
  } finally {
    connection.release();
  }
}

const user = {
  cn: "ram ram",
  sn: "ram",
  userPassword: "ram",
  department: "Management",
  salary: "1000000",
};

addUserToLDAP(user)
  .then(() => addUserToSQL(user))
  .then(() => console.log("Operation completed successfully"))
  .catch((err) => console.error("Operation failed:", err))
  .finally(() => client.unbind());
