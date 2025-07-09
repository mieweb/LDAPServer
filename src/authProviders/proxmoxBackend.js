const AuthProvider = require('./authProviderInterface');
const fs = require('fs');
const unixcrypt = require('unixcrypt');

class ProxmoxBackend extends AuthProvider {
  constructor(shadowPath) {
    super();
    this.shadowPath = shadowPath;
  }

async authenticate(username, password) {
    console.log("Authenticate from proxmox", username);
    try {
      const shadow = fs.readFileSync(this.shadowPath, 'utf8');
      console.log("shadow file loaded");

      const lines = shadow.split('\n');
      for (const line of lines) {
        if (!line) continue;
        const [fileUser, hash] = line.split(':');
        console.log("fileuser", fileUser);

        if (fileUser === username) {
          console.log("Found user line, verifying...");
          const isValid = unixcrypt.verify(password, hash);
          console.log("verification result:", isValid);
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
