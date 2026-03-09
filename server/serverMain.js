const { LdapEngine } = require('@ldap-gateway/core');
const ConfigurationLoader = require('./config/configurationLoader');
const ProviderFactory = require('./providers');
const { setupGracefulShutdown } = require('./utils/shutdownUtils');
const { checkAndSetupEnvironment } = require('./utils/setupUtils');
const logger = require('./utils/logger');

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
  const config = await configLoader.loadConfig();
  
  // Continue with server initialization
  return startServer(config);
}

// Function to start the LDAP server using LdapEngine
async function startServer(config) {
  // Set up directory providers using ProviderFactory
  const providerFactory = new ProviderFactory(config.backendDir);
  const availableBackends = providerFactory.listAvailableBackends();
  logger.debug('Available auth backends:', availableBackends.auth);
  logger.debug('Available directory backends:', availableBackends.directory);

  // Build LdapEngine options
  const engineOptions = {
    bindIp: config.bindIp,
    port: config.port,
    certificate: config.certContent,
    key: config.keyContent,
    tlsMinVersion: config.tlsMinVersion,
    tlsMaxVersion: config.tlsMaxVersion,
    tlsCiphers: config.tlsCiphers,
    logger: logger,
    requireAuthForSearch: config.requireAuthForSearch
  };

  // Build global auth provider registry for per-user auth override (Phase 3)
  // Maps "realm:type" → AuthProvider instance (realm-scoped) and
  //       "type"       → AuthProvider instance (first-registered fallback)
  const authProviderRegistry = new Map();

  if (config.realms) {
    // Multi-realm mode: build realm objects from config
    logger.info(`Initializing multi-realm mode with ${config.realms.length} realm(s)`);
    engineOptions.realms = config.realms.map(realmCfg => {
      // Ensure directory providers receive realm-scoped LDAP base DN so that
      // any provider-side DN construction stays consistent with realmCfg.baseDn.
      const directoryOptions = {
        ldapBaseDn: realmCfg.baseDn,
        ...(realmCfg.directory.options || {})
      };
      const directoryProvider = providerFactory.createDirectoryProvider(
        realmCfg.directory.backend,
        directoryOptions
      );

      const authProviders = realmCfg.auth.backends.map(backendCfg => {
        const provider = providerFactory.createAuthProvider(backendCfg.type, backendCfg.options || {});
        // Register with realm-scoped key for accurate per-user auth override
        const registryKey = `${realmCfg.name}:${backendCfg.type}`;
        authProviderRegistry.set(registryKey, provider);
        logger.debug(`Registered auth backend '${registryKey}' in provider registry`);
        // Also register type-only key as fallback (first realm wins per type)
        if (!authProviderRegistry.has(backendCfg.type)) {
          authProviderRegistry.set(backendCfg.type, provider);
          logger.debug(`Registered fallback auth backend '${backendCfg.type}' (first realm wins)`);
        }
        return provider;
      });

      logger.info(`Realm '${realmCfg.name}': baseDN=${realmCfg.baseDn}, ` +
        `directory=${realmCfg.directory.backend}, auth=[${realmCfg.auth.backends.map(b => b.type).join(', ')}]`);

      return {
        name: realmCfg.name,
        baseDn: realmCfg.baseDn,
        directoryProvider,
        authProviders
      };
    });
  } else {
    // Legacy single-realm mode
    const selectedDirectory = providerFactory.createDirectoryProvider(config.directoryBackend);
    const selectedBackends = config.authBackends.map((authBackend) => {
      return providerFactory.createAuthProvider(authBackend);
    });
    engineOptions.baseDn = config.ldapBaseDn;
    engineOptions.authProviders = selectedBackends;
    engineOptions.directoryProvider = selectedDirectory;

    // Register legacy auth providers in the registry
    for (let idx = 0; idx < config.authBackends.length; idx++) {
      const backendType = config.authBackends[idx];
      if (!authProviderRegistry.has(backendType)) {
        authProviderRegistry.set(backendType, selectedBackends[idx]);
        logger.debug(`Registered auth backend '${backendType}' in provider registry`);
      }
    }
  }

  engineOptions.authProviderRegistry = authProviderRegistry;

  // Create and configure LDAP engine
  const ldapEngine = new LdapEngine(engineOptions);

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
    ldapEngine: ldapEngine
  });

  return ldapEngine;
}

// Export the initialization function instead of startServer directly
module.exports = initializeServer;