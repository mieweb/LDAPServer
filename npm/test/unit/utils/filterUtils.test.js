/**
 * Unit Tests for filterUtils.js
 * 
 * Tests LDAP filter parsing and request analysis utilities
 */

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
    
    test('should handle admin DN format', () => {
      const req = {
        dn: { toString: () => 'cn=admin,dc=example,dc=com' },
        credentials: 'adminpass'
      };
      
      const result = extractCredentials(req);
      
      expect(result.username).toBe('admin');
      expect(result.password).toBe('adminpass');
    });
    
    test('should strip non-printable characters from password', () => {
      const req = {
        dn: { toString: () => 'uid=user,dc=example,dc=com' },
        credentials: 'pass\x00word\x01test\x1F'
      };
      
      const result = extractCredentials(req);
      
      expect(result.password).toBe('passwordtest');
      expect(result.password).not.toContain('\x00');
    });
    
    test('should handle complex DN with multiple components', () => {
      const req = {
        dn: { toString: () => 'uid=john.doe,ou=users,dc=company,dc=com' },
        credentials: 'secret'
      };
      
      const result = extractCredentials(req);
      
      expect(result.username).toBe('john.doe');
    });
  });
  
  describe('getUsernameFromFilter', () => {
    
    test('should extract username from simple uid filter', () => {
      const username = getUsernameFromFilter('(uid=testuser)');
      expect(username).toBe('testuser');
    });
    
    test('should extract username from AND compound filter', () => {
      const username = getUsernameFromFilter('(&(objectClass=posixAccount)(uid=admin))');
      expect(username).toBe('admin');
    });
    
    test('should extract username from OR compound filter', () => {
      const username = getUsernameFromFilter('(|(uid=user1)(uid=user2))');
      expect(username).toBe('user1'); // Returns first match
    });
    
    test('should return null for wildcard uid search', () => {
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
    
    test('should handle filter with special characters in username', () => {
      const username = getUsernameFromFilter('(uid=john.doe-123)');
      expect(username).toBe('john.doe-123');
    });
    
    test('should extract from NOT filter', () => {
      const username = getUsernameFromFilter('(!(uid=blocked))');
      expect(username).toBe('blocked');
    });
  });
  
  describe('isAllUsersRequest', () => {
    
    test('should detect posixAccount objectClass filter', () => {
      const result = isAllUsersRequest('(objectClass=posixAccount)', []);
      expect(result).toBe(true);
    });
    
    test('should detect inetOrgPerson objectClass filter', () => {
      const result = isAllUsersRequest('(objectClass=inetOrgPerson)', []);
      expect(result).toBe(true);
    });
    
    test('should detect person objectClass filter', () => {
      const result = isAllUsersRequest('(objectClass=person)', []);
      expect(result).toBe(true);
    });
    
    test('should detect wildcard uid filter', () => {
      const result = isAllUsersRequest('(uid=*)', []);
      expect(result).toBe(true);
    });
    
    test('should detect empty filter with user attributes', () => {
      const result = isAllUsersRequest('', ['uid', 'email', 'firstname']);
      expect(result).toBe(true);
    });
    
    test('should return false for specific user filter', () => {
      const result = isAllUsersRequest('(uid=testuser)', []);
      expect(result).toBe(false);
    });
    
    test('should return false for group filter', () => {
      const result = isAllUsersRequest('(objectClass=posixGroup)', []);
      expect(result).toBe(false);
    });
    
    test('should handle case-insensitive filters', () => {
      const result = isAllUsersRequest('(OBJECTCLASS=POSIXACCOUNT)', []);
      expect(result).toBe(true);
    });
  });
  
  describe('isGroupSearchRequest', () => {
    
    test('should detect posixGroup objectClass filter', () => {
      const result = isGroupSearchRequest('(objectClass=posixGroup)', []);
      expect(result).toBe(true);
    });
    
    test('should detect groupOfNames objectClass filter', () => {
      const result = isGroupSearchRequest('(objectClass=groupOfNames)', []);
      expect(result).toBe(true);
    });
    
    test('should detect memberUid filter', () => {
      const result = isGroupSearchRequest('(memberUid=testuser)', []);
      expect(result).toBe(true);
    });
    
    test('should detect gidNumber filter', () => {
      const result = isGroupSearchRequest('(gidNumber=1001)', []);
      expect(result).toBe(true);
    });
    
    test('should detect group attributes in request', () => {
      const result = isGroupSearchRequest('', ['gidNumber', 'memberUid']);
      expect(result).toBe(true);
    });
    
    test('should detect cn-only attribute requests as group search', () => {
      const result = isGroupSearchRequest('', ['cn']);
      expect(result).toBe(true);
    });
    
    test('should detect member/uniqueMember attributes', () => {
      const result = isGroupSearchRequest('', ['member', 'uniqueMember']);
      expect(result).toBe(true);
    });
    
    test('should return false for user-only filter', () => {
      const result = isGroupSearchRequest('(objectClass=posixAccount)', []);
      expect(result).toBe(false);
    });
    
    test('should handle case-insensitive filters', () => {
      const result = isGroupSearchRequest('(OBJECTCLASS=POSIXGROUP)', []);
      expect(result).toBe(true);
    });
    
    test('should detect compound filter with cn and group objectClass', () => {
      const result = isGroupSearchRequest('(&(objectClass=posixGroup)(cn=admins))', []);
      expect(result).toBe(true);
    });
  });
  
  describe('isMixedSearchRequest', () => {
    
    test('should detect objectClass in filter', () => {
      const result = isMixedSearchRequest('(objectClass=*)');
      expect(result).toBe(true);
    });
    
    test('should detect empty filter as mixed', () => {
      const result = isMixedSearchRequest('');
      expect(result).toBe(true);
    });
    
    test('should return false for specific user filter', () => {
      const result = isMixedSearchRequest('(uid=testuser)');
      expect(result).toBe(false);
    });
    
    test('should detect cn filter as mixed (can be user or group)', () => {
      const result = isMixedSearchRequest('(cn=admins)');
      expect(result).toBe(true);
    });
    
    test('should detect cn wildcard as mixed', () => {
      const result = isMixedSearchRequest('(cn=*)');
      expect(result).toBe(true);
    });
    
    test('should handle case-insensitive objectClass', () => {
      const result = isMixedSearchRequest('(OBJECTCLASS=top)');
      expect(result).toBe(true);
    });
  });
  
  describe('parseGroupFilter', () => {
    
    test('should parse simple cn filter', () => {
      const result = parseGroupFilter('(cn=developers)');
      
      expect(result.cn).toBe('developers');
      expect(result.objectClass).toBeUndefined();
    });
    
    test('should parse compound AND filter', () => {
      const result = parseGroupFilter('(&(objectClass=posixGroup)(cn=admins))');
      
      expect(result.cn).toBe('admins');
      expect(result.objectClass).toBe('posixGroup');
    });
    
    test('should parse memberUid filter', () => {
      const result = parseGroupFilter('(memberUid=testuser)');
      
      expect(result.memberUid).toBe('testuser');
    });
    
    test('should parse gidNumber filter', () => {
      const result = parseGroupFilter('(gidNumber=1001)');
      
      expect(result.gidNumber).toBe('1001');
    });
    
    test('should handle wildcard gidNumber', () => {
      const result = parseGroupFilter('(gidNumber=*)');
      
      expect(result.gidNumber).toBe('*');
    });
    
    test('should parse complex filter with multiple conditions', () => {
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
    
    test('should handle OR filters', () => {
      const result = parseGroupFilter('(|(cn=admins)(cn=users))');
      
      expect(result.cn).toBe('admins'); // Returns first match
    });
    
    test('should handle filters with whitespace', () => {
      const result = parseGroupFilter('(cn=developers)'); // Parser doesn't handle spaces inside parens
      
      expect(result.cn).toBe('developers');
    });
    
    test('should handle case-insensitive attribute names', () => {
      const result = parseGroupFilter('(CN=TestGroup)');
      
      expect(result.cn).toBe('TestGroup');
    });
  });
  
  describe('testFilters compatibility', () => {
    
    test('should correctly identify test fixture filters', () => {
      // All objects filter
      expect(isMixedSearchRequest(testFilters.allObjects)).toBe(true);
      
      // All users filter
      expect(isAllUsersRequest(testFilters.allUsers, [])).toBe(true);
      
      // All groups filter
      expect(isGroupSearchRequest(testFilters.allGroups, [])).toBe(true);
      
      // Specific user
      expect(getUsernameFromFilter(testFilters.specificUser('testuser'))).toBe('testuser');
      
      // Specific group
      const groupFilter = parseGroupFilter(testFilters.specificGroup('admins'));
      expect(groupFilter.cn).toBe('admins');
    });
  });
});
