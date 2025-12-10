/**
 * Unit Tests for errorUtils.js
 * 
 * Tests error normalization and LDAP error mapping
 */

const {
  normalizeAuthError,
  normalizeSearchError,
  normalizeServerError,
  createErrorResponse
} = require('../../../src/utils/errorUtils');

// Mock ldapjs errors
jest.mock('ldapjs', () => {
  class LdapError extends Error {
    constructor(message) {
      super(message);
      this.code = 1;
    }
  }
  
  return {
    UnavailableError: class extends LdapError {
      constructor(message) {
        super(message);
        this.name = 'UnavailableError';
        this.code = 52;
      }
    },
    TimeLimitExceededError: class extends LdapError {
      constructor(message) {
        super(message);
        this.name = 'TimeLimitExceededError';
        this.code = 3;
      }
    },
    InvalidCredentialsError: class extends LdapError {
      constructor(message) {
        super(message);
        this.name = 'InvalidCredentialsError';
        this.code = 49;
      }
    },
    InsufficientAccessRightsError: class extends LdapError {
      constructor(message) {
        super(message);
        this.name = 'InsufficientAccessRightsError';
        this.code = 50;
      }
    },
    NoSuchObjectError: class extends LdapError {
      constructor(message) {
        super(message);
        this.name = 'NoSuchObjectError';
        this.code = 32;
      }
    },
    OperationsError: class extends LdapError {
      constructor(message) {
        super(message);
        this.name = 'OperationsError';
        this.code = 1;
      }
    }
  };
});

