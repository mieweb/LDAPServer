const { checkAndSetupEnvironment } = require('./utils/setupUtils');

// Check for command line arguments
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  return {
    reconfig: args.includes('--reconfig') || args.includes('-r')
  };
}

// Check for .env file and run setup if needed
async function initializeServer() {
  const { reconfig } = parseCommandLineArgs();
  
  if (reconfig) {
    console.log('🔄 Reconfiguration requested via --reconfig flag');
  }
  
  await checkAndSetupEnvironment(reconfig);
  
  // Now load environment variables after potential .env creation
  const dotenv = require('dotenv').config();
  
  // Continue with existing server initialization
  return startServer();
}

const ldap = require('ldapjs');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const logger = require('./utils/logger');
const { extractCredentials, getUsernameFromFilter, isAllUsersRequest } = require('./utils/utils');
const { setupGracefulShutdown } = require('./utils/shutdownUtils');
const dbConfig = require('./config/dbConfig');
const DatabaseService = require('./services/databaseServices');
const AuthService = require('./services/authService');
const DBAuth = require('./auth/providers/auth/dbBackend');
const LDAPAuth = require('./auth/providers/auth/ldapBackend');
const ProxmoxAuth = require('./auth/providers/auth/proxmoxBackend');
const DBDirectory = require('./auth/providers/directory/DBDirectory');
const ProxmoxDirectory = require('./auth/providers/directory/ProxmoxDirectory');
const resolveLDAPHosts = require('./utils/resolveLdapHosts');
const NotificationService = require('./services/notificationService');
const { AUTHENTICATION_BACKEND } = require('./constants/constants');
const { handleUserSearch, handleGroupSearch } = require('./handlers/searchHandlers');
const { createLdapEntry } = require('./utils/ldapUtils');

// Extract all environment variables at startup
const config = {
  authBackend: process.env.AUTH_BACKEND || AUTHENTICATION_BACKEND.DATABASE,
  directoryBackend: process.env.DIRECTORY_BACKEND || 'db',
  commonName: process.env.LDAP_COMMON_NAME || 'localhost',
  ldapBaseDn: process.env.LDAP_BASE_DN || (() => {
    // Build LDAP_BASE_DN from LDAP_COMMON_NAME if not explicitly provided
    const commonName = process.env.LDAP_COMMON_NAME || 'localhost';
    if (commonName === 'localhost') {
      return 'dc=localhost';
    }
    return commonName.split('.').map(part => `dc=${part}`).join(',');
  })(),
  ldapPort: process.env.LDAP_PORT || null,
  ldapCertPath: process.env.LDAP_CERT_PATH || null,
  ldapKeyPath: process.env.LDAP_KEY_PATH || null,
  ldapCertContent: process.env.LDAP_CERT_CONTENT || null,
  ldapKeyContent: process.env.LDAP_KEY_CONTENT || null,
  proxmoxUserCfg: process.env.PROXMOX_USER_CFG || null,
  proxmoxShadowCfg: process.env.PROXMOX_SHADOW_CFG || null,
  enableNotification: process.env.ENABLE_NOTIFICATION === 'true',
  unencrypted: process.env.LDAP_UNENCRYPTED === 'true' || process.env.LDAP_UNENCRYPTED === '1'
};

// Function to create self-signed certificates
function createCertificates() {
  const certDir = path.join(process.cwd(), 'cert');
  const certPath = path.join(certDir, 'server.crt');
  const keyPath = path.join(certDir, 'server.key');

  try {
    // Create cert directory if it doesn't exist
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
      logger.info(`Created certificate directory: ${certDir}`);
    }

    // Check if certificates already exist
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      logger.info('Certificates already exist, using existing ones');
      return { certPath, keyPath };
    }

    logger.info('Creating self-signed certificates...');

    // Use the configured common name directly
    const commonName = config.commonName;

    // Create self-signed certificate
    const opensslCmd = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=${commonName}"`;
    
    execSync(opensslCmd, { stdio: 'pipe' });

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      logger.info('Self-signed certificates created successfully');
      return { certPath, keyPath };
    } else {
      throw new Error('Certificate files were not created');
    }
  } catch (error) {
    logger.error('Failed to create certificates:', error.message);
    logger.error('Please ensure OpenSSL is installed and available in PATH');
    process.exit(1);
  }
}

