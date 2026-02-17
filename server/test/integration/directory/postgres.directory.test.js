const { Client } = require('pg');
const { LdapEngine } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
const { PostgreSQLSeeder } = require('../../utils/dbSeeder');
const { provider: SQLDirectoryProvider } = require('../../../backends/sql.directory');
const { acceptanceFilters } = require('../../fixtures/testData');

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
      res.on('searchEntry', (entry) => {
        entries.push({
          dn: entry.objectName.toString(),
          attributes: entry.attributes.reduce((acc, attr) => {
            // Handle multi-value attributes
            const values = attr.values || attr.vals || [];
            acc[attr.type] = values.length === 1 ? values[0] : values;
            return acc;
          }, {})
        });
      });
      res.on('error', (e) => reject(e));
      res.on('end', () => resolve(entries));
    });
  });
}

maybeDescribe('PostgreSQL Directory Backend (real DB) - Integration', () => {
  let engine;
  let conn;
  let client;

  function configureEnv() {
    process.env.SQL_URI = url;
    process.env.SQL_QUERY_ALL_USERS = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, sshpublickey FROM users';
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, sshpublickey, password_hash AS password FROM users WHERE username = ?';
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
    conn = new Client({ connectionString: url });
    await conn.connect();
    const seeder = new PostgreSQLSeeder(conn);
    await seeder.seed();
  });

  afterAll(async () => { if (conn) await conn.end(); });
  afterEach(async () => { 
    if (client) { client.unbind?.(); client.destroy?.(); client = null; } 
    if (engine) { await engine.stop(); engine = null; } 
  });

  describe('Acceptance Criteria: Directory Filters', () => {
    
    test('a. (objectClass=*) should return all objects (users + groups)', async () => {
      await startServer(false);
      const results = await doSearch(client, acceptanceFilters.allObjects);
      // 4 users + 4 groups = 8
      expect(results.length).toBeGreaterThanOrEqual(8);
      const userEntries = results.filter(r => /uid=/.test(r.dn));
      const groupEntries = results.filter(r => /cn=/.test(r.dn));
      expect(userEntries.length).toBe(4);
      expect(groupEntries.length).toBe(4);
    });

    test('b. (objectClass=posixAccount) should return all users', async () => {
      await startServer(false);
      const results = await doSearch(client, acceptanceFilters.allUsers);
      // From common.users.json → 4 users
      expect(results.length).toBe(4);
      
      // Verify all results are user entries with required attributes
      results.forEach(entry => {
        expect(typeof entry.dn).toBe('string');
        expect(entry.dn).toMatch(/uid=/);
        expect(entry.attributes.objectClass).toContain('posixAccount');
        expect(entry.attributes.objectClass).toContain('inetOrgPerson');
        expect(entry.attributes.uid).toBeDefined();
        expect(entry.attributes.uidNumber).toBeDefined();
        expect(entry.attributes.gidNumber).toBeDefined();
        expect(entry.attributes.homeDirectory).toBeDefined();
        expect(entry.attributes.loginShell).toBeDefined();
      });
      
      // Verify specific users are present
      const usernames = results.map(r => {
        const match = r.dn.match(/uid=([^,]+)/);
        return match ? match[1] : null;
      }).filter(Boolean);
      expect(usernames).toContain('testuser');
      expect(usernames).toContain('admin');
      expect(usernames).toContain('jdoe');
      expect(usernames).toContain('disabled');
    });

    test('c. (objectClass=posixGroup) should return all groups', async () => {
      await startServer(false);
      const results = await doSearch(client, acceptanceFilters.allGroups);
      // From common.groups.json → 4 groups (including empty)
      expect(results.length).toBe(4);
      
      // Verify all results are group entries with required attributes
      results.forEach(entry => {
        expect(typeof entry.dn).toBe('string');
        expect(entry.dn).toMatch(/cn=/);
        expect(entry.attributes.objectClass).toContain('posixGroup');
        expect(entry.attributes.cn).toBeDefined();
        expect(entry.attributes.gidNumber).toBeDefined();
        // memberUid may not be present for empty groups (LDAP compliant)
      });
      
      // Verify specific groups are present
      const groupNames = results.map(r => {
        const match = r.dn.match(/cn=([^,]+)/);
        return match ? match[1] : null;
      }).filter(Boolean);
      expect(groupNames).toContain('users');
      expect(groupNames).toContain('admins');
      expect(groupNames).toContain('developers');
      expect(groupNames).toContain('empty');
    });

    test('d. (uid=username) should return specific user', async () => {
      await startServer(false);
      const results = await doSearch(client, acceptanceFilters.specificUser('testuser'));
      expect(results.length).toBe(1);
      
      const user = results[0];
      expect(user.dn).toBe(`uid=testuser,${baseDn}`);
      expect(user.attributes.uid).toBe('testuser');
      expect(user.attributes.cn).toBe('Test User');
      expect(user.attributes.mail).toBe('testuser@example.com');
      expect(user.attributes.uidNumber).toBe('1001');
      expect(user.attributes.gidNumber).toBe('1001');
      expect(user.attributes.homeDirectory).toBe('/home/testuser');
      expect(user.attributes.loginShell).toBe('/bin/bash');
      expect(user.attributes.objectClass).toContain('posixAccount');
      expect(user.attributes.objectClass).toContain('inetOrgPerson');
    });

    test('e. (cn=groupname) should return specific group', async () => {
      await startServer(false);
      const results = await doSearch(client, acceptanceFilters.specificGroup('admins'));
      expect(results.length).toBe(1);
      
      const group = results[0];
      expect(group.dn).toBe(`cn=admins,${baseDn}`);
      expect(group.attributes.cn).toBe('admins');
      expect(group.attributes.gidNumber).toBe('1000');
      expect(group.attributes.objectClass).toContain('posixGroup');
      // Verify memberUid contains expected members
      expect(group.attributes.memberUid).toBeDefined();
      const memberUids = Array.isArray(group.attributes.memberUid) 
        ? group.attributes.memberUid 
        : [group.attributes.memberUid];
      expect(memberUids).toContain('admin');
    });

    test('f. (cn=*) should return all groups via wildcard', async () => {
      await startServer(false);
      const results = await doSearch(client, acceptanceFilters.allGroupsWildcard);
      expect(results.length).toBe(4);
      results.forEach(entry => expect(entry.dn).toMatch(/cn=/));
    });
  });
});
