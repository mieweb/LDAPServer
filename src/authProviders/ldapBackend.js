const AuthProvider = require('./authProviderInterface');
const ldap = require('ldapjs');
const logger = require('../utils/logger');

class LDAPBackend extends AuthProvider {
  async authenticate(username, password, req) {
    return new Promise((resolve) => {
      const client = ldap.createClient({
        url: process.env.LDAP_URL,
        timeout: 5000,
        connectTimeout: 5000,
      });

      const userDN = `cn=${username},ou=users,dc=mieweb,dc=com`;

      client.bind(userDN, password, (err) => {
        client.unbind();
        if (err) {
          logger.error("LDAP bind failed", { username, error: err });
          resolve(false);
        } else {
          logger.info("LDAP bind success", { username });
          resolve(true);
        }
      });

      client.on("error", (err) => {
        logger.error("LDAP client error", { err });
        resolve(false);
      });
    });
  }
}

module.exports = LDAPBackend;
