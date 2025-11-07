/**
 * Utility functions for gracefully shutting down the application
 */

const logger = require("./logger");

/**
 * Sets up graceful shutdown handlers for the application
 * @param {Object} resources - Resources that need to be cleaned up (like database, directory providers, etc.)
 */
function setupGracefulShutdown(resources) {
  // Handle application termination
  process.on('SIGTERM', async () => {
    logger.debug('SIGTERM received, shutting down gracefully');
    await gracefulShutdown(resources);
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    logger.debug('SIGINT received, shutting down gracefully');
    await gracefulShutdown(resources);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    await gracefulShutdown(resources);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown(resources);
  });
}

/**
 * Performs graceful shutdown of application resources
 * @param {Object} resources - Resources that need to be cleaned up
 */
async function gracefulShutdown(resources) {
  const { directoryProvider, authProviders, ldapEngine } = resources;

  try {
    logger.debug('Starting graceful shutdown...');

    // Close LDAP server/engine first (stop accepting new connections)
    if (ldapEngine) {
      logger.debug('Stopping LDAP engine...');
      try {
        await ldapEngine.stop();
        logger.debug('LDAP engine stopped');
      } catch (err) {
        console.error('Error stopping LDAP engine:', err);
      }
    } else if (ldapServer) {
      logger.debug('Closing LDAP server...');
      try {
        await new Promise((resolve, reject) => {
          ldapServer.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        logger.debug('LDAP server closed');
      } catch (err) {
        console.error('Error closing LDAP server:', err);
      }
    }

    // Clean up directory provider
    if (directoryProvider && typeof directoryProvider.cleanup === 'function') {
      logger.debug('Cleaning up directory provider...');
      try {
        await directoryProvider.cleanup();
        logger.debug('Directory provider cleaned up');
      } catch (err) {
        console.error('Error cleaning up directory provider:', err);
      }
    }

    // Clean up auth provider
    for (const authProvider of authProviders) {
      if (authProvider && typeof authProvider.cleanup === 'function') {
        logger.debug('Cleaning up auth provider...');
        try {
          await authProvider.cleanup();
          logger.debug('Auth provider cleaned up');
        } catch (err) {
          console.error('Error cleaning up auth provider:', err);
        }
      }
    }

    logger.debug('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

module.exports = {
  setupGracefulShutdown
};