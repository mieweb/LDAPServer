const AuthProvider = require('./authProviderInterface');
const ldap = require('ldapjs');
const logger = require('../utils/logger');

class LDAPBackend extends AuthProvider {
  constructor(serverPool) {
    super();
    this.serverPool = serverPool || [];
    this.failedServers = new Map();

    // periodically reset failed servers so they can be retried
    setInterval(() => {
      this.failedServers.clear();
      logger.debug("Resetting failed LDAP servers for retry.");
    }, 5 * 60 * 1000); // every 5 minutes
  }

  async authenticate(username, password, req) {
    for (const server of this.serverPool) {
      if (this.failedServers.get(server.ip)) {
        continue;
      }

      const url = `${server.scheme}//${server.ip}:${server.port}`;
  
      logger.debug(`Trying LDAP server: ${url} for user: ${username}`);

      const success = await this.tryBind(url, username, password, server);

      if (success) {
        return true;
      } else {
        this.failedServers.set(server.ip, Date.now());
      }
    }

    // if all tried and failed, clear the failed list for next time
    this.failedServers.clear();
    return false;
  }

  async tryBind(url, username, password, server) {
    return new Promise((resolve) => {
      const client = ldap.createClient({ url, timeout: 5000, connectTimeout: 5000 });

      this.searchUserDN(client, username)
        .then((foundDN) => {
          if (!foundDN) {
            logger.error("No DN found for user", { username });
            client.unbind();
            return resolve(false);
          }
          logger.debug(`Found user DN: ${foundDN}, attempting bind with user password...`);
          return this.attemptBind(client, foundDN, password);
        })
        .then((success) => {
          client.unbind();
          resolve(success);
        })
        .catch((err) => {
          logger.error("LDAP bind or search error", { url, username, err });
          client.unbind();
          resolve(false);
        });

      client.on("error", (err) => {
        logger.error("LDAP client connection error", { url, err });
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

      // FIRST bind with your service account so we can search
      client.bind(process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD, (err) => {
        if (err) {
          logger.error("Service bind failed", err);
          return reject(new Error("Service bind failed: " + err));
        }
       logger.debug("Service bind successful, searching for user...");

        let foundDN = null;
        client.search('dc=mieweb,dc=com', opts, (err, res) => {
          if (err) return reject(err);

          res.on('searchEntry', (entry) => {
            console.log("Found entry DN:", entry.objectName);
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
          logger.error("LDAP user bind failed", { dn, err });
          return resolve(false);
        }
        logger.info("LDAP user bind success", { dn });
        return resolve(true);
      });
    });
  }
}

module.exports = LDAPBackend;

