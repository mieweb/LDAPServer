/**
 * Utility functions for gracefully shutting down the application
 */

const logger = require("./logger");

// Keep track of whether shutdown handlers have already been set up
let shutdownHandlersSet = false;
let currentResources = null;
let shuttingDown = false;

/**
 * Sets up graceful shutdown handlers for the application
 * @param {Object} resources - Resources that need to be cleaned up (like database, directory providers, etc.)
 */
function setupGracefulShutdown(resources) {
  // Always update the current resources reference
  currentResources = resources;
  
  // Only set up signal handlers once
  if (shutdownHandlersSet) {
    logger.debug('Shutdown handlers already set up, updating resources reference');
    return;
  }

  shutdownHandlersSet = true;
  logger.debug('Setting up shutdown handlers for the first time');

  // Handle application termination
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully (press Ctrl+C again to force exit)...');
    await gracefulShutdown();
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully (press Ctrl+C again to force exit)...');
    await gracefulShutdown();
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught exception:', err);
    await gracefulShutdown();
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown();
  });
}

/**
 * Performs graceful shutdown of application resources
 */
async function gracefulShutdown() {
  // Second signal forces immediate exit
  if (shuttingDown) {
    logger.warn('Shutdown signal received again, forcing immediate exit!');
    process.exit(1);
  }
  
  shuttingDown = true;
  const { ldapEngine } = currentResources || {};

  try {
    logger.debug('Starting graceful shutdown...');

    // Stop LDAP engine (handles server shutdown + all provider cleanup)
    if (ldapEngine) {
      logger.debug('Stopping LDAP engine...');
      try {
        await ldapEngine.stop();
        logger.debug('LDAP engine and all providers cleaned up');
      } catch (err) {
        console.error('Error stopping LDAP engine:', err);
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