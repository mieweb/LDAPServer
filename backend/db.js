const mysql = require("mysql2/promise");

let pool;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: "127.0.0.1",
      user: "root",
      password: "",
      database: "ldap_user_db",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

module.exports = {
  getPool,
};
