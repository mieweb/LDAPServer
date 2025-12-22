const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const { LdapEngine } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
const { SQLiteSeeder } = require('../../utils/dbSeeder');

// Real SQL auth provider using Sequelize + SQLite file
const { provider: SQLAuthProvider } = require('../../../backends/sql.auth');

const baseDn = 'dc=test,dc=local';
const port = 11489;

function createTempDbFile() {
  const dir = path.join(os.tmpdir(), 'ldap-gateway-tests');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sqlite-auth-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  return file;
}

async function seedSqlite(dbPath) {
  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => (err ? reject(err) : resolve(db)));
  });
  const db = new sqlite3.Database(dbPath);
  const seeder = new SQLiteSeeder(db);
  await seeder.seed();
  await new Promise((resolve) => db.close(resolve));
}

function createClient() {
  return ldap.createClient({ url: `ldap://127.0.0.1:${port}` });
}

describe('SQLite Auth Backend (real DB) - Integration', () => {
  let engine;
  let dbPath;

  beforeAll(() => {
    // nothing yet
  });

  afterEach(async () => {
    if (engine) { await engine.stop(); engine = null; }
    if (dbPath && fs.existsSync(dbPath)) {
      try { fs.unlinkSync(dbPath); } catch (_) {}
      dbPath = null;
    }
  });

  test('Bind with valid credentials should succeed (SQLite)', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    // Point Sequelize provider at the same SQLite DB file
    process.env.SQL_URI = `sqlite:${dbPath}`;
    // Map our schema to provider expectations
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';

    const authProvider = new SQLAuthProvider();
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider: { initialize: async()=>{}, cleanup: async()=>{} }, logger });
    await engine.start();

    const client = createClient();
    const userDN = `uid=testuser,${baseDn}`;
    await expect(new Promise((resolve, reject) => {
      client.bind(userDN, 'password123', (err) => err ? reject(err) : resolve());
    })).resolves.not.toThrow();
    client.unbind();
  });

  test('Bind with invalid credentials should fail (SQLite)', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';

    const authProvider = new SQLAuthProvider();
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider: { initialize: async()=>{}, cleanup: async()=>{} }, logger });
    await engine.start();

    const client = createClient();
    const userDN = `uid=testuser,${baseDn}`;
    await expect(new Promise((resolve, reject) => {
      client.bind(userDN, 'wrong', (err) => err ? reject(err) : resolve());
    })).rejects.toThrow();
    client.unbind();
  });

  test('Bind with non-existent user should fail (SQLite)', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';

    const authProvider = new SQLAuthProvider();
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider: { initialize: async()=>{}, cleanup: async()=>{} }, logger });
    await engine.start();

    const client = createClient();
    const userDN = `uid=nouser,${baseDn}`;
    await expect(new Promise((resolve, reject) => {
      client.bind(userDN, 'anything', (err) => err ? reject(err) : resolve());
    })).rejects.toThrow();
    client.unbind();
  });
});
