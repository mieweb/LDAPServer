/**
 * Utility functions for gracefully shutting down the application
 */

/**
 * Sets up graceful shutdown handlers for the application
 * @param {Object} resources - Resources that need to be cleaned up (like database, directory providers, etc.)
 */
function setupGracefulShutdown(resources) {
  // Handle application termination
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await gracefulShutdown(resources);
  });

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
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
  const { db, directoryProvider, ldapServer } = resources;

  try {
    console.log('Starting graceful shutdown...');

    // Close LDAP server first (stop accepting new connections)
    if (ldapServer) {
      console.log('Closing LDAP server...');
      try {
        await new Promise((resolve, reject) => {
          ldapServer.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log('LDAP server closed');
      } catch (err) {
        console.error('Error closing LDAP server:', err);
      }
    }

    // Clean up directory provider (close file watchers, etc.)
    if (directoryProvider && typeof directoryProvider.cleanup === 'function') {
      console.log('Cleaning up directory provider...');
      try {
        await directoryProvider.cleanup();
        console.log('Directory provider cleaned up');
      } catch (err) {
        console.error('Error cleaning up directory provider:', err);
      }
    }

    // Close database connections last
    if (db) {
      console.log('Closing database connections...');
      try {
        await db.shutdown();
        console.log('Database connections closed');
      } catch (err) {
        console.error('Error closing database:', err);
      }
    }

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

module.exports = {
  setupGracefulShutdown
};