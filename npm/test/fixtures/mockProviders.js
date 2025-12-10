/**
 * Mock Providers for Testing
 * 
 * Reusable mock implementations of AuthProvider and DirectoryProvider
 * Used by LdapEngine tests and future integration tests
 */

const AuthProvider = require('../../src/AuthProvider');
const DirectoryProvider = require('../../src/DirectoryProvider');
const { testUsers, testGroups } = require('./testData');

/**
 * Mock Authentication Provider
 * Simple implementation for testing auth flows
 */
class MockAuthProvider extends AuthProvider {
  constructor(options = {}) {
    super();
    this.name = options.name || 'mock-auth';
    this.shouldSucceed = options.shouldSucceed !== undefined ? options.shouldSucceed : true;
    this.delay = options.delay || 0;
    this.callCount = 0;
    this.lastUsername = null;
    this.lastPassword = null;
    this.validCredentials = options.validCredentials || new Map([
      ['testuser', 'password123'],
      ['admin', 'admin123'],
      ['jdoe', 'test123']
    ]);
  }

  async authenticate(username, password, req) {
    this.callCount++;
    this.lastUsername = username;
    this.lastPassword = password;

    // Simulate delay if specified
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    // If configured to always fail
    if (!this.shouldSucceed) {
      throw new Error('Authentication failed');
    }

    // Check credentials
    const expectedPassword = this.validCredentials.get(username);
    if (expectedPassword === password) {
      return { success: true, username };
    }

    // Invalid credentials
    throw new Error('Invalid credentials');
  }

  reset() {
    this.callCount = 0;
    this.lastUsername = null;
    this.lastPassword = null;
  }
}

/**
 * Mock Directory Provider
 * Simple implementation for testing directory lookups
 */
class MockDirectoryProvider extends DirectoryProvider {
  constructor(options = {}) {
    super();
    this.name = options.name || 'mock-directory';
    this.users = options.users || testUsers.map(u => ({ ...u }));
    this.groups = options.groups || testGroups.map(g => ({ ...g }));
    this.shouldFail = options.shouldFail || false;
    this.delay = options.delay || 0;
    this.callCounts = {
      findUser: 0,
      getAllUsers: 0,
      findGroups: 0,
      getAllGroups: 0
    };
  }

  async findUser(username) {
    this.callCounts.findUser++;

    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    if (this.shouldFail) {
      throw new Error('Directory service unavailable');
    }

    return this.users.find(u => u.username === username) || null;
  }

  async getAllUsers() {
    this.callCounts.getAllUsers++;

    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    if (this.shouldFail) {
      throw new Error('Directory service unavailable');
    }

    return [...this.users];
  }

  async findGroups(filter) {
    this.callCounts.findGroups++;

    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    if (this.shouldFail) {
      throw new Error('Directory service unavailable');
    }

    // Simple filter parsing
    const cnMatch = filter.match(/cn=([^)]+)/);
    if (cnMatch && cnMatch[1] !== '*') {
      const groupName = cnMatch[1];
      const group = this.groups.find(g => g.cn === groupName);
      return group ? [group] : [];
    }

    const memberUidMatch = filter.match(/memberUid=([^)]+)/);
    if (memberUidMatch) {
      const username = memberUidMatch[1];
      return this.groups.filter(g => g.memberUids && g.memberUids.includes(username));
    }

    // Return all groups for wildcard or objectClass filters
    return [...this.groups];
  }

  async getAllGroups() {
    this.callCounts.getAllGroups++;

    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    if (this.shouldFail) {
      throw new Error('Directory service unavailable');
    }

    return [...this.groups];
  }

  reset() {
    this.callCounts = {
      findUser: 0,
      getAllUsers: 0,
      findGroups: 0,
      getAllGroups: 0
    };
  }
}

/**
 * Mock Notification Auth Provider (for MFA testing)
 * Always succeeds if notification succeeds, regardless of password
 */
class MockNotificationAuthProvider extends AuthProvider {
  constructor(options = {}) {
    super();
    this.name = 'mock-notification';
    this.notificationShouldSucceed = options.notificationShouldSucceed !== undefined 
      ? options.notificationShouldSucceed 
      : true;
    this.callCount = 0;
  }

  async authenticate(username, password, req) {
    this.callCount++;

    // Simulate notification/push server response
    if (this.notificationShouldSucceed) {
      return { success: true, username, method: 'notification' };
    }

    throw new Error('Notification not approved');
  }
}

module.exports = {
  MockAuthProvider,
  MockDirectoryProvider,
  MockNotificationAuthProvider
};
