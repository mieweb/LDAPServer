const mysql = require('mysql2/promise');

// Create a connection pool at startup
let pool;

function createPool(config) {
  if (!pool) {
    pool = mysql.createPool({
      host: config.host,
      port: config.port,
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

async function executeQuery(sql, params = []) {
  if (!pool) throw new Error('Pool not initialized. Call connect() first.');
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(sql, params);
    console.log(`SQL: ${sql}\nParams: ${JSON.stringify(params)}\nReturned rows: ${rows.length}`);
    return rows;
  } finally {
    conn.release();
  }
}

async function findUserByUsername(username) {
  const sql = `
    SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, r.id AS gidNumber, u.realm
    FROM users u
    LEFT JOIN realms r ON r.realm = u.realm
    WHERE u.username = ?
    LIMIT 1
  `;
  const rows = await executeQuery(sql, [username]);
  console.log('findUserByUsername result:', rows);
  return rows[0] || null;
}

async function findGroupsByMemberUid(username) {
  const sql = `
    SELECT r.realm AS name, r.id AS gid
    FROM user_realms ur
    JOIN users u ON u.user_id = ur.user_id
    JOIN realms r ON r.realm = ur.realm
    WHERE u.username = ?
    GROUP BY r.id, r.realm
    ORDER BY r.realm
  `;
  const groups = await executeQuery(sql, [username]);
  console.log('findGroupsByMemberUid groups:', groups);

  const out = [];
  for (const g of groups) {
    const membersSql = `
      SELECT u.username AS memberUid
      FROM user_realms ur
      JOIN users u ON u.user_id = ur.user_id
      WHERE ur.realm = ?
      ORDER BY u.username
    `;
    const members = await executeQuery(membersSql, [g.name]);
    console.log(`Members for group ${g.name}:`, members);
    out.push({
      name: g.name,
      gid: g.gid,
      member_uids: members.map(m => m.memberUid)
    });
  }
  return out;
}

async function getAllUsers() {
  const sql = `
    SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, r.id AS gidNumber, u.realm
    FROM users u
    LEFT JOIN realms r ON r.realm = u.realm
    ORDER BY u.username
  `;
  const rows = await executeQuery(sql);
  return rows;
}

async function getAllGroups() {
  const sql = `
    SELECT r.id, r.realm AS name,
           COALESCE(GROUP_CONCAT(u.username ORDER BY u.username SEPARATOR ','), '') AS member_uids
    FROM realms r
    LEFT JOIN user_realms ur ON ur.realm = r.realm
    LEFT JOIN users u ON u.user_id = ur.user_id
    GROUP BY r.id, r.realm
    ORDER BY r.realm
  `;
  const rows = await executeQuery(sql);
  console.log('getAllGroups result count:', rows.length);

  return rows.map(g => ({
    id: g.id,
    name: g.name,
    gid: g.id,
    member_uids: g.member_uids ? g.member_uids.split(',').filter(Boolean) : []
  }));
}

module.exports = {
  connect,
  close,
  findUserByUsername,
  findGroupsByMemberUid,
  getAllUsers,
  getAllGroups,
  executeQuery
};
