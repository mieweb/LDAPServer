// Shared Test Fixtures
// 
// Single source of truth for test data across all tests (DRY principle)
// Used by both npm unit tests and server integration tests

// Standard test users
const testUsers = [
  {
    username: 'testuser',
    uid: 1001,
    gidNumber: 1001,
    cn: 'Test User',
    sn: 'User',
    mail: 'testuser@example.com',
    userPassword: 'password123',
    homeDirectory: '/home/testuser',
    loginShell: '/bin/bash'
  },
  {
    username: 'admin',
    uid: 1000,
    gidNumber: 1000,
    cn: 'Admin User',
    sn: 'Admin',
    mail: 'admin@example.com',
    userPassword: 'admin123',
    homeDirectory: '/home/admin',
    loginShell: '/bin/bash'
  },
  {
    username: 'jdoe',
    uid: 1002,
    gidNumber: 1001,
    cn: 'John Doe',
    sn: 'Doe',
    givenName: 'John',
    mail: 'jdoe@example.com',
    userPassword: 'test123',
    homeDirectory: '/home/jdoe',
    loginShell: '/bin/bash'
  },
  {
    username: 'mfauser',
    uid: 1003,
    gidNumber: 1001,
    cn: 'MFA User',
    sn: 'MFA',
    givenName: 'MFA',
    mail: 'mfauser@example.com',
    userPassword: 'mfa123',
    homeDirectory: '/home/mfauser',
    loginShell: '/bin/bash',
    auth_backends: 'mock-auth'
  }
];

// Standard test groups
const testGroups = [
  {
    cn: 'users',
    gidNumber: 1001,
    description: 'Standard users group',
    memberUids: ['testuser', 'jdoe']
  },
  {
    cn: 'admins',
    gidNumber: 1000,
    description: 'System administrators',
    memberUids: ['admin']
  },
  {
    cn: 'developers',
    gidNumber: 1002,
    description: 'Development team',
    memberUids: ['testuser', 'jdoe']
  }
];

// Base DN for tests
const baseDN = 'dc=example,dc=com';
const usersDN = `ou=users,${baseDN}`;
const groupsDN = `ou=groups,${baseDN}`;

// Generate LDAP DN for a user
function getUserDN(username) {
  return `uid=${username},${usersDN}`;
}

// Generate LDAP DN for a group
function getGroupDN(groupname) {
  return `cn=${groupname},${groupsDN}`;
}

// Create a mock LDAP user entry (following posixAccount schema)
function createMockUserEntry(user) {
  return {
    dn: getUserDN(user.username),
    attributes: {
      objectClass: ['inetOrgPerson', 'posixAccount', 'top'],
      uid: user.username,
      uidNumber: user.uid,
      gidNumber: user.gidNumber,
      cn: user.cn,
      sn: user.sn,
      givenName: user.givenName || user.cn.split(' ')[0],
      mail: user.mail,
      homeDirectory: user.homeDirectory,
      loginShell: user.loginShell,
      userPassword: user.userPassword
    }
  };
}

// Create a mock LDAP group entry (following posixGroup schema)
function createMockGroupEntry(group) {
  return {
    dn: getGroupDN(group.cn),
    attributes: {
      objectClass: ['posixGroup', 'top'],
      cn: group.cn,
      gidNumber: group.gidNumber,
      description: group.description,
      memberUid: group.memberUids
    }
  };
}

// Common LDAP filters for testing
// 
// NOTE: Follows LDAP standards where cn= is ambiguous:
// - (cn=value) searches ALL entries (users have cn=common name, groups have cn=group name)
// - To search ONLY groups, use: (&(objectClass=posixGroup)(cn=value))
const testFilters = {
  allObjects: '(objectClass=*)',
  allUsers: '(objectClass=posixAccount)',
  allGroups: '(objectClass=posixGroup)',
  specificUser: (username) => `(uid=${username})`,
  specificGroup: (groupname) => `(cn=${groupname})`, // Mixed search - finds users or groups
  allUsersByWildcard: '(uid=*)',
  allGroupsByWildcard: '(cn=*)', // Mixed search - finds all entries with cn attribute
  complexAnd: '(&(objectClass=posixAccount)(uid=testuser))',
  complexOr: '(|(uid=testuser)(uid=admin))'
};

// Test LDAP server configuration
const testServerConfig = {
  port: 3890, // Non-standard port to avoid conflicts
  bindDN: 'cn=admin,dc=example,dc=com',
  bindPassword: 'adminpass',
  baseDN: baseDN,
  tlsOptions: {
    key: null, // Will be set in tests that need TLS
    cert: null
  }
};

module.exports = {
  testUsers,
  testGroups,
  baseDN,
  usersDN,
  groupsDN,
  getUserDN,
  getGroupDN,
  createMockUserEntry,
  createMockGroupEntry,
  testFilters,
  testServerConfig
};
