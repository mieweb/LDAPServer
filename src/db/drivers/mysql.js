const mysql = require('mysql2/promise');
const logger = require('../../utils/logger');

let pool;

// cache for the obs_code lookup
let cachedObsCode = null;
let cachedObsName = null;

async function getLdapUidObsCode() {
  const obsName = process.env.LDAP_UID_OBS_NAME || 'LDAP UID Number';
  if (cachedObsCode !== null && cachedObsName === obsName) return cachedObsCode;

  const sql = `
    SELECT obs_code
    FROM observation_codes
    WHERE obs_name = ?
    LIMIT 1
  `;
  try {
    const rows = await executeQuery(sql, [obsName]);
    if (!rows[0]) {
      logger.warn(`Observation code not found for name "${obsName}". ldap_uid_number will be NULL.`);
      cachedObsCode = null;
    } else {
      cachedObsCode = rows[0].obs_code;
      logger.info(`Using obs_code=${cachedObsCode} for "${obsName}"`);
    }
    cachedObsName = obsName;
    return cachedObsCode;
  } catch (err) {
    logger.error("Failed to resolve LDAP UID observation code", { error: err.message });
    cachedObsCode = null;
    cachedObsName = obsName;
    return null;
  }
}

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
      queryContext: sql.slice(0, 50) + '...',
    });
    throw err;
  } finally {
    conn.release();
  }
}

function latestUidSubquery(obsCode) {
  if (obsCode === null) return ''; // no-op
  // Pick the latest by create_datetime; if tied, pick largest obs_id
  return `
    LEFT JOIN (
      SELECT o1.user_id, o1.obs_result AS ldap_uid_number
      FROM observations o1
      JOIN (
        SELECT user_id,
               MAX(create_datetime) AS max_dt
        FROM observations
        WHERE obs_code = ?
        GROUP BY user_id
      ) mx
        ON mx.user_id = o1.user_id
       AND mx.max_dt = o1.create_datetime
      WHERE o1.obs_code = ?
      -- tie-breaker if multiple rows share the same timestamp
      AND o1.obs_id = (
        SELECT MAX(o2.obs_id)
        FROM observations o2
        WHERE o2.user_id = o1.user_id
          AND o2.obs_code = o1.obs_code
          AND o2.create_datetime = o1.create_datetime
      )
    ) uid ON uid.user_id = u.user_id
  `;
}

async function findUserByUsername(username) {
  logger.debug(`Looking up user: ${username}`);
  const obsCode = await getLdapUidObsCode();

  const sql = `
    SELECT
      u.user_id,
      u.username,
      u.first_name,
      u.last_name,
      u.email,
      r.id AS gidNumber,
      u.realm,
      ${obsCode !== null ? 'uid.ldap_uid_number' : 'NULL AS ldap_uid_number'}
    FROM users u
    LEFT JOIN realms r ON r.realm = u.realm
    ${obsCode !== null ? latestUidSubquery(obsCode) : ''}
    WHERE u.username = ?
    LIMIT 1
  `;

  const params = [];
  if (obsCode !== null) {
    params.push(obsCode, obsCode); // for the subquery
  }
  params.push(username);

  const rows = await executeQuery(sql, params);
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
  const obsCode = await getLdapUidObsCode();

  const sql = `
    SELECT
      u.user_id,
      u.username,
      u.first_name,
      u.last_name,
      u.email,
      r.id AS gidNumber,
      u.realm,
      ${obsCode !== null ? 'uid.ldap_uid_number' : 'NULL AS ldap_uid_number'}
    FROM users u
    LEFT JOIN realms r ON r.realm = u.realm
    ${obsCode !== null ? latestUidSubquery(obsCode) : ''}
    ORDER BY u.username
  `;

  const params = [];
  if (obsCode !== null) {
    params.push(obsCode, obsCode);
  }

  return await executeQuery(sql, params);
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
