/**
 * Database Seeder for Integration Tests
 * 
 * Seeds test databases with users and groups
 * Supports MySQL, SQLite, and MongoDB
 */

const { loadCommonUsers, loadCommonGroups } = require('./dataLoader');
const bcrypt = require('bcrypt');

/**
 * SQLite Database Seeder
 */
class SQLiteSeeder {
  constructor(db) {
    this.db = db;
  }

  async seed() {
    // Create users table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        uid_number INTEGER NOT NULL,
        gid_number INTEGER NOT NULL,
        full_name TEXT,
        surname TEXT,
        given_name TEXT,
        mail TEXT,
        home_directory TEXT,
        login_shell TEXT,
        enabled INTEGER DEFAULT 1
      )
    `);

    // Create groups table
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS \`groups\` (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cn TEXT UNIQUE NOT NULL,
        gid_number INTEGER NOT NULL,
        description TEXT,
        member_uids TEXT
      )
    `);

    // Load test data from centralized data files
    const testUsers = loadCommonUsers();
    const testGroups = loadCommonGroups();

    // Insert users
    for (const user of testUsers) {
      const hash = await bcrypt.hash(user.password, 10);
      await this.db.run(
        `INSERT OR REPLACE INTO users 
         (username, password_hash, uid_number, gid_number, full_name, surname, given_name, mail, home_directory, login_shell, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        user.username,
        hash,
        user.uid_number,
        user.gid_number,
        user.full_name,
        user.surname,
        user.given_name,
        user.mail,
        user.home_directory,
        user.login_shell,
        user.enabled ? 1 : 0
      );
    }

    // Insert groups
    for (const group of testGroups) {
      await this.db.run(
        `INSERT OR REPLACE INTO \`groups\`
         (cn, gid_number, description, member_uids)
         VALUES (?, ?, ?, ?)`,
        group.cn,
        group.gid_number,
        group.description,
        JSON.stringify(group.member_uids)
      );
    }
  }

  async clean() {
    await this.db.exec('DELETE FROM users');
    await this.db.exec('DELETE FROM `groups`');
  }
}

/**
 * MySQL Database Seeder
 */
class MySQLSeeder {
  constructor(connection) {
    this.connection = connection;
  }

  async seed() {
    // Create users table
    await this.connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        uid_number INT NOT NULL,
        gid_number INT NOT NULL,
        full_name VARCHAR(255),
        surname VARCHAR(255),
        given_name VARCHAR(255),
        mail VARCHAR(255),
        home_directory VARCHAR(255),
        login_shell VARCHAR(255),
        enabled BOOLEAN DEFAULT TRUE,
        INDEX idx_username (username),
        INDEX idx_uid (uid_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Create groups table
    await this.connection.execute(`
      CREATE TABLE IF NOT EXISTS \`groups\` (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cn VARCHAR(255) UNIQUE NOT NULL,
        gid_number INT NOT NULL,
        description TEXT,
        member_uids JSON,
        INDEX idx_cn (cn),
        INDEX idx_gid (gid_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Load test data from centralized data files
    const testUsers = loadCommonUsers();
    const testGroups = loadCommonGroups();

    // Insert users
    for (const user of testUsers) {
      const hash = await bcrypt.hash(user.password, 10);
      await this.connection.execute(`
        INSERT INTO users 
        (username, password_hash, uid_number, gid_number, full_name, surname, given_name, mail, home_directory, login_shell, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        uid_number = VALUES(uid_number),
        gid_number = VALUES(gid_number)
      `, [
        user.username,
        hash,
        user.uid_number,
        user.gid_number,
        user.full_name,
        user.surname,
        user.given_name,
        user.mail,
        user.home_directory,
        user.login_shell,
        user.enabled
      ]);
    }

    // Insert groups
    for (const group of testGroups) {
      await this.connection.execute(`
        INSERT INTO \`groups\`
        (cn, gid_number, description, member_uids)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        gid_number = VALUES(gid_number),
        description = VALUES(description),
        member_uids = VALUES(member_uids)
      `, [
        group.cn,
        group.gid_number,
        group.description,
        JSON.stringify(group.member_uids)
      ]);
    }
  }

  async clean() {
    await this.connection.execute('DELETE FROM users');
    await this.connection.execute('DELETE FROM `groups`');
  }
}

/**
 * MongoDB Database Seeder
 */
class MongoDBSeeder {
  constructor(db) {
    this.db = db;
  }

  async seed() {
    // Get collections
    const usersCollection = this.db.collection('users');
    const groupsCollection = this.db.collection('groups');

    // Load test data from centralized data files
    const testUsers = loadCommonUsers();
    const testGroups = loadCommonGroups();

    // Insert users
    const usersToInsert = await Promise.all(
      testUsers.map(async (user) => ({
        username: user.username,
        password_hash: await bcrypt.hash(user.password, 10),
        uid_number: user.uid_number,
        gid_number: user.gid_number,
        full_name: user.full_name,
        surname: user.surname,
        given_name: user.given_name,
        mail: user.mail,
        home_directory: user.home_directory,
        login_shell: user.login_shell,
        enabled: user.enabled
      }))
    );

    await usersCollection.deleteMany({}); // Clean first
    await usersCollection.insertMany(usersToInsert);
    await usersCollection.createIndex({ username: 1 }, { unique: true });
    await usersCollection.createIndex({ uid_number: 1 });

    // Insert groups
    await groupsCollection.deleteMany({}); // Clean first
    await groupsCollection.insertMany(testGroups);
    await groupsCollection.createIndex({ cn: 1 }, { unique: true });
    await groupsCollection.createIndex({ gid_number: 1 });
  }

  async clean() {
    await this.db.collection('users').deleteMany({});
    await this.db.collection('groups').deleteMany({});
  }
}

module.exports = {
  SQLiteSeeder,
  MySQLSeeder,
  MongoDBSeeder
};
