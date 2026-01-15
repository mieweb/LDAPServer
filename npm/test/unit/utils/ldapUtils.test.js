// Unit Tests for ldapUtils.js
// Tests LDAP entry creation utilities without external dependencies

const {
  createLdapEntry,
  createLdapGroupEntry,
  extractDomainFromBaseDn
} = require('../../../src/utils/ldapUtils');

const { testUsers, testGroups, baseDN } = require('../../fixtures/testData');

describe('ldapUtils', () => {

  describe('createLdapEntry', () => {

    test('should create valid LDAP user entry with all fields', () => {
      const user = {
        username: 'testuser',
        uid_number: 1001,
        gid_number: 1001,
        full_name: 'Test User',
        last_name: 'User',
        mail: 'testuser@example.com',
        home_directory: '/home/testuser'
      };

      const entry = createLdapEntry(user, baseDN);

      expect(entry).toBeDefined();
      expect(entry.dn).toBe('uid=testuser,dc=example,dc=com');
      expect(entry.attributes).toBeDefined();
      expect(entry.attributes.objectClass).toEqual(['top', 'posixAccount', 'inetOrgPerson']);
      expect(entry.attributes.uid).toBe('testuser');
      expect(entry.attributes.uidNumber).toBe(1001);
      expect(entry.attributes.gidNumber).toBe(1001);
      expect(entry.attributes.cn).toBe('Test User');
      expect(entry.attributes.sn).toBe('User');
      expect(entry.attributes.mail).toBe('testuser@example.com');
      expect(entry.attributes.homeDirectory).toBe('/home/testuser');
      expect(entry.attributes.loginShell).toBe('/bin/bash');
    });

    test('should handle missing optional fields with defaults', () => {
      const user = {
        username: 'minimal',
        uid_number: 1500,
        gid_number: 1500
      };

      const entry = createLdapEntry(user, baseDN);

      expect(entry.attributes.cn).toBe('minimal'); // Defaults to username
      expect(entry.attributes.sn).toBeUndefined(); // Optional attribute, not set when missing
      expect(entry.attributes.mail).toBe('minimal@example.com'); // Generated from username and baseDN
      expect(entry.attributes.homeDirectory).toBe('/home/minimal'); // Generated home dir
      expect(entry.attributes.loginShell).toBe('/bin/bash'); // Default shell
    });

    test('should handle zero UID/GID numbers', () => {
      const user = {
        username: 'root',
        uid_number: 0,
        gid_number: 0,
        full_name: 'Root User',
        last_name: 'Root'
      };

      const entry = createLdapEntry(user, baseDN);

      expect(entry.attributes.uidNumber).toBe(0);
      expect(entry.attributes.gidNumber).toBe(0);
    });

    test('should throw error when uid_number is null', () => {
      const user = {
        username: 'nouid',
        uid_number: null,
        gid_number: 1000
      };

      expect(() => createLdapEntry(user, baseDN)).toThrow('uid_number is required for user nouid');
    });

    test('should throw error when uid_number is undefined', () => {
      const user = {
        username: 'nouid',
        gid_number: 1000
        // uid_number not provided
      };

      expect(() => createLdapEntry(user, baseDN)).toThrow('uid_number is required for user nouid');
    });

    test('should throw error when gid_number is null', () => {
      const user = {
        username: 'nogid',
        uid_number: 1000,
        gid_number: null
      };

      expect(() => createLdapEntry(user, baseDN)).toThrow('gid_number is required for user nogid');
    });

    test('should throw error when gid_number is undefined', () => {
      const user = {
        username: 'nogid',
        uid_number: 1000
        // gid_number not provided
      };

      expect(() => createLdapEntry(user, baseDN)).toThrow('gid_number is required for user nogid');
    });


    test('should generate full name from first and last name', () => {
      const user = {
        username: 'jdoe',
        uid_number: 2000,
        gid_number: 2000,
        first_name: 'John',
        last_name: 'Doe'
      };

      const entry = createLdapEntry(user, baseDN);

      expect(entry.attributes.cn).toBe('John Doe');
      expect(entry.attributes.givenName).toBe('John');
      expect(entry.attributes.sn).toBe('Doe');
      expect(entry.attributes.gecos).toBe('John Doe');
    });

    test('should use first name only when last name is missing', () => {
      const user = {
        username: 'jane',
        uid_number: 2001,
        gid_number: 2001,
        first_name: 'Jane'
      };

      const entry = createLdapEntry(user, baseDN);

      expect(entry.attributes.cn).toBe('Jane');
      expect(entry.attributes.givenName).toBe('Jane');
      expect(entry.attributes.sn).toBeUndefined();
      expect(entry.attributes.gecos).toBe('Jane');
    });

    test('should use last name only when first name is missing', () => {
      const user = {
        username: 'smith',
        uid_number: 2002,
        gid_number: 2002,
        last_name: 'Smith'
      };

      const entry = createLdapEntry(user, baseDN);

      expect(entry.attributes.cn).toBe('Smith');
      expect(entry.attributes.givenName).toBeUndefined();
      expect(entry.attributes.sn).toBe('Smith');
      expect(entry.attributes.gecos).toBe('Smith');
    });
  });

  describe('createLdapGroupEntry', () => {

    test('should create valid LDAP group entry with members', () => {
      const group = {
        name: 'developers',
        gid_number: 1002,
        memberUids: ['alice', 'bob']
      };

      const entry = createLdapGroupEntry(group, baseDN);

      expect(entry).toBeDefined();
      expect(entry.dn).toBe('cn=developers,dc=example,dc=com');
      expect(entry.attributes).toBeDefined();
      expect(entry.attributes.objectClass).toEqual(['posixGroup']);
      expect(entry.attributes.cn).toBe('developers');
      expect(entry.attributes.gidNumber).toBe(1002);
      expect(entry.attributes.memberUid).toEqual(['alice', 'bob']);
    });

    test('should handle group with custom DN', () => {
      const group = {
        name: 'admins',
        dn: 'cn=admins,ou=groups,dc=custom,dc=org',
        gid_number: 1000,
        memberUids: ['admin']
      };

      const entry = createLdapGroupEntry(group, baseDN);

      expect(entry.dn).toBe('cn=admins,ou=groups,dc=custom,dc=org');
    });

    test('should handle group with custom objectClass', () => {
      const group = {
        name: 'special',
        gid_number: 2000,
        objectClass: ['posixGroup', 'groupOfNames']
      };

      const entry = createLdapGroupEntry(group, baseDN);

      expect(entry.attributes.objectClass).toEqual(['posixGroup', 'groupOfNames']);
    });

    test('should handle empty member list', () => {
      const group = {
        name: 'empty',
        gid_number: 3000,
        memberUids: []
      };

      const entry = createLdapGroupEntry(group, baseDN);

      expect(entry.attributes.memberUid).toBeUndefined();
    });

    test('should handle group with member DNs', () => {
      const group = {
        name: 'ldapgroup',
        gid_number: 4000,
        members: ['uid=user1,ou=users,dc=example,dc=com', 'uid=user2,ou=users,dc=example,dc=com']
      };

      const entry = createLdapGroupEntry(group, baseDN);

      expect(entry.attributes.member).toEqual([
        'uid=user1,ou=users,dc=example,dc=com',
        'uid=user2,ou=users,dc=example,dc=com'
      ]);
    });
  });

  describe('extractDomainFromBaseDn', () => {

    test('should extract domain from standard base DN', () => {
      const domain = extractDomainFromBaseDn('dc=example,dc=com');
      expect(domain).toBe('example.com');
    });

    test('should handle multi-level domains', () => {
      const domain = extractDomainFromBaseDn('dc=mail,dc=example,dc=com');
      expect(domain).toBe('mail.example.com');
    });

    test('should handle single-level domain', () => {
      const domain = extractDomainFromBaseDn('dc=localhost');
      expect(domain).toBe('localhost');
    });

    test('should handle base DN with OU components', () => {
      const domain = extractDomainFromBaseDn('ou=users,dc=company,dc=org');
      expect(domain).toBe('company.org');
    });

    test('should throw error for invalid base DN', () => {
      expect(() => extractDomainFromBaseDn('invalid-dn'))
        .toThrow('Invalid base DN');
    });

    test('should throw error for empty base DN', () => {
      expect(() => extractDomainFromBaseDn('')).toThrow('Invalid base DN');
    });

  });
});
