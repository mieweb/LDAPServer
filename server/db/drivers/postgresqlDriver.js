const { Pool } = require("pg");
const BaseSqlDriver = require("./baseSqlDriver");
const logger = require("../../utils/logger");

/**
 * PostgreSQL SQL Driver
 * Implements the BaseSqlDriver interface for PostgreSQL databases
 */
class PostgreSQLDriver extends BaseSqlDriver {
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
      this.pool = new Pool({
        host: config.host,
        port: config.port || 5432,
        user: config.user,
        password: config.password,
        database: config.database,
        max: 10, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
      console.log(`PostgreSQL Connection Pool Created: postgresql://${config.user}@${config.host}/${config.database}`);
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
      console.log("PostgreSQL Connection Pool Closed");
    }
  }

  /**
   * Execute a query
   */
  async query(sql, params = []) {
    // Convert ? placeholders to $1, $2, etc. for PostgreSQL
    const pgQuery = this.convertPlaceholders(sql, '?', '$');
    const result = await this.pool.query(pgQuery, params);
    return result.rows;
  }

  /**
   * Get a connection from the pool
   */
  async getConnection() {
    return await this.pool.connect();
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
      const result = await connection.query(
        "SELECT * FROM users WHERE username = $1",
        [username]
      );
      return result.rows[0] || null;
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
      // PostgreSQL uses JSONB and different syntax for JSON operations
      const result = await connection.query(
        "SELECT g.name, g.gid_number, g.member_uids " +
        "FROM groups g " +
        "WHERE g.member_uids::jsonb ? $1",
        [username]
      );
      return result.rows.map(row => {
        // PostgreSQL might return JSONB, ensure it's parsed
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

    const result = await this.pool.query('SELECT * FROM users');
    return result.rows;
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
          STRING_AGG(u.username, ',') as member_uids
        FROM groups g
        LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
        LEFT JOIN users u ON ug.user_id = u.id
        GROUP BY g.gid_number, g.name
        ORDER BY g.name
      `;

      const result = await this.pool.query(query);

      return result.rows.map(group => ({
        id: group.id,
        name: group.name,
        gid_number: group.gid_number,
        member_uids: group.member_uids ? group.member_uids.split(',') : []
      }));
    } catch (error) {
      logger.error('Error getting all groups from PostgreSQL:', error);
      throw error;
    }
  }

  /**
   * Execute a custom SQL query
   * @private
   */
  async _executeCustomQuery(query, params, returnFirst = false) {
    // Convert ? placeholders to $1, $2, etc. for PostgreSQL
    const pgQuery = this.convertPlaceholders(query, '?', '$');
    
    const connection = await this.getConnection();
    try {
      const result = await connection.query(pgQuery, params);
      return returnFirst ? (result.rows[0] || null) : result.rows;
    } finally {
      this.releaseConnection(connection);
    }
  }
}

module.exports = PostgreSQLDriver;
