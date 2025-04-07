const mysql = require("mysql2/promise");

// Create a connection pool at startup
let pool;

function createPool(config) {
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10, // Maximum number of connections in the pool
      queueLimit: 0 // No limit on the number of waiting requests
    });
    console.log("MySQL Connection Pool Created");
  }
  return pool;
}

// Initialize the connection pool
async function connect(config) {
  return createPool(config);
}

// Close the pool (when shutting down the app)
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("MySQL Connection Pool Closed");
  }
}

async function findUserByUsername(username) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    return rows[0] || null;
  } finally {
    connection.release(); // Release connection back to pool
  }
}

async function findGroupsByMemberUid(username) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.execute(
      "SELECT g.name, g.gid, g.member_uids " +
      "FROM `groups` g " +
      "WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))",
      [username]
    );
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
  } finally {
    connection.release();
  }
}

module.exports = {
  connect,
  close,
  findUserByUsername,
  findGroupsByMemberUid
};