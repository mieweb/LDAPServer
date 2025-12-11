/**
 * Shared Test Fixtures for Server Integration Tests
 * 
 * Database-compatible test data for SQL/MongoDB/Proxmox backends
 */

/**
 * Test users for database seeding
 * Compatible with SQL and MongoDB schemas
 */
const testUsers = [
  {
    username: 'testuser',
    password: 'password123', // Plain text for test, backends will hash
    uid_number: 1001,
    gid_number: 1001,
    full_name: 'Test User',
    surname: 'User',
    given_name: 'Test',
    mail: 'testuser@example.com',
    home_directory: '/home/testuser',
    login_shell: '/bin/bash',
    enabled: true
  },
  {
    username: 'admin',
    password: 'admin123',
    uid_number: 1000,
    gid_number: 1000,
    full_name: 'Administrator',
    surname: 'Admin',
    given_name: 'Admin',
    mail: 'admin@example.com',
    home_directory: '/home/admin',
    login_shell: '/bin/bash',
    enabled: true
  },
  {
    username: 'jdoe',
    password: 'test123',
    uid_number: 1002,
    gid_number: 1001,
    full_name: 'John Doe',
    surname: 'Doe',
    given_name: 'John',
    mail: 'jdoe@example.com',
    home_directory: '/home/jdoe',
    login_shell: '/bin/bash',
    enabled: true
  },
  {
    username: 'disabled',
    password: 'password',
    uid_number: 1003,
    gid_number: 1001,
    full_name: 'Disabled User',
    surname: 'User',
    given_name: 'Disabled',
    mail: 'disabled@example.com',
    home_directory: '/home/disabled',
    login_shell: '/bin/bash',
    enabled: false // Test disabled accounts
  }
];

/**
 * Test groups for database seeding
 */
const testGroups = [
  {
    cn: 'users',
    gid_number: 1001,
    description: 'Standard users group',
    member_uids: ['testuser', 'jdoe', 'disabled']
  },
  {
    cn: 'admins',
    gid_number: 1000,
    description: 'System administrators',
    member_uids: ['admin']
  },
  {
    cn: 'developers',
    gid_number: 1002,
    description: 'Development team',
    member_uids: ['testuser', 'jdoe']
  },
  {
    cn: 'empty',
    gid_number: 1003,
    description: 'Empty group for testing',
    member_uids: []
  }
];

/**
 * Base DN for tests
 */
const baseDN = 'dc=example,dc=com';
const usersDN = `ou=users,${baseDN}`;
const groupsDN = `ou=groups,${baseDN}`;

/**
 * Generate full DN for a user
 */
function getUserDN(username) {
  return `uid=${username},${usersDN}`;
}

/**
 * Generate full DN for a group
 */
function getGroupDN(groupname) {
  return `cn=${groupname},${groupsDN}`;
}

/**
 * Test LDAP filters (acceptance criteria)
 */
const acceptanceFilters = {
  // Directory backend tests
  allObjects: '(objectClass=*)',
  allUsers: '(objectClass=posixAccount)',
  allGroups: '(objectClass=posixGroup)',
  specificUser: (username) => `(uid=${username})`,
  specificGroup: (groupname) => `(cn=${groupname})`,
  allGroupsWildcard: '(cn=*)',
  
  // Complex filters
  userByUidNumber: (uid) => `(uidNumber=${uid})`,
  groupByGidNumber: (gid) => `(gidNumber=${gid})`,
  groupByMember: (username) => `(memberUid=${username})`,
  compoundUser: (username) => `(&(objectClass=posixAccount)(uid=${username}))`,
  compoundGroup: (groupname) => `(&(objectClass=posixGroup)(cn=${groupname}))`
};

/**
 * Expected LDAP attributes for validation
 */
const expectedUserAttributes = [
  'objectClass',
  'uid',
  'uidNumber',
  'gidNumber',
  'cn',
  'sn',
  'givenName',
  'mail',
  'homeDirectory',
  'loginShell'
];

const expectedGroupAttributes = [
  'objectClass',
  'cn',
  'gidNumber',
  'memberUid'
];

/**
 * Test server ports (to avoid conflicts)
 */
const testPorts = {
  sql: 3890,
  mongodb: 3891,
  mongodbAuth: 3896,
  proxmox: 3892,
  proxmoxAuth: 3895,
  security: 3893,
  tls: 3894
};

module.exports = {
  testUsers,
  testGroups,
  baseDN,
  usersDN,
  groupsDN,
  getUserDN,
  getGroupDN,
  acceptanceFilters,
  expectedUserAttributes,
  expectedGroupAttributes,
  testPorts
};
