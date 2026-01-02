const mysql = require('mysql2/promise');
const { LdapEngine } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
const { MySQLSeeder } = require('../../utils/dbSeeder');
const { provider: SQLAuthProvider } = require('../../../backends/sql.auth');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybeDescribe = RUN ? describe : describe.skip;

const baseDn = 'dc=test,dc=local';
const port = 13489;
const url = process.env.SQL_URI || 'mysql://testuser:testpass@127.0.0.1:23306/testdb';

function createClient() { return ldap.createClient({ url: `ldap://127.0.0.1:${port}` }); }

function configureEnv() {
  process.env.SQL_URI = url;
  process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';
}

maybeDescribe('MySQL Auth Backend (real DB) - Integration', () => {
  let engine;
  let conn;
  let client;

  async function startServer() {
    configureEnv();
    const authProvider = new SQLAuthProvider();
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider: { initialize: async()=>{}, cleanup: async()=>{} }, logger });
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

  test('1. Bind with valid credentials should succeed', async () => {
    await startServer();
    await expect(new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()))).resolves.not.toThrow();
  });

  test('2. Bind with invalid credentials should fail', async () => {
    await startServer();
    await expect(new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'wrongpassword', (e)=>e?reject(e):resolve()))).rejects.toThrow(/Invalid credentials/i);
  });

  test('3. Bind with non-existent user should fail', async () => {
    await startServer();
    await expect(new Promise((resolve, reject) => client.bind(`uid=nonexistent,${baseDn}`, 'anypassword', (e)=>e?reject(e):resolve()))).rejects.toThrow();
  });

  test('4. should fail with empty password', async () => {
    await startServer();
    await expect(new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, '', (e)=>e?reject(e):resolve()))).rejects.toThrow();
  });
});
