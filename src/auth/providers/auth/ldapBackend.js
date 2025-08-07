const AuthProvider = require('./authProviderInterface');
const ldap = require('ldapjs');
const logger = require('../../../utils/logger');

class LDAPBackend extends AuthProvider {
  constructor(serverPool) {
    super();
    this.serverPool = serverPool || [];
    this.failedServers = new Map();

    // periodically reset failed servers so they can be retried
    setInterval(() => {
      this.failedServers.clear();
      logger.debug("Resetting failed LDAP servers for retry.");
    }, 5 * 60 * 1000);
  }

  async authenticate(username, password, req) {
    for (const server of this.serverPool) {
      if (this.failedServers.get(server.hostname)) continue;

      const url = `${server.scheme}//${server.hostname}:${server.port}`;
      logger.debug("Attempting LDAP authentication via server", { host: server.hostname });

      const success = await this.tryBind(url, username, password, server);

      if (success) return true;

      this.failedServers.set(server.hostname, Date.now());
    }

    this.failedServers.clear();
    return false;
  }

  async tryBind(url, username, password, server) {
    return new Promise((resolve) => {
      const client = ldap.createClient({ url, timeout: 5000, connectTimeout: 5000 });

      this.searchUserDN(client, username)
        .then((foundDN) => {
          if (!foundDN) {
            logger.warn("No DN found for user");
            client.unbind();
            return resolve(false);
          }

          logger.debug("User DN found, attempting user bind...");
          return this.attemptBind(client, foundDN, password);
        })
        .then((success) => {
          client.unbind();
          resolve(success);
        })
        .catch((err) => {
          logger.error("LDAP bind or search error", { error: err.message });
          client.unbind();
          resolve(false);
        });

      client.on("error", (err) => {
        logger.error("LDAP client connection error", { error: err.message });
        resolve(false);
      });
    });
  }

  async searchUserDN(client, username) {
    return new Promise((resolve, reject) => {
      const opts = {
        scope: 'sub',
        filter: `(sAMAccountName=${username})`,
        attributes: ['dn']
      };

      client.bind(process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD, (err) => {
        if (err) {
          logger.error("LDAP service bind failed", { error: err.message });
          return reject(new Error("Service bind failed"));
        }

        logger.debug("LDAP service bind successful");

        let foundDN = null;
        client.search('dc=mieweb,dc=com', opts, (err, res) => {
          if (err) return reject(err);

          res.on('searchEntry', (entry) => {
            foundDN = entry.dn.toString();
          });

          res.on('error', (err) => reject(err));
          res.on('end', () => resolve(foundDN));
        });
      });
    });
  }

  async attemptBind(client, dn, password) {
    return new Promise((resolve) => {
      client.bind(dn, password, (err) => {
        if (err) {
          logger.warn("LDAP user bind failed");
          return resolve(false);
        }

        logger.info("LDAP user bind succeeded");
        return resolve(true);
      });
    });
  }
}

module.exports = LDAPBackend;
