const { Client } = require('pg');
const { LdapEngine } = require('@ldap-gateway/core');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
const { PostgreSQLSeeder } = require('../../utils/dbSeeder');
const { provider: SQLAuthProvider } = require('../../../backends/sql.auth');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybeDescribe = RUN ? describe : describe.skip;

const baseDn = 'dc=test,dc=local';
const port = 13689;
const url = process.env.SQL_URI || 'postgres://testuser:testpass@127.0.0.1:25432/testdb';

function createClient() { return ldap.createClient({ url: `ldap://127.0.0.1:${port}` }); }

async function seedPostgres() {
  const client = new Client({ connectionString: url });
  await client.connect();
  const seeder = new PostgreSQLSeeder(client);
  await seeder.seed();
  await client.end();
}

maybeDescribe('PostgreSQL Auth Backend (real DB) - Integration', () => {
  let engine;

  beforeAll(async () => { await seedPostgres(); });
  afterEach(async () => { if (engine) { await engine.stop(); engine = null; } });

  test('Bind with valid credentials should succeed (Postgres)', async () => {
    process.env.SQL_URI = url;
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';

    const authProvider = new SQLAuthProvider();
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider: { initialize: async()=>{}, cleanup: async()=>{} }, logger });
    await engine.start();

    const client = createClient();
    await expect(new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'password123', (e)=>e?reject(e):resolve()))).resolves.not.toThrow();
    client.unbind();
  });

  test('Bind with invalid credentials should fail (Postgres)', async () => {
    process.env.SQL_URI = url;
    process.env.SQL_QUERY_ONE_USER = 'SELECT username, full_name, surname, mail, home_directory, login_shell, uid_number, gid_number, password_hash AS password FROM users WHERE username = ?';

    const authProvider = new SQLAuthProvider();
    engine = new LdapEngine({ baseDn, port, authProviders: [authProvider], directoryProvider: { initialize: async()=>{}, cleanup: async()=>{} }, logger });
    await engine.start();

    const client = createClient();
    await expect(new Promise((resolve, reject) => client.bind(`uid=testuser,${baseDn}`, 'wrongpassword', (e)=>e?reject(e):resolve()))).rejects.toThrow(/Invalid credentials/i);
    client.unbind();
  });
});
