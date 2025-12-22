const { Client } = require('pg');
const { LdapEngine } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
const { provider: SQLDirectoryProvider } = require('../../../backends/sql.directory');
const { acceptanceFilters } = require('../../fixtures/testData');
const bcrypt = require('bcrypt');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybeDescribe = RUN ? describe : describe.skip;

const baseDn = 'dc=test,dc=local';
const port = 13789;
const url = process.env.SQL_URI || 'postgres://testuser:testpass@127.0.0.1:25432/testdb';

function createClient() { return ldap.createClient({ url: `ldap://127.0.0.1:${port}` }); }

async function doSearch(client, filter) {
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(baseDn, { filter, scope: 'sub' }, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', (e) => {
        const entry = e.pojo || {};
        // ldapjs returns DN in objectName as LdapDn object
        entry.dn = (e.objectName || e.dn || '').toString();
        entries.push(entry);
      });
      res.on('error', (e) => reject(e));
      res.on('end', () => resolve(entries));
    });
  });
}

async function seedPostgres() {
  const client = new Client({ connectionString: url });
  await client.connect();
  
  // Create tables
  await client.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    uid_number INT NOT NULL,
    gid_number INT NOT NULL,
    full_name TEXT,
    surname TEXT,
    given_name TEXT,
    mail TEXT,
    home_directory TEXT,
    login_shell TEXT,
    enabled BOOLEAN DEFAULT TRUE
  )`);
  
  await client.query(`CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    cn TEXT UNIQUE NOT NULL,
    gid_number INT NOT NULL,
    description TEXT,
    member_uids JSONB
  )`);
  
  // Clear existing data
  await client.query(`DELETE FROM users; DELETE FROM groups;`);
  
  // Seed users from common.users.json structure
  const users = [
    { username: 'testuser', password: 'password123', uid: 1001, gid: 1001, full_name: 'Test User', surname: 'User', given_name: 'Test', mail: 'testuser@example.com', home: '/home/testuser', shell: '/bin/bash', enabled: true },
    { username: 'admin', password: 'admin123', uid: 1000, gid: 1000, full_name: 'Administrator', surname: 'Admin', given_name: 'Admin', mail: 'admin@example.com', home: '/home/admin', shell: '/bin/bash', enabled: true },
    { username: 'jdoe', password: 'test123', uid: 1002, gid: 1001, full_name: 'John Doe', surname: 'Doe', given_name: 'John', mail: 'jdoe@example.com', home: '/home/jdoe', shell: '/bin/bash', enabled: true },
    { username: 'disabled', password: 'password', uid: 1003, gid: 1001, full_name: 'Disabled User', surname: 'User', given_name: 'Disabled', mail: 'disabled@example.com', home: '/home/disabled', shell: '/bin/bash', enabled: false }
  ];
  
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    await client.query(`INSERT INTO users (username, password_hash, uid_number, gid_number, full_name, surname, given_name, mail, home_directory, login_shell, enabled)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (username) DO NOTHING`, [
        user.username, hash, user.uid, user.gid, user.full_name, user.surname, user.given_name, user.mail, user.home, user.shell, user.enabled
      ]);
  }
  
  // Seed groups from common.groups.json structure
  await client.query(`INSERT INTO groups (cn, gid_number, description, member_uids)
    VALUES 
      ('users', 1001, 'Standard users group', $1::jsonb),
      ('admins', 1000, 'System administrators', $2::jsonb),
      ('developers', 1002, 'Development team', $3::jsonb),
      ('empty', 1003, 'Empty group for testing', $4::jsonb)
    ON CONFLICT (cn) DO NOTHING`, [
      JSON.stringify(['testuser', 'jdoe', 'disabled']),
      JSON.stringify(['admin']),
      JSON.stringify(['testuser', 'jdoe']),
      JSON.stringify([])
    ]);
  
  await client.end();
}

maybeDescribe('PostgreSQL Directory Backend (real DB) - Integration', () => {
  let engine;
  let client;

  function configureEnv() {
    process.env.SQL_URI = url;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
    process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number, member_uids FROM groups';
    process.env.SQL_QUERY_GROUPS_BY_MEMBER = 'SELECT cn AS name, gid_number, member_uids FROM groups WHERE member_uids @> to_jsonb(?::text)';
  }

  async function startServer(requireAuthForSearch = false) {
    configureEnv();
    const directoryProvider = new SQLDirectoryProvider();
    const authProvider = { initialize: async()=>{}, cleanup: async()=>{}, authenticate: async ()=> true };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch, logger });
    await engine.start();
    client = createClient();
    return client;
  }

  beforeAll(async () => {
    await seedPostgres();
  });

  afterEach(async () => { 
    if (client) { client.unbind?.(); client.destroy?.(); client = null; } 
    if (engine) { await engine.stop(); engine = null; } 
  });

  test('a. (objectClass=*) should return all objects (users + groups)', async () => {
    await startServer(false);
    const results = await doSearch(client, acceptanceFilters.allObjects);
    // 4 users + 4 groups = 8
    expect(results.length).toBeGreaterThanOrEqual(8);
    const userEntries = results.filter(r => /uid=/.test(r.dn));
    const groupEntries = results.filter(r => /cn=/.test(r.dn));
    expect(userEntries.length).toBeGreaterThan(0);
    expect(groupEntries.length).toBeGreaterThan(0);
  });

  test('b. (objectClass=posixAccount) should return all users', async () => {
    await startServer(false);
    const results = await doSearch(client, acceptanceFilters.allUsers);
    // From common.users.json → 4 users
    expect(results.length).toBe(4);
    // Verify DN shape
    results.forEach(entry => {
      expect(typeof entry.dn).toBe('string');
      expect(entry.dn).toMatch(/uid=/);
    });
  });

  test('c. (objectClass=posixGroup) should return all groups', async () => {
    await startServer(false);
    const results = await doSearch(client, acceptanceFilters.allGroups);
    // From common.groups.json → 4 groups (including empty)
    expect(results.length).toBe(4);
    results.forEach(entry => {
      expect(typeof entry.dn).toBe('string');
      expect(entry.dn).toMatch(/cn=/);
    });
  });

  test('d. (uid=username) should return specific user', async () => {
    await startServer(false);
    const results = await doSearch(client, acceptanceFilters.specificUser('testuser'));
    expect(results.length).toBe(1);
    expect(results[0].dn).toMatch(/uid=testuser/);
  });

  test('e. (cn=groupname) should return specific group', async () => {
    await startServer(false);
    const results = await doSearch(client, acceptanceFilters.specificGroup('admins'));
    expect(results.length).toBeGreaterThanOrEqual(1);
    const group = results.find(r => /cn=admins,/.test(r.dn));
    expect(group).toBeDefined();
  });

  test('f. (cn=*) should return all groups via wildcard', async () => {
    await startServer(false);
    const results = await doSearch(client, acceptanceFilters.allGroupsWildcard);
    expect(results.length).toBe(4);
    results.forEach(entry => expect(entry.dn).toMatch(/cn=/));
  });

  test('should handle non-existent user lookup', async () => {
    await startServer(false);
    const results = await doSearch(client, '(uid=nonexistent)');
    expect(results.length).toBe(0);
  });

  test('should handle non-existent group lookup', async () => {
    await startServer(false);
    const results = await doSearch(client, '(cn=nonexistentgroup)');
    expect(results.length).toBe(0);
  });
});
