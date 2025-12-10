/**
 * Unit Tests for AuthProvider.js
 * 
 * Tests the base authentication provider interface
 */

const AuthProvider = require('../../../src/AuthProvider');

describe('AuthProvider', () => {
  
  describe('Base class instantiation', () => {
    
    test('should be instantiable', () => {
      const provider = new AuthProvider();
      expect(provider).toBeInstanceOf(AuthProvider);
    });
    
    test('should have authenticate method', () => {
      const provider = new AuthProvider();
      expect(typeof provider.authenticate).toBe('function');
    });
    
    test('should have initialize method', () => {
      const provider = new AuthProvider();
      expect(typeof provider.initialize).toBe('function');
    });
    
    test('should have cleanup method', () => {
      const provider = new AuthProvider();
      expect(typeof provider.cleanup).toBe('function');
    });
  });
  
  describe('authenticate()', () => {
    
    test('should throw "not implemented" error by default', async () => {
      const provider = new AuthProvider();
      
      await expect(
        provider.authenticate('testuser', 'password', {})
      ).rejects.toThrow('authenticate must be implemented');
    });
    
    test('should throw error with any username/password', async () => {
      const provider = new AuthProvider();
      
      await expect(
        provider.authenticate('admin', 'admin123', {})
      ).rejects.toThrow('authenticate must be implemented');
    });
  });
  
  describe('initialize()', () => {
    
    test('should be callable without throwing', async () => {
      const provider = new AuthProvider();
      
      await expect(provider.initialize()).resolves.toBeUndefined();
    });
    
    test('should be optional for providers', async () => {
      const provider = new AuthProvider();
      const result = await provider.initialize();
      
      expect(result).toBeUndefined();
    });
  });
  
  describe('cleanup()', () => {
    
    test('should be callable without throwing', async () => {
      const provider = new AuthProvider();
      
      await expect(provider.cleanup()).resolves.toBeUndefined();
    });
    
    test('should be optional for providers', async () => {
      const provider = new AuthProvider();
      const result = await provider.cleanup();
      
      expect(result).toBeUndefined();
    });
  });
  
  describe('Subclass implementation', () => {
    
    test('should allow subclasses to override authenticate()', async () => {
      class CustomAuthProvider extends AuthProvider {
        async authenticate(username, password, req) {
          return username === 'admin' && password === 'secret';
        }
      }
      
      const provider = new CustomAuthProvider();
      const result = await provider.authenticate('admin', 'secret', {});
      
      expect(result).toBe(true);
    });
    
    test('should allow subclasses to implement custom logic', async () => {
      class CustomAuthProvider extends AuthProvider {
        constructor() {
          super();
          this.validUsers = new Map([
            ['user1', 'pass1'],
            ['user2', 'pass2']
          ]);
        }
        
        async authenticate(username, password, req) {
          const expectedPass = this.validUsers.get(username);
          return expectedPass === password;
        }
      }
      
      const provider = new CustomAuthProvider();
      
      expect(await provider.authenticate('user1', 'pass1', {})).toBe(true);
      expect(await provider.authenticate('user1', 'wrong', {})).toBe(false);
      expect(await provider.authenticate('user2', 'pass2', {})).toBe(true);
      expect(await provider.authenticate('unknown', 'pass', {})).toBe(false);
    });
    
    test('should allow subclasses to override initialize()', async () => {
      class CustomAuthProvider extends AuthProvider {
        constructor() {
          super();
          this.initialized = false;
        }
        
        async initialize() {
          this.initialized = true;
        }
        
        async authenticate(username, password, req) {
          if (!this.initialized) {
            throw new Error('Provider not initialized');
          }
          return true;
        }
      }
      
      const provider = new CustomAuthProvider();
      
      // Should fail before initialization
      await expect(
        provider.authenticate('user', 'pass', {})
      ).rejects.toThrow('Provider not initialized');
      
      // Should work after initialization
      await provider.initialize();
      expect(await provider.authenticate('user', 'pass', {})).toBe(true);
    });
    
    test('should allow subclasses to override cleanup()', async () => {
      class CustomAuthProvider extends AuthProvider {
        constructor() {
          super();
          this.connection = { active: true };
        }
        
        async cleanup() {
          this.connection.active = false;
        }
        
        async authenticate(username, password, req) {
          if (!this.connection.active) {
            throw new Error('Connection closed');
          }
          return true;
        }
      }
      
      const provider = new CustomAuthProvider();
      
      // Should work before cleanup
      expect(await provider.authenticate('user', 'pass', {})).toBe(true);
      
      // Cleanup
      await provider.cleanup();
      
      // Should fail after cleanup
      await expect(
        provider.authenticate('user', 'pass', {})
      ).rejects.toThrow('Connection closed');
    });
    
    test('should pass request context to authenticate()', async () => {
      class CustomAuthProvider extends AuthProvider {
        async authenticate(username, password, req) {
          // Can use request context for logging, IP checks, etc.
          if (req.ip === '127.0.0.1') {
            return username === 'admin' && password === 'local';
          }
          return username === 'admin' && password === 'remote';
        }
      }
      
      const provider = new CustomAuthProvider();
      
      expect(await provider.authenticate('admin', 'local', { ip: '127.0.0.1' })).toBe(true);
      expect(await provider.authenticate('admin', 'remote', { ip: '192.168.1.1' })).toBe(true);
      expect(await provider.authenticate('admin', 'local', { ip: '192.168.1.1' })).toBe(false);
    });
  });
  
  describe('Error handling', () => {
    
    test('should allow subclasses to throw errors', async () => {
      class FailingAuthProvider extends AuthProvider {
        async authenticate(username, password, req) {
          throw new Error('Database connection failed');
        }
      }
      
      const provider = new FailingAuthProvider();
      
      await expect(
        provider.authenticate('user', 'pass', {})
      ).rejects.toThrow('Database connection failed');
    });
    
    test('should allow subclasses to throw custom error types', async () => {
      class CustomError extends Error {
        constructor(message, code) {
          super(message);
          this.code = code;
          this.name = 'CustomError';
        }
      }
      
      class CustomAuthProvider extends AuthProvider {
        async authenticate(username, password, req) {
          throw new CustomError('Auth service unavailable', 'ECONNREFUSED');
        }
      }
      
      const provider = new CustomAuthProvider();
      
      try {
        await provider.authenticate('user', 'pass', {});
        fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(CustomError);
        expect(error.code).toBe('ECONNREFUSED');
      }
    });
    
    test('should handle async errors in authenticate', async () => {
      class AsyncAuthProvider extends AuthProvider {
        async authenticate(username, password, req) {
          // Simulate async operation that fails
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error('Async auth failed');
        }
      }
      
      const provider = new AsyncAuthProvider();
      
      await expect(
        provider.authenticate('user', 'pass', {})
      ).rejects.toThrow('Async auth failed');
    });
  });
  
  describe('Return value validation', () => {
    
    test('should allow boolean return values', async () => {
      class BooleanAuthProvider extends AuthProvider {
        async authenticate(username, password, req) {
          return username === 'valid';
        }
      }
      
      const provider = new BooleanAuthProvider();
      
      expect(await provider.authenticate('valid', 'pass', {})).toBe(true);
      expect(await provider.authenticate('invalid', 'pass', {})).toBe(false);
    });
    
    test('should allow object return values', async () => {
      class ObjectAuthProvider extends AuthProvider {
        async authenticate(username, password, req) {
          if (username === 'admin' && password === 'secret') {
            return { success: true, username, roles: ['admin'] };
          }
          return { success: false };
        }
      }
      
      const provider = new ObjectAuthProvider();
      
      const success = await provider.authenticate('admin', 'secret', {});
      expect(success).toEqual({ success: true, username: 'admin', roles: ['admin'] });
      
      const failure = await provider.authenticate('user', 'wrong', {});
      expect(failure).toEqual({ success: false });
    });
  });
});
