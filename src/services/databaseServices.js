const mysql = require("mysql2/promise");

class DatabaseService {
  constructor(dbConfig, sqlQueries) {
    this.dbConfig = dbConfig;
    this.sqlQueries = sqlQueries;
  }

  async getConnection() {
    return await mysql.createConnection(this.dbConfig);
  }

  async executeQuery(queryCategory, queryName, params = []) {
    const queryString = this.sqlQueries[queryCategory][queryName];

    if (!queryString) {
      throw new Error(`Query not found: ${queryCategory}.${queryName}`);
    }

    const connection = await this.getConnection();
    try {
      const [results] = await connection.execute(queryString, params);
      return results;
    } finally {
      await connection.end();
    }
  }

  // For single row queries
  async findOne(queryCategory, queryName, params = []) {
    const results = await this.executeQuery(queryCategory, queryName, params);
    return results.length > 0 ? results[0] : null;
  }
}

module.exports = DatabaseService;
