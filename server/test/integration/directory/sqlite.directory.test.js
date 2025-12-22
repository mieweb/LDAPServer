const fs = require('fs');
const path = require('path');
const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const { LdapEngine } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
const { SQLiteSeeder } = require('../../utils/dbSeeder');

// Real SQL directory provider using Sequelize + SQLite file
const { provider: SQLDirectoryProvider } = require('../../../backends/sql.directory');

const baseDn = 'dc=test,dc=local';
const port = 12489;

function createTempDbFile() {
  const dir = path.join(os.tmpdir(), 'ldap-gateway-tests');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `sqlite-directory-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  return file;
}

async function seedSqlite(dbPath) {
  const db = new sqlite3.Database(dbPath);
  const seeder = new SQLiteSeeder(db);
  await seeder.seed();
  await new Promise((resolve) => db.close(resolve));
}

function createClient() {
  return ldap.createClient({ url: `ldap://127.0.0.1:${port}` });
}

async function doSearch(client, filter) {
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(baseDn, { filter, scope: 'sub' }, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', (e) => {
        const entry = e.pojo || {};
        // ldapjs returns DN in objectName as LdapDn object
        entry.dn = (e.objectName || e.dn || entry.dn || '').toString();
        entries.push(entry);
      });
      res.on('error', (e) => reject(e));
      res.on('end', () => resolve(entries));
    });
  });
}

describe('SQLite Directory Backend (real DB) - Integration', () => {
  let engine;
  let dbPath;

  afterEach(async () => {
    if (engine) { await engine.stop(); engine = null; }
    if (dbPath && fs.existsSync(dbPath)) { try { fs.unlinkSync(dbPath); } catch (_) {} dbPath = null; }
  });

  test('a. (objectClass=*) should return all objects (users + groups) - SQLite', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
    process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`';
    process.env.SQL_QUERY_GROUPS_BY_MEMBER = "SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE member_uids LIKE '%' || ? || '%'";

    const directoryProvider = new SQLDirectoryProvider();
    const authProvider = { initialize: async()=>{}, cleanup: async()=>{}, authenticate: async ()=> true };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch: false, logger });
    await engine.start();

    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(objectClass=*)');
    expect(results.length).toBeGreaterThanOrEqual(4);
    client.unbind();
  });

  test('b. (objectClass=posixAccount) should return all users - SQLite', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
  process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`';
  // crude JSON contains for SQLite, use placeholder for username
  process.env.SQL_QUERY_GROUPS_BY_MEMBER = "SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE member_uids LIKE '%' || ? || '%'";

    const directoryProvider = new SQLDirectoryProvider();
    const authProvider = { initialize: async()=>{}, cleanup: async()=>{}, authenticate: async ()=> true };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch: false, logger });
    await engine.start();

    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(objectClass=posixAccount)');
    expect(results.length).toBeGreaterThan(0);
    client.unbind();
  });

  test('c. (objectClass=posixGroup) should return all groups - SQLite', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
  process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`';
  process.env.SQL_QUERY_GROUPS_BY_MEMBER = "SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE member_uids LIKE '%' || ? || '%'";

    const directoryProvider = new SQLDirectoryProvider();
    const authProvider = { initialize: async()=>{}, cleanup: async()=>{}, authenticate: async ()=> true };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch: false, logger });
    await engine.start();

    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(objectClass=posixGroup)');
    expect(results.length).toBeGreaterThan(0);
    client.unbind();
  });

  test('d. (uid=username) should return specific user - SQLite', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
    process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`';
    process.env.SQL_QUERY_GROUPS_BY_MEMBER = "SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE member_uids LIKE '%' || ? || '%'";

    const directoryProvider = new SQLDirectoryProvider();
    const authProvider = { initialize: async()=>{}, cleanup: async()=>{}, authenticate: async ()=> true };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch: false, logger });
    await engine.start();

    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(uid=testuser)');
    expect(results.length).toBeGreaterThan(0);
    client.unbind();
  });

  test('e. (cn=groupname) should return specific group - SQLite', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
    process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`';
    process.env.SQL_QUERY_GROUPS_BY_MEMBER = "SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE member_uids LIKE '%' || ? || '%'";

    const directoryProvider = new SQLDirectoryProvider();
    const authProvider = { initialize: async()=>{}, cleanup: async()=>{}, authenticate: async ()=> true };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch: false, logger });
    await engine.start();

    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(cn=developers)');
    expect(results.length).toBeGreaterThan(0);
    client.unbind();
  });

  test('f. (cn=*) should return all groups - SQLite', async () => {
    dbPath = createTempDbFile();
    await seedSqlite(dbPath);

    process.env.SQL_URI = `sqlite:${dbPath}`;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
    process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`';
    process.env.SQL_QUERY_GROUPS_BY_MEMBER = "SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE member_uids LIKE '%' || ? || '%'";

    const directoryProvider = new SQLDirectoryProvider();
    const authProvider = { initialize: async()=>{}, cleanup: async()=>{}, authenticate: async ()=> true };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch: false, logger });
    await engine.start();

    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(cn=*)');
    expect(results.length).toBeGreaterThanOrEqual(1);
    client.unbind();
  });
});
