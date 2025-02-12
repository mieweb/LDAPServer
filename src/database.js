const mysql = require("mysql2/promise");
const dbConfig = require("./config/dbconfig");

async function getConnection() {
  return mysql.createConnection(dbConfig);
}

async function getUserByUsername(username) {
  const connection = await getConnection();
  const [rows] = await connection.execute(
    "SELECT username, password, salt, appId FROM users WHERE username = ?",
    [username]
  );
  await connection.end();
  return rows.length > 0 ? rows[0] : null;
}

async function updateAppId(username, appId) {
  const connection = await getConnection();
  await connection.execute("UPDATE users SET appId = ? WHERE username = ?", [
    appId,
    username,
  ]);
  await connection.end();
}

module.exports = {
  getUserByUsername,
  updateAppId,
};
