/**
 * Unit Tests for DirectoryProvider.js
 * 
 * Tests the base directory provider interface
 */

const DirectoryProvider = require('../../../src/DirectoryProvider');

describe('DirectoryProvider', () => {
  
  describe('Base class instantiation', () => {
    
    test('should be instantiable', () => {
      const provider = new DirectoryProvider();
      expect(provider).toBeInstanceOf(DirectoryProvider);
    });
    
    test('should have findUser method', () => {
      const provider = new DirectoryProvider();
      expect(typeof provider.findUser).toBe('function');
    });
    
    test('should have findGroups method', () => {
      const provider = new DirectoryProvider();
      expect(typeof provider.findGroups).toBe('function');
    });
    
    test('should have getAllUsers method', () => {
      const provider = new DirectoryProvider();
      expect(typeof provider.getAllUsers).toBe('function');
    });
    
    test('should have getAllGroups method', () => {
      const provider = new DirectoryProvider();
      expect(typeof provider.getAllGroups).toBe('function');
    });
    
    test('should have initialize method', () => {
      const provider = new DirectoryProvider();
      expect(typeof provider.initialize).toBe('function');
    });
    
    test('should have cleanup method', () => {
      const provider = new DirectoryProvider();
      expect(typeof provider.cleanup).toBe('function');
    });
  });
  
  describe('findUser()', () => {
    
    test('should throw "not implemented" error by default', async () => {
      const provider = new DirectoryProvider();
      
      await expect(
        provider.findUser('testuser')
      ).rejects.toThrow('findUser must be implemented');
    });
    
    test('should throw error with any username', async () => {
      const provider = new DirectoryProvider();
      
      await expect(
        provider.findUser('admin')
      ).rejects.toThrow('findUser must be implemented');
    });
  });
  
  describe('findGroups()', () => {
    
    test('should throw "not implemented" error by default', async () => {
      const provider = new DirectoryProvider();
      
      await expect(
        provider.findGroups('(cn=admins)')
      ).rejects.toThrow('findGroups must be implemented');
    });
  });
  
  describe('getAllUsers()', () => {
    
    test('should throw "not implemented" error by default', async () => {
      const provider = new DirectoryProvider();
      
      await expect(
        provider.getAllUsers()
      ).rejects.toThrow('getAllUsers must be implemented');
    });
  });
  
  describe('getAllGroups()', () => {
    
    test('should throw "not implemented" error by default', async () => {
      const provider = new DirectoryProvider();
      
      await expect(
        provider.getAllGroups()
      ).rejects.toThrow('getAllGroups must be implemented');
    });
  });
  
  describe('initialize()', () => {
    
    test('should be callable without throwing', async () => {
      const provider = new DirectoryProvider();
      
      await expect(provider.initialize()).resolves.toBeUndefined();
    });
    
    test('should be optional for providers', async () => {
      const provider = new DirectoryProvider();
      const result = await provider.initialize();
      
      expect(result).toBeUndefined();
    });
  });
  
  describe('cleanup()', () => {
    
    test('should be callable without throwing', async () => {
      const provider = new DirectoryProvider();
      
      await expect(provider.cleanup()).resolves.toBeUndefined();
    });
    
    test('should be optional for providers', async () => {
      const provider = new DirectoryProvider();
      const result = await provider.cleanup();
      
      expect(result).toBeUndefined();
    });
  });
  
  describe('Subclass implementation', () => {
    
    test('should allow subclasses to override findUser()', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        constructor() {
          super();
          this.users = [
            { username: 'admin', uid: 1000 },
            { username: 'user1', uid: 1001 }
          ];
        }
        
        async findUser(username) {
          return this.users.find(u => u.username === username) || null;
        }
      }
      
      const provider = new CustomDirectoryProvider();
      
      const user = await provider.findUser('admin');
      expect(user).toEqual({ username: 'admin', uid: 1000 });
      
      const notFound = await provider.findUser('unknown');
      expect(notFound).toBeNull();
    });
    
    test('should allow subclasses to override getAllUsers()', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        async getAllUsers() {
          return [
            { username: 'user1', uid: 1001 },
            { username: 'user2', uid: 1002 }
          ];
        }
      }
      
      const provider = new CustomDirectoryProvider();
      const users = await provider.getAllUsers();
      
      expect(users).toHaveLength(2);
      expect(users[0].username).toBe('user1');
      expect(users[1].username).toBe('user2');
    });
    
    test('should allow subclasses to override findGroups()', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        constructor() {
          super();
          this.groups = [
            { cn: 'admins', gidNumber: 1000, memberUids: ['admin'] },
            { cn: 'users', gidNumber: 1001, memberUids: ['user1', 'user2'] }
          ];
        }
        
        async findGroups(filter) {
          // Simple filter parsing for test
          if (filter.includes('cn=admins')) {
            return this.groups.filter(g => g.cn === 'admins');
          }
          return this.groups;
        }
      }
      
      const provider = new CustomDirectoryProvider();
      
      const adminsGroup = await provider.findGroups('(cn=admins)');
      expect(adminsGroup).toHaveLength(1);
      expect(adminsGroup[0].cn).toBe('admins');
      
      const allGroups = await provider.findGroups('(objectClass=posixGroup)');
      expect(allGroups).toHaveLength(2);
    });
    
    test('should allow subclasses to override getAllGroups()', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        async getAllGroups() {
          return [
            { cn: 'group1', gidNumber: 1001 },
            { cn: 'group2', gidNumber: 1002 }
          ];
        }
      }
      
      const provider = new CustomDirectoryProvider();
      const groups = await provider.getAllGroups();
      
      expect(groups).toHaveLength(2);
      expect(groups[0].cn).toBe('group1');
    });
    
    test('should allow subclasses to override initialize()', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        constructor() {
          super();
          this.connected = false;
          this.users = [];
        }
        
        async initialize() {
          this.connected = true;
          this.users = [{ username: 'admin', uid: 1000 }];
        }
        
        async findUser(username) {
          if (!this.connected) {
            throw new Error('Not initialized');
          }
          return this.users.find(u => u.username === username) || null;
        }
      }
      
      const provider = new CustomDirectoryProvider();
      
      // Should fail before initialization
      await expect(
        provider.findUser('admin')
      ).rejects.toThrow('Not initialized');
      
      // Initialize
      await provider.initialize();
      
      // Should work after initialization
      const user = await provider.findUser('admin');
      expect(user).toEqual({ username: 'admin', uid: 1000 });
    });
    
    test('should allow subclasses to override cleanup()', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        constructor() {
          super();
          this.connection = { active: true };
        }
        
        async cleanup() {
          this.connection.active = false;
        }
        
        async getAllUsers() {
          if (!this.connection.active) {
            throw new Error('Connection closed');
          }
          return [{ username: 'admin' }];
        }
      }
      
      const provider = new CustomDirectoryProvider();
      
      // Should work before cleanup
      const users = await provider.getAllUsers();
      expect(users).toHaveLength(1);
      
      // Cleanup
      await provider.cleanup();
      
      // Should fail after cleanup
      await expect(
        provider.getAllUsers()
      ).rejects.toThrow('Connection closed');
    });
  });
  
  describe('Error handling', () => {
    
    test('should allow subclasses to throw errors in findUser', async () => {
      class FailingDirectoryProvider extends DirectoryProvider {
        async findUser(username) {
          throw new Error('Database connection failed');
        }
      }
      
      const provider = new FailingDirectoryProvider();
      
      await expect(
        provider.findUser('admin')
      ).rejects.toThrow('Database connection failed');
    });
    
    test('should allow subclasses to throw errors in getAllUsers', async () => {
      class FailingDirectoryProvider extends DirectoryProvider {
        async getAllUsers() {
          throw new Error('Query timeout');
        }
      }
      
      const provider = new FailingDirectoryProvider();
      
      await expect(
        provider.getAllUsers()
      ).rejects.toThrow('Query timeout');
    });
    
    test('should handle async errors', async () => {
      class AsyncDirectoryProvider extends DirectoryProvider {
        async findUser(username) {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error('Async operation failed');
        }
      }
      
      const provider = new AsyncDirectoryProvider();
      
      await expect(
        provider.findUser('admin')
      ).rejects.toThrow('Async operation failed');
    });
  });
  
  describe('Return value validation', () => {
    
    test('findUser should return object or null', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        async findUser(username) {
          if (username === 'admin') {
            return { username: 'admin', uid: 1000 };
          }
          return null;
        }
      }
      
      const provider = new CustomDirectoryProvider();
      
      const found = await provider.findUser('admin');
      expect(found).toEqual({ username: 'admin', uid: 1000 });
      
      const notFound = await provider.findUser('unknown');
      expect(notFound).toBeNull();
    });
    
    test('getAllUsers should return array', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        async getAllUsers() {
          return [
            { username: 'user1' },
            { username: 'user2' }
          ];
        }
      }
      
      const provider = new CustomDirectoryProvider();
      const users = await provider.getAllUsers();
      
      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(2);
    });
    
    test('getAllUsers should allow empty array', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        async getAllUsers() {
          return [];
        }
      }
      
      const provider = new CustomDirectoryProvider();
      const users = await provider.getAllUsers();
      
      expect(Array.isArray(users)).toBe(true);
      expect(users).toHaveLength(0);
    });
    
    test('findGroups should return array', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        async findGroups(filter) {
          return [{ cn: 'admins', gidNumber: 1000 }];
        }
      }
      
      const provider = new CustomDirectoryProvider();
      const groups = await provider.findGroups('(cn=admins)');
      
      expect(Array.isArray(groups)).toBe(true);
      expect(groups).toHaveLength(1);
    });
    
    test('getAllGroups should return array', async () => {
      class CustomDirectoryProvider extends DirectoryProvider {
        async getAllGroups() {
          return [
            { cn: 'group1', gidNumber: 1001 },
            { cn: 'group2', gidNumber: 1002 }
          ];
        }
      }
      
      const provider = new CustomDirectoryProvider();
      const groups = await provider.getAllGroups();
      
      expect(Array.isArray(groups)).toBe(true);
      expect(groups).toHaveLength(2);
    });
  });
  
  describe('Complex scenarios', () => {
    
    test('should support full CRUD operations', async () => {
      class FullDirectoryProvider extends DirectoryProvider {
        constructor() {
          super();
          this.users = new Map([
            ['admin', { username: 'admin', uid: 1000, fullName: 'Administrator' }],
            ['user1', { username: 'user1', uid: 1001, fullName: 'User One' }]
          ]);
          this.groups = new Map([
            ['admins', { cn: 'admins', gidNumber: 1000, memberUids: ['admin'] }],
            ['users', { cn: 'users', gidNumber: 1001, memberUids: ['user1'] }]
          ]);
        }
        
        async findUser(username) {
          return this.users.get(username) || null;
        }
        
        async getAllUsers() {
          return Array.from(this.users.values());
        }
        
        async findGroups(filter) {
          // Simple CN filter parsing
          const cnMatch = filter.match(/cn=([^)]+)/);
          if (cnMatch) {
            const group = this.groups.get(cnMatch[1]);
            return group ? [group] : [];
          }
          return Array.from(this.groups.values());
        }
        
        async getAllGroups() {
          return Array.from(this.groups.values());
        }
      }
      
      const provider = new FullDirectoryProvider();
      
      // Test findUser
      const admin = await provider.findUser('admin');
      expect(admin.fullName).toBe('Administrator');
      
      // Test getAllUsers
      const allUsers = await provider.getAllUsers();
      expect(allUsers).toHaveLength(2);
      
      // Test findGroups
      const adminGroup = await provider.findGroups('(cn=admins)');
      expect(adminGroup).toHaveLength(1);
      expect(adminGroup[0].memberUids).toContain('admin');
      
      // Test getAllGroups
      const allGroups = await provider.getAllGroups();
      expect(allGroups).toHaveLength(2);
    });
  });
});
