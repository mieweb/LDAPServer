const { LdapEngine } = require('@ldap-gateway/core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const configLoader = require('./config/configurationLoader');

const logger = require('./utils/logger');
const { setupGracefulShutdown } = require('./utils/shutdownUtils');
const { checkAndSetupEnvironment } = require('./utils/setupUtils');

const { ProviderFactory } = require('./providers');

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
  
  // Load configuration using the centralized configuration loader
  const config = configLoader.loadConfig();
  
  // Initialize dynamic backend loading
  const backendDir = process.env.BACKEND_DIR || null;
  ProviderFactory.initialize(backendDir);
  
  // List available backends for debugging
  if (config.logLevel === 'debug') {
    const availableBackends = ProviderFactory.listAvailableBackends();
    logger.debug('Available auth backends:', availableBackends.auth);
    logger.debug('Available directory backends:', availableBackends.directory);
  }
  
  // Continue with server initialization
  return startServer(config);
}

// Function to create self-signed certificates
function createCertificates(config) {
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

// Function to load certificates (either from files or environment variables)
function loadCertificates(config) {
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
      const createdCerts = createCertificates(config);
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

// Function to start the LDAP server using LdapEngine
async function startServer(config) {
  // Load certificates
  const { certContent, keyContent } = loadCertificates(config);

  // Set up directory providers using ProviderFactory
  let selectedDirectory;
  try {
    selectedDirectory = ProviderFactory.createDirectoryProvider(config.directoryBackend);
    logger.info(`Directory provider created: ${config.directoryBackend}`);
    
    // Initialize the directory provider
    await selectedDirectory.initialize();
    logger.info(`Directory provider initialized: ${config.directoryBackend}`);
  } catch (error) {
    logger.error(`Failed to initialize directory provider '${config.directoryBackend}':`, error.message);
    throw error;
  }

  // Set up authentication providers using ProviderFactory
  let selectedBackend;
  try {
    selectedBackend = ProviderFactory.createAuthProvider(config.authBackend);
    logger.info(`Auth provider created: ${config.authBackend}`);
    
    // Initialize the auth provider
    await selectedBackend.initialize();
    logger.info(`Auth provider initialized: ${config.authBackend}`);
  } catch (error) {
    logger.error(`Failed to initialize auth provider '${config.authBackend}':`, error.message);
    throw error;
  }

  // Determine port based on SSL/TLS configuration
  const PORT = (certContent && keyContent) 
    ? (config.ldapPort || 636) 
    : (config.ldapPort || 389);

  // Create and configure LDAP engine
  const ldapEngine = new LdapEngine({
    baseDn: config.ldapBaseDn,
    port: PORT,
    certificate: certContent,
    key: keyContent,
    enableNotification: config.enableNotification,
    logger: logger
  });

  // Set providers
  ldapEngine.setAuthProvider(selectedBackend);
  ldapEngine.setDirectoryProvider(selectedDirectory);

  // Set up event listeners for logging and monitoring
  ldapEngine.on('started', (info) => {
    if (info.hasCertificate) {
      logger.info(`Server is running with SSL/TLS encryption ldaps://${config.commonName}:${info.port} to connect securely`);
    } else {
      logger.warn(`\n*****\n*****\nServer is running without SSL/TLS encryption ldap://${config.commonName}:${info.port}\nNot good, so you should just be testing.\n*****\n*****\n`);
    }
  });

  ldapEngine.on('bindRequest', ({ username, anonymous }) => {
    if (anonymous) {
      logger.debug("Anonymous bind request - allowing for search operations");
    } else {
      logger.debug("Authenticated bind request", { username });
    }
  });

  ldapEngine.on('bindSuccess', ({ username, anonymous }) => {
    if (!anonymous) {
      logger.debug(`User ${username} authenticated: true`);
    }
  });

  ldapEngine.on('bindFail', ({ username, reason }) => {
    logger.debug(`User ${username} authenticated: false - ${reason}`);
  });

  ldapEngine.on('searchRequest', ({ filter, attributes }) => {
    logger.debug(`LDAP Search - Filter: ${filter}, Attributes: ${attributes}`);
  });

  ldapEngine.on('searchResponse', ({ filter, entryCount, duration }) => {
    logger.debug(`Search completed: ${entryCount} entries in ${duration}ms`);
  });

  ldapEngine.on('entryFound', ({ type, entry }) => {
    if (type === 'user') {
      logger.debug("Sending user entry:", { dn: entry });
    }
  });

  ldapEngine.on('serverError', (err) => {
    logger.error('LDAP Server error:', err);
  });

  ldapEngine.on('clientError', ({ error, socket }) => {
    logger.error('LDAP Client connection error:', { 
      error: error.message, 
      remoteAddress: socket?.remoteAddress,
      remotePort: socket?.remotePort 
    });
  });

  // Start the LDAP engine
  await ldapEngine.start();

  // Graceful shutdown
  setupGracefulShutdown({ 
    directoryProvider: selectedDirectory,
    authProvider: selectedBackend,
    ldapEngine: ldapEngine
  });

  return ldapEngine;
}

// Export the initialization function instead of startServer directly
module.exports = initializeServer;