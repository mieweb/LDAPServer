const AuthProvider = require('./authProviderInterface');
const fs = require('fs');
const unixcrypt = require('unixcrypt');
const logger = require('../../../utils/logger');

class ProxmoxBackend extends AuthProvider {
  constructor(shadowPath) {
    super();
    this.shadowPath = shadowPath;
  }

async authenticate(username, password) {
    try {
      const shadow = fs.readFileSync(this.shadowPath, 'utf8');

      const lines = shadow.split('\n');
      for (const line of lines) {
        if (!line) continue;
        const [fileUser, hash] = line.split(':');

        if (fileUser === username) {
          logger.debug("Found user line, verifying...");
          const isValid = unixcrypt.verify(password, hash);
          logger.debug("verification result:", isValid);
          return isValid;
        }
      }
      return false;
    } catch (err) {
      console.error('Error reading shadow file:', err);
      return false;
    }
  }
}

module.exports = ProxmoxBackend;
