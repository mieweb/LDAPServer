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
    const { db, directoryBackends } = resources;

    try {
        console.log('Closing database connections...');
        if (db) {
            await db.shutdown();
            console.log('Database connections closed');
        }

        // Cleanup directory providers (e.g., file watchers)
        if (directoryBackends) {
            console.log('Cleaning up directory providers...');
            Object.values(directoryBackends).forEach(provider => {
                if (provider && typeof provider.cleanup === 'function') {
                    provider.cleanup();
                }
            });
            console.log('Directory providers cleaned up');
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