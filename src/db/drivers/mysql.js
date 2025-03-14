// drivers/mysql.js
const mysql = require("mysql2/promise");

// Connection management
async function connect(config) {
  const connectionConfig = {
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database
  };
  
  return await mysql.createConnection(connectionConfig);
}

async function close(connection) {
  if (connection) {
    await connection.end();
  }
}

// User operations
async function findUserByUsername(connection, username) {
  const [rows] = await connection.execute(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );
  return rows[0] || null;
}

async function findUserWithAppId(connection, username) {
  const [rows] = await connection.execute(
    "SELECT * FROM users WHERE username = ?", 
    [username]
  );
  return rows[0] || null;
}

async function findUserDetails(connection, username) {
  const [rows] = await connection.execute(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );
  return rows[0] || null;
}

async function updateUserAppId(connection, username, appId) {
  await connection.execute(
    "UPDATE users SET appId = ? WHERE username = ?", 
    [appId, username]
  );
}

// Group operations
async function findGroupsByMemberUid(connection, username) {
  const [rows] = await connection.execute(
    "SELECT g.name, g.gid, g.member_uids " +
    "FROM `groups` g " +
    "WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))",
    [username]
  );
  
  // Handle JSON data from MySQL to ensure it's in the right format
  return rows.map(row => {
    if (row.member_uids && typeof row.member_uids === 'string') {
      try {
        row.member_uids = JSON.parse(row.member_uids);
      } catch (e) {
        // error
      }
    }
    return row;
  });
}

module.exports = {
  connect,
  close,
  findUserByUsername,
  findUserWithAppId,
  findUserDetails,
  updateUserAppId,
  findGroupsByMemberUid
};