describe('errorUtils', () => {
  
  describe('normalizeAuthError', () => {
    
    test('should normalize ECONNREFUSED to UnavailableError', () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      
      const normalized = normalizeAuthError(error);
      
      expect(normalized.name).toBe('UnavailableError');
      expect(normalized.message).toBe('Authentication service unavailable');
    });
    
    test('should normalize ENOTFOUND to UnavailableError', () => {
      const error = new Error('Host not found');
      error.code = 'ENOTFOUND';
      
      const normalized = normalizeAuthError(error);
      
      expect(normalized.name).toBe('UnavailableError');
      expect(normalized.message).toBe('Authentication service unavailable');
    });
    
    test('should normalize ETIMEDOUT to TimeLimitExceededError', () => {
      const error = new Error('Connection timeout');
      error.code = 'ETIMEDOUT';
      
      const normalized = normalizeAuthError(error);
      
      expect(normalized.name).toBe('TimeLimitExceededError');
      expect(normalized.message).toBe('Authentication timeout');
    });
    
    test('should normalize invalid credentials message', () => {
      const error = new Error('Invalid credentials provided');
      
      const normalized = normalizeAuthError(error);
      
      expect(normalized.name).toBe('InvalidCredentialsError');
      expect(normalized.message).toBe('Invalid credentials');
    });
    
    test('should normalize access denied message', () => {
      const error = new Error('Access denied to resource');
      
      const normalized = normalizeAuthError(error);
      
      expect(normalized.name).toBe('InsufficientAccessRightsError');
      expect(normalized.message).toBe('Access denied');
    });
    
    test('should default to OperationsError for unknown errors', () => {
      const error = new Error('Unknown authentication error');
      
      const normalized = normalizeAuthError(error);
      
      expect(normalized.name).toBe('OperationsError');
      expect(normalized.message).toBe('Authentication error');
    });
    
    test('should handle case-insensitive error messages', () => {
      const error = new Error('INVALID CREDENTIALS');
      
      const normalized = normalizeAuthError(error);
      
      expect(normalized.name).toBe('InvalidCredentialsError');
    });
  });
  
  describe('normalizeSearchError', () => {
    
    test('should normalize ECONNREFUSED to UnavailableError', () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      
      const normalized = normalizeSearchError(error);
      
      expect(normalized.name).toBe('UnavailableError');
      expect(normalized.message).toBe('Directory service unavailable');
    });
    
    test('should normalize ENOTFOUND to UnavailableError', () => {
      const error = new Error('Host not found');
      error.code = 'ENOTFOUND';
      
      const normalized = normalizeSearchError(error);
      
      expect(normalized.name).toBe('UnavailableError');
      expect(normalized.message).toBe('Directory service unavailable');
    });
    
    test('should normalize ETIMEDOUT to TimeLimitExceededError', () => {
      const error = new Error('Query timeout');
      error.code = 'ETIMEDOUT';
      
      const normalized = normalizeSearchError(error);
      
      expect(normalized.name).toBe('TimeLimitExceededError');
      expect(normalized.message).toBe('Directory search timeout');
    });
    
    test('should normalize not found message to NoSuchObjectError', () => {
      const error = new Error('User not found in directory');
      
      const normalized = normalizeSearchError(error);
      
      expect(normalized.name).toBe('NoSuchObjectError');
      expect(normalized.message).toBe('Object not found');
    });
    
    test('should normalize permission message to InsufficientAccessRightsError', () => {
      const error = new Error('Permission denied for search');
      
      const normalized = normalizeSearchError(error);
      
      expect(normalized.name).toBe('InsufficientAccessRightsError');
      expect(normalized.message).toBe('Insufficient access rights');
    });
    
    test('should default to OperationsError for unknown errors', () => {
      const error = new Error('Unknown directory error');
      
      const normalized = normalizeSearchError(error);
      
      expect(normalized.name).toBe('OperationsError');
      expect(normalized.message).toBe('Directory search error');
    });
  });
  
  describe('normalizeServerError', () => {
    
    test('should normalize EADDRINUSE with port information', () => {
      const error = new Error('Address already in use');
      error.code = 'EADDRINUSE';
      error.port = 389;
      
      const normalized = normalizeServerError(error);
      
      expect(normalized.name).toBe('UnavailableError');
      expect(normalized.message).toBe('Port 389 is already in use');
    });
    
    test('should normalize EACCES with port information', () => {
      const error = new Error('Permission denied');
      error.code = 'EACCES';
      error.port = 636;
      
      const normalized = normalizeServerError(error);
      
      expect(normalized.name).toBe('InsufficientAccessRightsError');
      expect(normalized.message).toBe('Permission denied to bind to port 636');
    });
    
    test('should normalize ENOENT for missing files', () => {
      const error = new Error('File not found');
      error.code = 'ENOENT';
      
      const normalized = normalizeServerError(error);
      
      expect(normalized.name).toBe('UnavailableError');
      expect(normalized.message).toBe('Required files not found');
    });
    
    test('should default to OperationsError for unknown server errors', () => {
      const error = new Error('Unknown server error');
      
      const normalized = normalizeServerError(error);
      
      expect(normalized.name).toBe('OperationsError');
      expect(normalized.message).toBe('Server startup error');
    });
  });
  
  describe('createErrorResponse', () => {
    
    test('should create error response with all fields', () => {
      const error = new Error('Test error');
      error.code = 49;
      error.name = 'InvalidCredentialsError';
      
      const context = { username: 'testuser', backend: 'sql' };
      const response = createErrorResponse(error, context);
      
      expect(response).toBeDefined();
      expect(response.code).toBe(49);
      expect(response.name).toBe('InvalidCredentialsError');
      expect(response.message).toBe('Test error');
      expect(response.context).toEqual(context);
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp)).toBeInstanceOf(Date);
    });
    
    test('should handle error with missing fields', () => {
      const error = new Error(); // Plain Error has name "Error"
      
      const response = createErrorResponse(error);
      
      expect(response.code).toBe(1); // Default operations error
      expect(response.name).toBe('Error'); // Uses actual error.name
      expect(response.message).toBe('An error occurred');
      expect(response.context).toEqual({});
    });
    
    test('should handle empty context', () => {
      const error = new Error('Test');
      
      const response = createErrorResponse(error);
      
      expect(response.context).toEqual({});
    });
    
    test('should include ISO timestamp', () => {
      const error = new Error('Test');
      const before = new Date().toISOString();
      
      const response = createErrorResponse(error);
      
      const after = new Date().toISOString();
      
      expect(response.timestamp).toBeDefined();
      expect(response.timestamp >= before).toBe(true);
      expect(response.timestamp <= after).toBe(true);
    });
    
    test('should preserve custom error codes', () => {
      const error = new Error('Custom error');
      error.code = 99;
      error.name = 'CustomError';
      
      const response = createErrorResponse(error);
      
      expect(response.code).toBe(99);
      expect(response.name).toBe('CustomError');
    });
    
    test('should handle complex context objects', () => {
      const error = new Error('Test');
      const context = {
        user: { username: 'test', uid: 1001 },
        request: { filter: '(uid=test)', scope: 'sub' },
        backend: 'mongodb'
      };
      
      const response = createErrorResponse(error, context);
      
      expect(response.context).toEqual(context);
      expect(response.context.user.username).toBe('test');
    });
  });
});
