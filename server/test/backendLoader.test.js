/**
 * Backend Loader Tests
 * 
 * Tests for dynamic backend loading functionality
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ProviderFactory } = require('../providers');

describe('Backend Loader', function() {
  let testBackendDir;
  
  before(function() {
    // Create temporary directory for test backends
    testBackendDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldap-backend-test-'));
  });
  
  after(function() {
    // Clean up test directory
    if (fs.existsSync(testBackendDir)) {
      fs.rmSync(testBackendDir, { recursive: true, force: true });
    }
  });
  
  describe('Valid Backend Loading', function() {
    it('should load a valid auth backend', function() {
      // Create a test auth backend
      const backendCode = `
        const { AuthProvider } = require('@ldap-gateway/core');
        
        class TestAuthBackend extends AuthProvider {
          async authenticate(username, password) {
            return username === 'test' && password === 'pass';
          }
        }
        
        module.exports = {
          name: 'test-auth',
          type: 'auth',
          provider: TestAuthBackend
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'test-auth.js'), backendCode);
      
      // Initialize with test directory
      ProviderFactory.initialize(testBackendDir);
      
      // Check if backend is available
      const backends = ProviderFactory.listAvailableBackends();
      assert(backends.auth.includes('test-auth'), 'test-auth should be in available backends');
      
      // Try to create instance
      const authProvider = ProviderFactory.createAuthProvider('test-auth');
      assert(authProvider, 'Should create auth provider instance');
      assert(typeof authProvider.authenticate === 'function', 'Should have authenticate method');
    });
    
    it('should load a valid directory backend', function() {
      // Create a test directory backend
      const backendCode = `
        const { DirectoryProvider } = require('@ldap-gateway/core');
        
        class TestDirectoryBackend extends DirectoryProvider {
          async findUser(username) {
            return username === 'test' ? { uid: 'test', cn: 'Test User' } : null;
          }
          async getAllUsers() { return []; }
          async findGroups(filter) { return []; }
          async getAllGroups() { return []; }
        }
        
        module.exports = {
          name: 'test-directory',
          type: 'directory',
          provider: TestDirectoryBackend
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'test-directory.js'), backendCode);
      
      // Reload backends
      ProviderFactory.reloadBackends();
      
      // Check if backend is available
      const backends = ProviderFactory.listAvailableBackends();
      assert(backends.directory.includes('test-directory'), 'test-directory should be in available backends');
      
      // Try to create instance
      const dirProvider = ProviderFactory.createDirectoryProvider('test-directory');
      assert(dirProvider, 'Should create directory provider instance');
      assert(typeof dirProvider.findUser === 'function', 'Should have findUser method');
    });
  });
  
  describe('Invalid Backend Handling', function() {
    it('should skip backends with missing name', function() {
      const backendCode = `
        const { AuthProvider } = require('@ldap-gateway/core');
        
        class InvalidBackend extends AuthProvider {
          async authenticate() { return false; }
        }
        
        module.exports = {
          type: 'auth',
          provider: InvalidBackend
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'invalid-no-name.js'), backendCode);
      ProviderFactory.reloadBackends();
      
      // Should not throw, just skip the invalid backend
      const backends = ProviderFactory.listAvailableBackends();
      assert(!backends.auth.includes('invalid-no-name'), 'Invalid backend should not be loaded');
    });
    
    it('should skip backends with invalid type', function() {
      const backendCode = `
        module.exports = {
          name: 'invalid-type',
          type: 'invalid',
          provider: class {}
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'invalid-type.js'), backendCode);
      ProviderFactory.reloadBackends();
      
      const backends = ProviderFactory.listAvailableBackends();
      assert(!backends.auth.includes('invalid-type'), 'Invalid type backend should not be loaded');
    });
    
    it('should skip auth backends without authenticate method', function() {
      const backendCode = `
        const { AuthProvider } = require('@ldap-gateway/core');
        
        class NoAuthMethod extends AuthProvider {
          // Missing authenticate method
        }
        
        module.exports = {
          name: 'no-auth-method',
          type: 'auth',
          provider: NoAuthMethod
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'no-auth-method.js'), backendCode);
      ProviderFactory.reloadBackends();
      
      const backends = ProviderFactory.listAvailableBackends();
      assert(!backends.auth.includes('no-auth-method'), 'Backend without authenticate should not be loaded');
    });
    
    it('should skip directory backends without required methods', function() {
      const backendCode = `
        const { DirectoryProvider } = require('@ldap-gateway/core');
        
        class IncompleteDirectory extends DirectoryProvider {
          async findUser() { return null; }
          // Missing other required methods
        }
        
        module.exports = {
          name: 'incomplete-directory',
          type: 'directory',
          provider: IncompleteDirectory
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'incomplete-directory.js'), backendCode);
      ProviderFactory.reloadBackends();
      
      const backends = ProviderFactory.listAvailableBackends();
      assert(!backends.directory.includes('incomplete-directory'), 'Incomplete directory should not be loaded');
    });
  });
  
  describe('File Filtering', function() {
    it('should skip example files', function() {
      const backendCode = `
        const { AuthProvider } = require('@ldap-gateway/core');
        
        class ExampleBackend extends AuthProvider {
          async authenticate() { return true; }
        }
        
        module.exports = {
          name: 'example-backend',
          type: 'auth',
          provider: ExampleBackend
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'example.example.js'), backendCode);
      ProviderFactory.reloadBackends();
      
      const backends = ProviderFactory.listAvailableBackends();
      assert(!backends.auth.includes('example-backend'), 'Example files should be skipped');
    });
    
    it('should skip template.js', function() {
      const backendCode = `
        const { AuthProvider } = require('@ldap-gateway/core');
        
        class TemplateBackend extends AuthProvider {
          async authenticate() { return true; }
        }
        
        module.exports = {
          name: 'template-backend',
          type: 'auth',
          provider: TemplateBackend
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'template.js'), backendCode);
      ProviderFactory.reloadBackends();
      
      const backends = ProviderFactory.listAvailableBackends();
      assert(!backends.auth.includes('template-backend'), 'template.js should be skipped');
    });
  });
  
  describe('Fallback to Compiled Backends', function() {
    it('should fall back to compiled db auth backend', function() {
      const authProvider = ProviderFactory.createAuthProvider('db', {
        databaseService: {} // Mock service
      });
      
      assert(authProvider, 'Should create compiled db auth provider');
    });
    
    it('should fall back to compiled ldap auth backend', function() {
      const authProvider = ProviderFactory.createAuthProvider('ldap', {
        ldapServerPool: []
      });
      
      assert(authProvider, 'Should create compiled ldap auth provider');
    });
    
    it('should throw error for unknown backend', function() {
      assert.throws(() => {
        ProviderFactory.createAuthProvider('nonexistent-backend');
      }, /Unknown auth provider type/, 'Should throw for unknown backend');
    });
  });
  
  describe('Options Passing', function() {
    it('should pass options to dynamic backend constructor', function(done) {
      const backendCode = `
        const { AuthProvider } = require('@ldap-gateway/core');
        
        class OptionsTestBackend extends AuthProvider {
          constructor(options) {
            super();
            this.testOption = options.testOption;
          }
          async authenticate() { return this.testOption === 'test-value'; }
        }
        
        module.exports = {
          name: 'options-test',
          type: 'auth',
          provider: OptionsTestBackend
        };
      `;
      
      fs.writeFileSync(path.join(testBackendDir, 'options-test.js'), backendCode);
      ProviderFactory.reloadBackends();
      
      const authProvider = ProviderFactory.createAuthProvider('options-test', {
        testOption: 'test-value'
      });
      
      authProvider.authenticate().then(result => {
        assert.strictEqual(result, true, 'Options should be passed to backend');
        done();
      }).catch(done);
    });
  });
});
