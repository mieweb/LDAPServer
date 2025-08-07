const mysql = require('mysql2/promise');
const logger = require('../../utils/logger');

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
      connectionLimit: 10,
      queueLimit: 0
    });
    logger.info("MySQL connection pool created");
  }
  return pool;
}

async function connect(config) {
  try {
    return createPool(config);
  } catch (err) {
    logger.error("Error creating MySQL pool", { error: err.message });
    throw err;
  }
}

async function close() {
  if (pool) {
    try {
      await pool.end();
      logger.info("MySQL connection pool closed");
      pool = null;
    } catch (err) {
      logger.error("Error closing MySQL pool", { error: err.message });
    }
  }
}

async function executeQuery(sql, params = []) {
  if (!pool) throw new Error('Pool not initialized. Call connect() first.');
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } catch (err) {
    logger.error("Database query failed", {
      error: err.message,
      queryContext: sql.slice(0, 50) + '...', // don't log full user-generated queries
    });
    throw err;
  } finally {
    conn.release();
  }
}

async function findUserByUsername(username) {
  logger.debug(`Looking up user: ${username}`);
  const sql = `
    SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, r.id AS gidNumber, u.realm
    FROM users u
    LEFT JOIN realms r ON r.realm = u.realm
    WHERE u.username = ?
    LIMIT 1
  `;
  const rows = await executeQuery(sql, [username]);
  return rows[0] || null;
}

async function findGroupsByMemberUid(username) {
  logger.debug(`Fetching groups for user: ${username}`);
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
    out.push({
      name: g.name,
      gid: g.gid,
      member_uids: members.map(m => m.memberUid)
    });
  }
  return out;
}

async function getAllUsers() {
  logger.debug("Fetching all users");
  const sql = `
    SELECT u.user_id, u.username, u.first_name, u.last_name, u.email, r.id AS gidNumber, u.realm
    FROM users u
    LEFT JOIN realms r ON r.realm = u.realm
    ORDER BY u.username
  `;
  return await executeQuery(sql);
}

async function getAllGroups() {
  logger.debug("Fetching all groups");
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
