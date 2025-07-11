const dns = require('dns').promises;
const { URL } = require('url');
const logger = require('./logger');

async function resolveLDAPHosts() {
  logger.info("[LDAP RESOLVER] Starting LDAP host resolution...");

  let servers = [];

  if (process.env.AD_DOMAIN) {
    logger.info(`[LDAP RESOLVER] AD_DOMAIN detected: ${process.env.AD_DOMAIN}`);
    try {
      const srvRecords = await dns.resolveSrv(`_ldap._tcp.${process.env.AD_DOMAIN}`);
      logger.info(`[LDAP RESOLVER] SRV records found: ${JSON.stringify(srvRecords)}`);

      for (const record of srvRecords) {
        logger.info(`[LDAP RESOLVER] Resolving IPs for ${record.name}...`);
        try {
          const ips = await dns.lookup(record.name, { all: true });
          logger.info(`[LDAP RESOLVER] IPs resolved for ${record.name}: ${JSON.stringify(ips)}`);

          for (const ip of ips) {
            servers.push({
              ip: ip.address,
              port: record.port,
              scheme: 'ldap:',
              priority: record.priority,
              weight: record.weight,
              hostname: record.name
            });
          }
        } catch (err) {
          logger.error(`[LDAP RESOLVER] DNS lookup failed for ${record.name}: ${err.message}`);
          continue; // skip this bad record
        }
      }

      logger.info(`[LDAP RESOLVER] Servers before sort: ${JSON.stringify(servers)}`);
      servers.sort((a, b) => (a.priority - b.priority) || (b.weight - a.weight));
      logger.info(`[LDAP RESOLVER] Servers after sort: ${JSON.stringify(servers)}`);
      return servers;

    } catch (err) {
      logger.error(`[LDAP RESOLVER] Failed to resolve SRV records: ${err.message}`);
    }
  }

  // fallback to LDAP_URL if AD_DOMAIN is not set
  logger.info("[LDAP RESOLVER] No AD_DOMAIN found, falling back to LDAP_URL.");
  const ldapUrl = new URL(process.env.LDAP_URL);
  logger.info(`[LDAP RESOLVER] LDAP_URL parsed: ${ldapUrl.href}`);

  const host = ldapUrl.hostname;
  const scheme = ldapUrl.protocol;
  const port = ldapUrl.port || (scheme === 'ldaps:' ? 636 : 389);

  logger.info(`[LDAP RESOLVER] Looking up IPs for host: ${host}`);
  const ips = await dns.lookup(host, { all: true });
  logger.info(`[LDAP RESOLVER] IPs resolved: ${JSON.stringify(ips)}`);

  const resolved = ips.map(ip => ({ ip: ip.address, port, scheme }));
  logger.info(`[LDAP RESOLVER] Final resolved servers: ${JSON.stringify(resolved)}`);

  return resolved;
}

module.exports = resolveLDAPHosts;
