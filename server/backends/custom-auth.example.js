/**
 * Example: API-Based Authentication Backend
 * 
 * This example shows how to create a custom authentication backend
 * that validates credentials against an external REST API.
 * 
 * Setup:
 * 1. Rename this file (remove .example.js, e.g., api-auth.js)
 * 2. Set AUTH_BACKEND=api-auth in your .env file
 * 3. Configure API_AUTH_URL and API_AUTH_TOKEN environment variables
 * 4. Restart the server
 */

const { AuthProvider } = require('@ldap-gateway/core');
const https = require('https');
const http = require('http');

class ApiAuthBackend extends AuthProvider {
  constructor(options = {}) {
    super();
    
    // Load configuration from environment
    this.apiUrl = process.env.API_AUTH_URL || 'https://api.example.com/auth';
    this.apiToken = process.env.API_AUTH_TOKEN;
    this.timeout = parseInt(process.env.API_AUTH_TIMEOUT || '5000', 10);
    
    if (!this.apiUrl) {
      console.warn('[ApiAuthBackend] No API_AUTH_URL configured');
    }
  }

  /**
   * Make HTTP request to authentication API
   * @private
   */
  async makeRequest(username, password) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.apiUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const postData = JSON.stringify({
        username,
        password
      });
      
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: this.timeout
      };
      
      // Add authorization header if token is configured
      if (this.apiToken) {
        options.headers['Authorization'] = `Bearer ${this.apiToken}`;
      }
      
      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            resolve({
              statusCode: res.statusCode,
              data: result
            });
          } catch (err) {
            resolve({
              statusCode: res.statusCode,
              data: { authenticated: res.statusCode === 200 }
            });
          }
        });
      });
      
      req.on('error', (err) => {
        reject(err);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(postData);
      req.end();
    });
  }

  /**
   * Authenticate a user against the API
   * @param {string} username - Username to authenticate
   * @param {string} password - Password to verify
   * @param {Object} req - LDAP request object
   * @returns {Promise<boolean>} True if authenticated
   */
  async authenticate(username, password, req) {
    try {
      // Basic validation
      if (!username || !password) {
        console.log('[ApiAuthBackend] Missing username or password');
        return false;
      }
      
      if (!this.apiUrl) {
        console.error('[ApiAuthBackend] API URL not configured');
        return false;
      }
      
      // Make API request
      console.log(`[ApiAuthBackend] Authenticating user: ${username}`);
      const response = await this.makeRequest(username, password);
      
      // Check response
      if (response.statusCode === 200) {
        // API can return { authenticated: true/false } or just 200 OK
        const isAuthenticated = response.data.authenticated !== false;
        console.log(`[ApiAuthBackend] User ${username} authentication: ${isAuthenticated}`);
        return isAuthenticated;
      } else if (response.statusCode === 401 || response.statusCode === 403) {
        console.log(`[ApiAuthBackend] User ${username} authentication failed (${response.statusCode})`);
        return false;
      } else {
        console.error(`[ApiAuthBackend] Unexpected response: ${response.statusCode}`);
        return false;
      }
    } catch (error) {
      console.error('[ApiAuthBackend] Authentication error:', error.message);
      return false;
    }
  }
}

// Export the backend
module.exports = {
  name: 'api-auth',
  type: 'auth',
  provider: ApiAuthBackend
};
