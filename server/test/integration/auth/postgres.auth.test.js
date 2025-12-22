const { Client } = require('pg');
const { LdapEngine } = require('@ldap-gateway/core');
const bcrypt = require('bcrypt');
const ldap = require('ldapjs');
const logger = require('../../utils/mockLogger');
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
  // Simple seed
  await client.query(`DELETE FROM users; DELETE FROM groups;`);
  const hash = await bcrypt.hash('password123', 10);
  await client.query(`INSERT INTO users (username, password_hash, uid_number, gid_number, full_name, surname, given_name, mail, home_directory, login_shell, enabled)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (username) DO NOTHING`, [
      'testuser', hash, 10100, 20100, 'Test User', 'User', 'Test', 'testuser@example.com', '/home/testuser', '/bin/bash', true
    ]);
  await client.query(`INSERT INTO groups (cn, gid_number, description, member_uids)
    VALUES ('developers',20100,'Dev group','["testuser"]'::jsonb), ('devops',20101,'Ops group','["testuser"]'::jsonb)
    ON CONFLICT (cn) DO NOTHING`);
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
