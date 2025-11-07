const { LdapEngine } = require('@ldap-gateway/core');

const ConfigurationLoader = require('./config/configurationLoader');

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
  const configLoader = new ConfigurationLoader();
  const config = configLoader.loadConfig();
  
  // Initialize dynamic backend loading
  ProviderFactory.initialize(config.backendDir);
  
  // List available backends for debugging
  if (config.logLevel === 'debug') {
    const availableBackends = ProviderFactory.listAvailableBackends();
    logger.debug('Available auth backends:', availableBackends.auth);
    logger.debug('Available directory backends:', availableBackends.directory);
  }
  
  // Continue with server initialization
  return startServer(config);
}

// Function to start the LDAP server using LdapEngine
async function startServer(config) {
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


  // Create and configure LDAP engine
  const ldapEngine = new LdapEngine({
    baseDn: config.ldapBaseDn,
    bindIp: config.bindIp,
    port: config.port,
    certificate: config.certContent,
    key: config.keyContent,
    logger: logger,
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