// Function to load certificates
function loadCertificates() {
  // If unencrypted mode is explicitly enabled, return null
  if (config.unencrypted) {
    logger.warn('LDAP server configured for unencrypted mode - SSL/TLS disabled');
    return { certContent: null, keyContent: null };
  }

  let certContent = config.ldapCertContent;
  let keyContent = config.ldapKeyContent;

  // If certificate content is not provided, try to load from paths
  if (!certContent || !keyContent) {
    let certPath = config.ldapCertPath;
    let keyPath = config.ldapKeyPath;

    // If paths are not provided, create certificates
    if (!certPath || !keyPath) {
      const createdCerts = createCertificates();
      certPath = createdCerts.certPath;
      keyPath = createdCerts.keyPath;
    }

    try {
      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        throw new Error(`Certificate files not found: ${certPath}, ${keyPath}`);
      }

      certContent = fs.readFileSync(certPath, 'utf8');
      keyContent = fs.readFileSync(keyPath, 'utf8');
      logger.info('Certificates loaded from files');
    } catch (error) {
      logger.error('Failed to load certificates:', error.message);
      process.exit(1);
    }
  }

  return { certContent, keyContent };
}

// Initialize the database connection
const db = new DatabaseService(dbConfig);

// Function to start the LDAP server
async function startServer() {
  await db.initialize();

  // Load certificates
  const { certContent, keyContent } = loadCertificates();

  let ldapServerPool = [];
  if (config.authBackend === AUTHENTICATION_BACKEND.LDAP) {
    ldapServerPool = await resolveLDAPHosts();
  }

  // Set up directory providers
  const directoryBackends = {
    db: new DBDirectory(db),
    proxmox: new ProxmoxDirectory(config.proxmoxUserCfg),
  };
  const selectedDirectory = directoryBackends[config.directoryBackend] || directoryBackends['db'];

  // Set up authentication providers
  const authBackends = {
    db: new DBAuth(db),
    ldap: new LDAPAuth(ldapServerPool),
    proxmox: new ProxmoxAuth(config.proxmoxShadowCfg),
  };
  const selectedBackend = authBackends[config.authBackend] || authBackends[AUTHENTICATION_BACKEND.DATABASE];
  const authService = new AuthService(selectedBackend);

  // Create the LDAP server
  const serverOptions = {};
  
  // Only add SSL/TLS options if certificates are provided
  if (certContent && keyContent) {
    serverOptions.certificate = certContent;
    serverOptions.key = keyContent;
    logger.info("LDAP server configured with SSL/TLS certificates");
  } else {
    logger.warn("LDAP server running without SSL/TLS certificates");
  }
  
  const server = ldap.createServer(serverOptions);

  // Anonymous bind support
  server.bind('', (req, res, next) => {
    logger.debug("Anonymous bind request - allowing for search operations");
    res.end();
  });

  // Authenticated bind (LDAP BIND)
  server.bind(config.ldapBaseDn, async (req, res, next) => {
    const { username, password } = extractCredentials(req);

    logger.debug("Authenticated bind request", { username });

    try {
      // Authenticate the user using the selected backend
      const isAuthenticated = await authService.authenticate(username, password, req);

      logger.debug(`User ${username} authenticated: ${isAuthenticated}`);
      if (!isAuthenticated) {
        return next(new ldap.InvalidCredentialsError('Invalid credentials'));
      }

      if (config.enableNotification) {
        const response = await NotificationService.sendAuthenticationNotification(username);
        if (response.action === "APPROVE") {
          res.end();
        } else {
          return next(new ldap.InvalidCredentialsError('Authentication rejected'));
        }
      } else {
        res.end();
      }
    } catch (error) {
      logger.error("Bind error", { error });
      return next(new ldap.OperationsError('Authentication error'));
    }
  });

  // LDAP SEARCH
  server.search(config.ldapBaseDn, async (req, res, next) => {
    const filterStr = req.filter.toString();
    
    logger.debug(`LDAP Search - Filter: ${filterStr}, Attributes: ${req.attributes}`);

    const username = getUsernameFromFilter(filterStr);

    if (username) {
      logger.debug(`RETURNING SPECIFIC USER: ${username}`);
      await handleUserSearch(username, res, selectedDirectory);
      return;
    }

    if (isAllUsersRequest(filterStr, req.attributes)) {
      logger.debug("RETURNING ALL USERS - detected user sync request:", filterStr);

      const users = await selectedDirectory.getAllUsers();
      logger.debug(`Found ${users.length} users`);

      for (const user of users) {
        const entry = createLdapEntry(user);
        logger.debug("Sending user entry:", {
          dn: entry.dn,
          uid: entry.attributes.uid,
          objectClass: entry.attributes.objectClass,
          cn: entry.attributes.cn,
          uidNumber: entry.attributes.uidNumber,
          gidNumber: entry.attributes.gidNumber
        });
        res.send(entry);
      }

      logger.debug("User search completed, ending response");
      res.end();
      return;
    }

    // Enhanced group search detection
    const isGroupSearch =
      /(objectClass=posixGroup)|(objectClass=groupOfNames)|(memberUid=)/i.test(filterStr) ||
      /gidNumber=/i.test(filterStr) ||
      (filterStr.length === 0 && (req.attributes.includes('member') || req.attributes.includes('uniqueMember') || req.attributes.includes('memberOf'))) ||
      req.attributes.includes('gidNumber') ||
      req.attributes.includes('memberUid') ||
      req.attributes.includes('cn') && req.attributes.length === 1; // Common group-only attribute requests

    if (isGroupSearch) {
      logger.debug("RETURNING GROUPS FOR GROUP SEARCH:", filterStr);
      await handleGroupSearch(filterStr, res, selectedDirectory);
      return;
    }

    // Handle mixed searches (both users and groups)
    if (/objectClass=/i.test(filterStr) || filterStr.length === 0) {
      logger.debug("GENERIC OBJECTCLASS SEARCH - RETURNING BOTH USERS AND GROUPS:", filterStr);

      // Return users first
      const users = await selectedDirectory.getAllUsers();
      for (const user of users) {
        const entry = createLdapEntry(user);
        res.send(entry);
      }

      // Then return groups
      await handleGroupSearch(filterStr, res, selectedDirectory);
      return;
    }

    logger.debug("No matching pattern found in filter, ending");
    res.end();
  });

  // Add error handling for the server
  server.on('error', (err) => {
    logger.error('LDAP Server error:', err);
  });

  server.on('clientError', (err, socket) => {
    logger.error('LDAP Client connection error:', { 
      error: err.message, 
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort 
    });
  });

  // Start the LDAP server
  // Use port 636 for LDAPS by default, 389 for plain LDAP only if explicitly unencrypted
  const PORT = (certContent && keyContent) 
    ? (config.ldapPort || 636) 
    : (config.ldapPort || 389);
    
  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`LDAP Server listening on port ${PORT}`);
    if (certContent && keyContent) {
      // show fill daps://  path
      logger.info(`Server is running with SSL/TLS encryption ldaps://${config.commonName}:${PORT} to connect securely`);
    } else {
      logger.warn(`\n*****\n*****\nServer is running without SSL/TLS encryption ldap://${config.commonName}:${PORT}\nNot good, so you should just be testing.\n*****\n*****\n`);
    }
  });

  // Graceful shutdown
  setupGracefulShutdown({ db, directoryBackends });
}

// Export the initialization function instead of startServer directly
module.exports = initializeServer;