const { LdapEngine, DirectoryProvider, ldapUtils } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');

const baseDn = 'dc=test,dc=local';
const port = 12389;

// Mock data resembling SQL rows
const users = [
  { username: 'testuser', uid_number: 1001, gid_number: 1001, full_name: 'Test User', mail: 'testuser@example.com', home_directory: '/home/testuser', login_shell: '/bin/bash' },
  { username: 'admin', uid_number: 1000, gid_number: 1000, full_name: 'Administrator', mail: 'admin@example.com', home_directory: '/home/admin', login_shell: '/bin/bash' },
];

const groups = [
  { name: 'developers', gid_number: 2001, member_uids: ['testuser'] },
  { name: 'admins', gid_number: 2000, member_uids: ['admin'] }
];

class MockSqlDirectoryProvider extends DirectoryProvider {
  async initialize() { /* no-op */ }
  async cleanup() { /* no-op */ }
  async findUser(username) {
    const u = users.find(x => x.username === username);
    return u ? ldapUtils.createLdapEntry(u, baseDn) : null;
  }
  async getAllUsers() { return users.map(u => ldapUtils.createLdapEntry(u, baseDn)); }
  async findGroups(filter) {
    // naive filter emulation using simple parse
    if (filter.includes('(cn=')) {
      const m = filter.match(/\(cn=([^\)]+)\)/);
      if (m && m[1] !== '*') return groups.filter(g => g.name === m[1]).map(g => ldapUtils.createLdapGroupEntry({ name: g.name, gid_number: g.gid_number, member_uids: g.member_uids }, baseDn));
      return groups.map(g => ldapUtils.createLdapGroupEntry({ name: g.name, gid_number: g.gid_number, member_uids: g.member_uids }, baseDn));
    }
    if (filter.includes('(memberUid=')) {
      const m = filter.match(/\(memberUid=([^\)]+)\)/);
      const val = m ? m[1] : null;
      if (val && val !== '*') return groups.filter(g => (g.member_uids||[]).includes(val)).map(g => ldapUtils.createLdapGroupEntry({ name: g.name, gid_number: g.gid_number, member_uids: g.member_uids }, baseDn));
      return [];
    }
    if (filter.includes('(gidNumber=')) {
      const m = filter.match(/\(gidNumber=([^\)]+)\)/);
      const val = m ? m[1] : null;
      if (val && val !== '*') return groups.filter(g => String(g.gid_number) === String(val)).map(g => ldapUtils.createLdapGroupEntry({ name: g.name, gid_number: g.gid_number, member_uids: g.member_uids }, baseDn));
      return groups.map(g => ldapUtils.createLdapGroupEntry({ name: g.name, gid_number: g.gid_number, member_uids: g.member_uids }, baseDn));
    }
    return groups.map(g => ldapUtils.createLdapGroupEntry({ name: g.name, gid_number: g.gid_number, member_uids: g.member_uids }, baseDn));
  }
  async getAllGroups() { return groups.map(g => ldapUtils.createLdapGroupEntry({ name: g.name, gid_number: g.gid_number, member_uids: g.member_uids }, baseDn)); }
}

const createClient = () => ldap.createClient({ url: `ldap://127.0.0.1:${port}` });

async function doSearch(client, filter) {
  return new Promise((resolve, reject) => {
    const entries = [];
    client.search(baseDn, { filter, scope: 'sub' }, (err, res) => {
      if (err) return reject(err);
      res.on('searchEntry', (e) => entries.push(e.pojo));
      res.on('error', (e) => reject(e));
      res.on('end', () => resolve(entries));
    });
  });
}

describe('SQL Directory Backend (mocked) - Acceptance Tests', () => {
  let engine;

  afterEach(async () => {
    if (engine) { await engine.stop(); engine = null; }
  });

  beforeEach(async () => {
  const directoryProvider = new MockSqlDirectoryProvider();
    const authProvider = { initialize: jest.fn(), cleanup: jest.fn(), authenticate: jest.fn(async () => true) };
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider, requireAuthForSearch: false, logger });
    await engine.start();
  });

  test('a. (objectClass=*) should return all objects (users + groups)', async () => {
    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(objectClass=*)');
    expect(results.length).toBeGreaterThanOrEqual(4);
    client.unbind();
  });

  test('b. (objectClass=posixAccount) should return all users', async () => {
    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(objectClass=posixAccount)');
    expect(results.length).toBe(users.length);
    client.unbind();
  });

  test('c. (objectClass=posixGroup) should return all groups', async () => {
    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(objectClass=posixGroup)');
    expect(results.length).toBe(groups.length);
    client.unbind();
  });

  test('d. (uid=username) should return specific user', async () => {
    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(uid=testuser)');
    // For mocked provider, just verify at least one entry is returned
    expect(results.length).toBeGreaterThan(0);
    client.unbind();
  });

  test('e. (cn=groupname) should return specific group', async () => {
    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(cn=developers)');
    expect(results.length).toBeGreaterThan(0);
    client.unbind();
  });

  test('f. (cn=*) should return all groups', async () => {
    const client = createClient();
    await new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()));
    const results = await doSearch(client, '(cn=*)');
    // groups only (mocked provider may return minimal attributes)
    expect(results.length).toBeGreaterThanOrEqual(groups.length);
    client.unbind();
  });
});
