// main.js
const ldap = require("ldapjs");
const { getPool } = require("./db");
const { ldapConfig, mysqlConfig } = require("./config");
const { askQuestion } = require("./utils/utils");

const client = ldap.createClient({
  url: ldapConfig.url,
});

// Function to add user to LDAP
async function addUserToLDAP(userData) {
  return new Promise((resolve, reject) => {
    client.bind(ldapConfig.adminDN, ldapConfig.adminPassword, (err) => {
      if (err) {
        console.error("Error binding:", err);
        return reject(err);
      }

      const dn = `cn=${userData.cn},ou=users,${ldapConfig.baseDN}`;
      const userEntry = {
        cn: userData.cn,
        sn: userData.sn,
        objectClass: ["person", "organizationalPerson"],
        userPassword: userData.userPassword,
      };

      console.log("Adding to LDAP with DN:", dn);
      console.log("User Entry:", userEntry);

      client.add(dn, userEntry, (err) => {
        if (err) {
          console.error("Error adding user:", err);
          return reject(err);
        } else {
          console.log("User added successfully to LDAP");
          return resolve();
        }
      });
    });
  });
}

// Function to add user to SQL database
async function addUserToSQL(userData) {
  const pool = await getPool();
  const connection = await pool.getConnection();

  try {
    const { cn, department = "Unknown", age = 0, salary = "0.00" } = userData;

    const [result] = await connection.execute(
      `INSERT INTO ${mysqlConfig.tableName} (user_name, department, age, salary) VALUES (?, ?, ?, ?)`,
      [cn, department, age, salary]
    );

    console.log("User added to SQL database:", result);
  } catch (err) {
    console.error("Error adding user to SQL database:", err);
  } finally {
    connection.release();
  }
}

// Main function to get user input and execute the operations
async function main() {
  const user = {
    cn: await askQuestion("Enter CN (Username): "),
    sn: await askQuestion("Enter SN (Surname): "),
    userPassword: await askQuestion("Enter User Password: "),
    department: await askQuestion("Enter Department: "),
    salary: await askQuestion("Enter Salary: "),
  };

  addUserToLDAP(user)
    .then(() => addUserToSQL(user))
    .then(() => console.log("Operation completed successfully"))
    .catch((err) => console.error("Operation failed:", err))
    .finally(() => client.unbind());
}

main();
