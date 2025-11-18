const mysql = require("mysql2/promise");
const BaseSqlDriver = require("./baseSqlDriver");
const logger = require("../../utils/logger");

/**
 * MySQL/MariaDB SQL Driver
 * Implements the BaseSqlDriver interface for MySQL databases
 */
class MySQLDriver extends BaseSqlDriver {
  constructor() {
    super();
    this.pool = null;
    this.config = null;
  }

  /**
   * Create and initialize the connection pool
   */
  createPool(config) {
    if (!this.pool) {
      this.pool = mysql.createPool({
        host: config.host,
        port: config.port || 3306,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
      });
      console.log(`MySQL Connection Pool Created: mysql://${config.user}@${config.host}/${config.database}`);
    }
    return this.pool;
  }

  /**
   * Initialize the connection pool
   */
  async connect(config) {
    this.config = config;
    return this.createPool(config);
  }

  /**
   * Close the pool
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log("MySQL Connection Pool Closed");
    }
  }

  /**
   * Execute a query
   */
  async query(sql, params = []) {
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  /**
   * Get a connection from the pool
   */
  async getConnection() {
    return await this.pool.getConnection();
  }

  /**
   * Release a connection back to the pool
   */
  async releaseConnection(connection) {
    connection.release();
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username) {
    // Use custom query if provided
    if (this.config?.queries?.findUserByUsername) {
      return this._executeCustomQuery(this.config.queries.findUserByUsername, [username], true);
    }

    const connection = await this.getConnection();
    try {
      const [rows] = await connection.execute(
        "SELECT * FROM users WHERE username = ?",
        [username]
      );
      return rows[0] || null;
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Find groups by member username
   */
  async findGroupsByMemberUid(username) {
    // Use custom query if provided
    if (this.config?.queries?.findGroupsByMemberUid) {
      return this._executeCustomQuery(this.config.queries.findGroupsByMemberUid, [username], false);
    }

    const connection = await this.getConnection();
    try {
      const [rows] = await connection.execute(
        "SELECT g.name, g.gid_number, g.member_uids " +
        "FROM `groups` g " +
        "WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))",
        [username]
      );
      return rows.map(row => {
        if (row.member_uids && typeof row.member_uids === 'string') {
          try {
            row.member_uids = JSON.parse(row.member_uids);
          } catch (e) {
            logger.error('Error parsing member_uids JSON:', e);
          }
        }
        return row;
      });
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * Get all users
   */
  async getAllUsers() {
    // Use custom query if provided
    if (this.config?.queries?.getAllUsers) {
      return this._executeCustomQuery(this.config.queries.getAllUsers, [], false);
    }

    const [rows] = await this.pool.query('SELECT * FROM users');
    return rows;
  }

  /**
   * Get all groups
   */
  async getAllGroups() {
    // Use custom query if provided
    if (this.config?.queries?.getAllGroups) {
      return this._executeCustomQuery(this.config.queries.getAllGroups, [], false);
    }

    try {
      const query = `
        SELECT 
          g.gid_number,
          g.name,
          g.gid_number as id,
          GROUP_CONCAT(u.username) as member_uids
        FROM \`groups\` g
        LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
        LEFT JOIN users u ON ug.user_id = u.id
        GROUP BY g.gid_number, g.name
        ORDER BY g.name
      `;

      const [groups] = await this.pool.query(query);

      return groups.map(group => ({
        id: group.id,
        name: group.name,
        gid_number: group.gid_number,
        member_uids: group.member_uids ? group.member_uids.split(',') : []
      }));
    } catch (error) {
      logger.error('Error getting all groups from MySQL:', error);
      throw error;
    }
  }

  /**
   * Execute a custom SQL query
   * @private
   */
  async _executeCustomQuery(query, params, returnFirst = false) {
    const connection = await this.getConnection();
    try {
      const [rows] = await connection.execute(query, params);
      return returnFirst ? (rows[0] || null) : rows;
    } finally {
      this.releaseConnection(connection);
    }
  }
}

module.exports = MySQLDriver;