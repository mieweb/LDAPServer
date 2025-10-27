/**
 * Utility functions for gracefully shutting down the application
 */

/**
 * Sets up graceful shutdown handlers for the application
 * @param {Object} resources - Resources that need to be cleaned up (like database)
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
}

/**
 * Performs graceful shutdown of application resources
 * @param {Object} resources - Resources that need to be cleaned up
 */
async function gracefulShutdown(resources) {
  const { db, directoryProvider } = resources;

  try {
    // Clean up directory provider resources (file watchers, etc.)
    if (directoryProvider && typeof directoryProvider.destroy === 'function') {
      console.log('Closing directory provider resources...');
      directoryProvider.destroy();
      console.log('Directory provider resources closed');
    }

    // Close database connections
    console.log('Closing database connections...');
    if (db) {
      await db.shutdown();
      console.log('Database connections closed');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}
module.exports = {
    setupGracefulShutdown
};