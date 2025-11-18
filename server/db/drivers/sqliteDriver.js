const sqlite3 = require("sqlite3").verbose();
const { promisify } = require("util");
const BaseSqlDriver = require("./baseSqlDriver");
const logger = require("../../utils/logger");

/**
 * SQLite SQL Driver
 * Implements the BaseSqlDriver interface for SQLite databases
 */
class SQLiteDriver extends BaseSqlDriver {
  constructor() {
    super();
    this.db = null;
    this.config = null;
  }

  /**
   * Open the database connection
   */
  async connect(config) {
    this.config = config;
    const filename = config.filename || config.database || './ldap_user_db.sqlite';
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(filename, (err) => {
        if (err) {
          console.error('SQLite Connection Error:', err);
          reject(err);
        } else {
          console.log(`SQLite Connection Created: ${filename}`);
          // Enable foreign keys
          this.db.run('PRAGMA foreign_keys = ON');
          resolve(this.db);
        }
      });
    });
  }

  /**
   * Close the database
   */
  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            console.log("SQLite Connection Closed");
            resolve();
          }
        });
      });
    }
  }

  /**
   * Execute a query
   */
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Execute a single row query
   */
  async queryOne(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  /**
   * Get a connection (SQLite doesn't use connection pools, return db instance)
   */
  async getConnection() {
    return this.db;
  }

  /**
   * Release connection (no-op for SQLite)
   */
  async releaseConnection(connection) {
    // No-op for SQLite
  }

  /**
   * Find user by username
   */
  async findUserByUsername(username) {
    // Use custom query if provided
    if (this.config?.queries?.findUserByUsername) {
      return this._executeCustomQuery(this.config.queries.findUserByUsername, [username], true);
    }

    return await this.queryOne(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
  }

  /**
   * Find groups by member username
   */
  async findGroupsByMemberUid(username) {
    // Use custom query if provided
    if (this.config?.queries?.findGroupsByMemberUid) {
      return this._executeCustomQuery(this.config.queries.findGroupsByMemberUid, [username], false);
    }

    // SQLite uses JSON1 extension for JSON operations
    const rows = await this.query(
      "SELECT g.name, g.gid_number, g.member_uids " +
      "FROM groups g " +
      "WHERE EXISTS (" +
      "  SELECT 1 FROM json_each(g.member_uids) " +
      "  WHERE json_each.value = ?" +
      ")",
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
  }

  /**
   * Get all users
   */
  async getAllUsers() {
    // Use custom query if provided
    if (this.config?.queries?.getAllUsers) {
      return this._executeCustomQuery(this.config.queries.getAllUsers, [], false);
    }

    return await this.query('SELECT * FROM users');
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
        FROM groups g
        LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
        LEFT JOIN users u ON ug.user_id = u.id
        GROUP BY g.gid_number, g.name
        ORDER BY g.name
      `;

      const groups = await this.query(query);

      return groups.map(group => ({
        id: group.id,
        name: group.name,
        gid_number: group.gid_number,
        member_uids: group.member_uids ? group.member_uids.split(',') : []
      }));
    } catch (error) {
      logger.error('Error getting all groups from SQLite:', error);
      throw error;
    }
  }

  /**
   * Execute a custom SQL query
   * @private
   */
  async _executeCustomQuery(query, params, returnFirst = false) {
    if (returnFirst) {
      return await this.queryOne(query, params);
    } else {
      return await this.query(query, params);
    }
  }

  /**
   * Run a statement (for CREATE, INSERT, UPDATE, DELETE)
   */
  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }
}

module.exports = SQLiteDriver;
