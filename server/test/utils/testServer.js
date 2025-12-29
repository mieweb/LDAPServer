// Test Server Utility
// 
// Helper to start/stop LDAP server with test configuration
// Manages server lifecycle for integration tests

const { LdapEngine } = require('@ldap-gateway/core');

class TestServer {
  constructor(options = {}) {
    this.port = options.port || 3890;
    this.baseDn = options.baseDn || 'dc=example,dc=com';
    this.authProviders = options.authProviders || [];
    this.directoryProvider = options.directoryProvider;
    this.requireAuthForSearch = options.requireAuthForSearch !== false;
    this.certificate = options.certificate || null;
    this.key = options.key || null;
    this.tlsMinVersion = options.tlsMinVersion || null;
    this.tlsCiphers = options.tlsCiphers || null;
    this.logger = options.logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    };
    
    this.engine = null;
    this.events = [];
  }

  // Start the LDAP server
  async start() {
    if (this.engine) {
      throw new Error('Server already started');
    }

    this.engine = new LdapEngine({
      port: this.port,
      baseDn: this.baseDn,
      bindIp: '127.0.0.1', // Bind to localhost for tests
      authProviders: this.authProviders,
      directoryProvider: this.directoryProvider,
      requireAuthForSearch: this.requireAuthForSearch,
      certificate: this.certificate,
      key: this.key,
      tlsMinVersion: this.tlsMinVersion,
      tlsCiphers: this.tlsCiphers,
      logger: this.logger
    });

    // Capture events for testing
    this.engine.on('started', (data) => this.events.push({ type: 'started', data }));
    this.engine.on('stopped', (data) => this.events.push({ type: 'stopped', data }));
    this.engine.on('bindRequest', (data) => this.events.push({ type: 'bindRequest', data }));
    this.engine.on('bindSuccess', (data) => this.events.push({ type: 'bindSuccess', data }));
    this.engine.on('bindFail', (data) => this.events.push({ type: 'bindFail', data }));
    this.engine.on('searchRequest', (data) => this.events.push({ type: 'searchRequest', data }));
    this.engine.on('searchResponse', (data) => this.events.push({ type: 'searchResponse', data }));

    await this.engine.start();
    
    // Give server a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Stop the LDAP server
  async stop() {
    if (!this.engine) {
      return;
    }

    await this.engine.stop();
    this.engine = null;
    
    // Give server a moment to fully close
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Get server URL
  getUrl() {
    const protocol = this.certificate ? 'ldaps' : 'ldap';
    return `${protocol}://127.0.0.1:${this.port}`;
  }

  // Get captured events
  getEvents(type = null) {
    if (type) {
      return this.events.filter(e => e.type === type);
    }
    return this.events;
  }

  // Clear captured events
  clearEvents() {
    this.events = [];
  }

  // Check if server is running
  isRunning() {
    return this.engine !== null;
  }
}

module.exports = TestServer;
