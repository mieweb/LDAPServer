// Unit Tests for filterUtils.js
// Tests LDAP filter parsing and request analysis utilities

const {
  extractCredentials,
  getUsernameFromFilter,
  isAllUsersRequest,
  isGroupSearchRequest,
  isMixedSearchRequest,
  parseGroupFilter
} = require('../../../src/utils/filterUtils');

const { testFilters } = require('../../fixtures/testData');

describe('filterUtils', () => {

  describe('extractCredentials', () => {

    test('should extract username and password from bind request', () => {
      const req = {
        dn: { toString: () => 'uid=testuser,dc=example,dc=com' },
        credentials: 'password123'
      };

      const result = extractCredentials(req);

      expect(result).toBeDefined();
      expect(result.username).toBe('testuser');
      expect(result.password).toBe('password123');
    });
  });

  describe('getUsernameFromFilter', () => {

    test('should extract username from simple uid filter: (uid=testuser)', () => {
      const username = getUsernameFromFilter('(uid=testuser)');
      expect(username).toBe('testuser');
    });

    test('should extract username from AND compound filter: (&(objectClass=posixAccount)(uid=admin))', () => {
      const username = getUsernameFromFilter('(&(objectClass=posixAccount)(uid=admin))');
      expect(username).toBe('admin');
    });

    test('should return null for wildcard uid search: (uid=*)', () => {
      const username = getUsernameFromFilter('(uid=*)');
      expect(username).toBeNull();
    });

    test('should return null for empty filter', () => {
      const username = getUsernameFromFilter('');
      expect(username).toBeNull();
    });

    test('should return null for null filter', () => {
      const username = getUsernameFromFilter(null);
      expect(username).toBeNull();
    });

    test('should handle filter with special characters in username: (uid=john.doe-123)', () => {
      const username = getUsernameFromFilter('(uid=john.doe-123)');
      expect(username).toBe('john.doe-123');
    });
  });

  describe('isAllUsersRequest', () => {

    test('should detect posixAccount objectClass filter: (objectClass=posixAccount)', () => {
      const result = isAllUsersRequest('(objectClass=posixAccount)', []);
      expect(result).toBe(true);
    });

    test('should detect inetOrgPerson objectClass filter: (objectClass=inetOrgPerson)', () => {
      const result = isAllUsersRequest('(objectClass=inetOrgPerson)', []);
      expect(result).toBe(true);
    });

    test('should detect person objectClass filter: (objectClass=person)', () => {
      const result = isAllUsersRequest('(objectClass=person)', []);
      expect(result).toBe(true);
    });

    test('should detect wildcard uid filter: (uid=*)', () => {
      const result = isAllUsersRequest('(uid=*)', []);
      expect(result).toBe(true);
    });

    test('should detect empty filter with user attributes', () => {
      const result = isAllUsersRequest('', ['uid', 'email', 'firstname']);
      expect(result).toBe(true);
    });

    test('should return false for specific user filter: (uid=testuser)', () => {
      const result = isAllUsersRequest('(uid=testuser)', []);
      expect(result).toBe(false);
    });

    test('should return false for group filter: (objectClass=posixGroup)', () => {
      const result = isAllUsersRequest('(objectClass=posixGroup)', []);
      expect(result).toBe(false);
    });

    test('should handle case-insensitive filters: (OBJECTCLASS=POSIXACCOUNT)', () => {
      const result = isAllUsersRequest('(OBJECTCLASS=POSIXACCOUNT)', []);
      expect(result).toBe(true);
    });
  });

  describe('isGroupSearchRequest', () => {

    test('should detect posixGroup objectClass filter: (objectClass=posixGroup)', () => {
      const result = isGroupSearchRequest('(objectClass=posixGroup)', []);
      expect(result).toBe(true);
    });

    test('should detect groupOfNames objectClass filter: (objectClass=groupOfNames)', () => {
      const result = isGroupSearchRequest('(objectClass=groupOfNames)', []);
      expect(result).toBe(true);
    });

    test('should detect memberUid filter: (memberUid=testuser)', () => {
      const result = isGroupSearchRequest('(memberUid=testuser)', []);
      expect(result).toBe(true);
    });

    test('should detect gidNumber filter: (gidNumber=1001)', () => {
      const result = isGroupSearchRequest('(gidNumber=1001)', []);
      expect(result).toBe(true);
    });

    test('should detect gidNumber attribute', () => {
      const result = isGroupSearchRequest('', ['gidNumber']);
      expect(result).toBe(true);
    });

    test('should detect memberUid attribute', () => {
      const result = isGroupSearchRequest('', ['memberUid']);
      expect(result).toBe(true);
    });


    test('should detect cn-only attribute requests as group search', () => {
      const result = isGroupSearchRequest('', ['cn']);
      expect(result).toBe(true);
    });

    test('should detect member attribute', () => {
      const result = isGroupSearchRequest('', ['member']);
      expect(result).toBe(true);
    });

    test('should detect uniqueMember attribute', () => {
      const result = isGroupSearchRequest('', ['uniqueMember']);
      expect(result).toBe(true);
    });

    test('should return false for user-only filter: (objectClass=posixAccount)', () => {
      const result = isGroupSearchRequest('(objectClass=posixAccount)', []);
      expect(result).toBe(false);
    });

    test('should handle case-insensitive filters: (OBJECTCLASS=POSIXGROUP)', () => {
      const result = isGroupSearchRequest('(OBJECTCLASS=POSIXGROUP)', []);
      expect(result).toBe(true);
    });

    test('should detect compound filter with cn and group objectClass: (&(objectClass=posixGroup)(cn=admins))', () => {
      const result = isGroupSearchRequest('(&(objectClass=posixGroup)(cn=admins))', []);
      expect(result).toBe(true);
    });
  });

  describe('isMixedSearchRequest', () => {

    test('should detect objectClass in filter: (objectClass=*)', () => {
      const result = isMixedSearchRequest('(objectClass=*)');
      expect(result).toBe(true);
    });

    test('should detect empty filter as mixed', () => {
      const result = isMixedSearchRequest('');
      expect(result).toBe(true);
    });

    test('should return false for specific user filter: (uid=testuser)', () => {
      const result = isMixedSearchRequest('(uid=testuser)');
      expect(result).toBe(false);
    });

    test('should treat cn filter as group-only (not mixed): (cn=admins)', () => {
      const result = isMixedSearchRequest('(cn=admins)');
      expect(result).toBe(false);
    });

    test('should treat cn wildcard as group-only (not mixed): (cn=*)', () => {
      const result = isMixedSearchRequest('(cn=*)');
      expect(result).toBe(false);
    });

    test('should treat generic OBJECTCLASS=top as mixed: (OBJECTCLASS=top)', () => {
      const result = isMixedSearchRequest('(OBJECTCLASS=top)');
      expect(result).toBe(true);
    });
  });

  describe('parseGroupFilter', () => {

    test('should parse simple cn filter: (cn=developers)', () => {
      const result = parseGroupFilter('(cn=developers)');

      expect(result.cn).toBe('developers');
      expect(result.objectClass).toBeUndefined();
    });

    test('should parse compound AND filter: (&(objectClass=posixGroup)(cn=admins))', () => {
      const result = parseGroupFilter('(&(objectClass=posixGroup)(cn=admins))');

      expect(result.cn).toBe('admins');
      expect(result.objectClass).toBe('posixGroup');
    });

    test('should parse memberUid filter: (memberUid=testuser)', () => {
      const result = parseGroupFilter('(memberUid=testuser)');

      expect(result.memberUid).toBe('testuser');
      expect(result.cn).toBeUndefined();
      expect(result.gidNumber).toBeUndefined();
      expect(result.objectClass).toBeUndefined();
    });


    test('should parse gidNumber filter: (gidNumber=1001)', () => {
      const result = parseGroupFilter('(gidNumber=1001)');

      expect(result.gidNumber).toBe('1001');
      expect(result.cn).toBeUndefined();
      expect(result.memberUid).toBeUndefined();
      expect(result.objectClass).toBeUndefined();
    });


    test('should handle wildcard gidNumber: (gidNumber=*)', () => {
      const result = parseGroupFilter('(gidNumber=*)');

      expect(result.gidNumber).toBe('*');
    });

    test('should parse complex filter with multiple conditions: (&(objectClass=posixGroup)(cn=users)(gidNumber=1001))', () => {
      const result = parseGroupFilter('(&(objectClass=posixGroup)(cn=users)(gidNumber=1001))');

      expect(result.cn).toBe('users');
      expect(result.gidNumber).toBe('1001');
      expect(result.objectClass).toBe('posixGroup');
    });

    test('should return empty object for null filter', () => {
      const result = parseGroupFilter(null);

      expect(result).toEqual({});
    });

    test('should return empty object for empty filter', () => {
      const result = parseGroupFilter('');

      expect(result).toEqual({});
    });

    test('should parse cn value containing spaces: (cn=Test Group)', () => {
      const result = parseGroupFilter('(cn=Test Group)');
      expect(result.cn).toBe('Test Group');

      expect(result.memberUid).toBeUndefined();
      expect(result.gidNumber).toBeUndefined();
      expect(result.objectClass).toBeUndefined();
    });


    test('should handle case-insensitive attribute names: (CN=TestGroup)', () => {
      const result = parseGroupFilter('(CN=TestGroup)');

      expect(result.cn).toBe('TestGroup');
    });
  });
});
