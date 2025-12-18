/**
 * Shared Test Fixtures for Server Integration Tests
 * 
 * Database-compatible test data for SQL/MongoDB/Proxmox backends
 * 
 * NOTE: User and group data now loaded from centralized test/data/ directory
 * This file now only contains test utilities, filters, and configuration
 */

const { loadCommonUsers, loadCommonGroups } = require('../utils/dataLoader');

/**
 * Test users for database seeding
 * Loaded from test/data/common.users.json
 */
const testUsers = loadCommonUsers();

/**
 * Test groups for database seeding
 * Loaded from test/data/common.groups.json
 */
const testGroups = loadCommonGroups();

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
