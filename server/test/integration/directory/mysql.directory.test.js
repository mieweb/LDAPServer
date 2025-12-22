const mysql = require('mysql2/promise');
const { LdapEngine } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
const { MySQLSeeder } = require('../../utils/dbSeeder');
const { provider: SQLDirectoryProvider } = require('../../../backends/sql.directory');
const { acceptanceFilters } = require('../../fixtures/testData');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybeDescribe = RUN ? describe : describe.skip;

const baseDn = 'dc=test,dc=local';
const port = 13589;
const url = process.env.SQL_URI || 'mysql://testuser:testpass@127.0.0.1:23306/testdb';

function createClient() { return ldap.createClient({ url: `ldap://127.0.0.1:${port}` }); }

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

maybeDescribe('MySQL Directory Backend (real DB) - Integration', () => {
  let engine;
  let conn;
  let client;

  function configureEnv() {
    process.env.SQL_URI = url;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
    process.env.SQL_QUERY_ALL_GROUPS = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups`';
    process.env.SQL_QUERY_GROUPS_BY_MEMBER = 'SELECT cn AS name, gid_number AS gid_number, member_uids FROM `groups` WHERE JSON_CONTAINS(member_uids, JSON_QUOTE(?), "$")';
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
    conn = await mysql.createConnection(url);
    const seeder = new MySQLSeeder(conn);
    await seeder.seed();
  });

  afterAll(async () => { if (conn) await conn.end(); });
  afterEach(async () => { if (client) { client.unbind?.(); client.destroy?.(); client = null; } if (engine) { await engine.stop(); engine = null; } });

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
