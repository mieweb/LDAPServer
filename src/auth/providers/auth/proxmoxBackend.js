const AuthProvider = require('./authProviderInterface');
const fs = require('fs');
const chokidar = require('chokidar');
const unixcrypt = require('unixcrypt');
const logger = require('../../../utils/logger');

class ProxmoxBackend extends AuthProvider {
  constructor(shadowPath) {
    super();
    this.shadowPath = shadowPath;
    this.shadowCache = null;
    this.fileWatcher = null;
    this.reloadTimeout = null;
    
    if (shadowPath) {
      this.loadShadowFile();
      this.setupFileWatcher();
    } else {
      logger.warn("[ProxmoxBackend] No shadow path provided. Authentication will fail.");
    }
  }

  /**
   * Load and cache the shadow file contents
   */
  loadShadowFile() {
    try {
      if (!this.shadowPath) {
        logger.warn("[ProxmoxBackend] No shadow path provided");
        return;
      }
      
      if (!fs.existsSync(this.shadowPath)) {
        logger.warn(`[ProxmoxBackend] Shadow file does not exist: ${this.shadowPath}`);
        return;
      }
      
      this.shadowCache = fs.readFileSync(this.shadowPath, 'utf8');
      logger.info(`[ProxmoxBackend] Loaded Proxmox shadow.cfg from ${this.shadowPath}`);
    } catch (err) {
      logger.error("[ProxmoxBackend] Error reading shadow file:", { error: err });
      this.shadowCache = null;
    }
  }

  /**
   * Set up file watcher to automatically reload shadow file when it changes
   */
  setupFileWatcher() {
    if (!this.shadowPath || !fs.existsSync(this.shadowPath)) {
      logger.warn("[ProxmoxBackend] Cannot setup file watcher: invalid shadow path");
      return;
    }

    try {
      // Use chokidar for reliable file watching
      this.fileWatcher = chokidar.watch(this.shadowPath, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        },
        // Important for mounted file systems like /mnt/pve
        usePolling: true,
        interval: 1000,
        atomic: true,
        followSymlinks: false
      });

      this.fileWatcher.on('change', (path) => {
        logger.info(`[ProxmoxBackend] Shadow file changed: ${path}`);
        this.scheduleReload();
      });

      this.fileWatcher.on('add', (path) => {
        logger.info(`[ProxmoxBackend] Shadow file added: ${path}`);
        this.scheduleReload();
      });

      this.fileWatcher.on('unlink', (path) => {
        logger.warn(`[ProxmoxBackend] Shadow file removed: ${path}`);
        this.shadowCache = null;
      });

      this.fileWatcher.on('error', (error) => {
        logger.error(`[ProxmoxBackend] File watcher error:`, { error: error.message });
      });

      this.fileWatcher.on('ready', () => {
        logger.info(`[ProxmoxBackend] Chokidar file watcher ready and monitoring: ${this.shadowPath}`);
      });

      logger.info(`[ProxmoxBackend] Setting up chokidar file watcher for ${this.shadowPath}`);
    } catch (err) {
      logger.error("[ProxmoxBackend] Error setting up file watcher:", { error: err });
    }
  }

  /**
   * Schedule a shadow file reload with debouncing
   */
  scheduleReload() {
    // Debounce rapid file changes
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }
    
    this.reloadTimeout = setTimeout(() => {
      this.loadShadowFile();
      logger.info("[ProxmoxBackend] Shadow file reloaded successfully after file change");
    }, 500);
  }

  /**
   * Clean up file watcher when instance is destroyed
   */
  async destroy() {
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      logger.info("[ProxmoxBackend] File watcher closed");
    }
    if (this.reloadTimeout) {
      clearTimeout(this.reloadTimeout);
    }
  }

  async authenticate(username, password) {
    try {
      // Use cached shadow data if available, otherwise read from file
      const shadow = this.shadowCache || fs.readFileSync(this.shadowPath, 'utf8');
      
      if (!shadow) {
        logger.error("[ProxmoxBackend] No shadow data available");
        return false;
      }

      const lines = shadow.split('\n');
      
      for (const line of lines) {
        if (!line) continue;
        
        const [fileUser, hash] = line.split(':');
        
        if (fileUser === username) {
          logger.debug(`[ProxmoxBackend] Found user ${username} in shadow file, verifying password...`);
          const isValid = unixcrypt.verify(password, hash);
          logger.debug(`[ProxmoxBackend] Password verification result for ${username}:`, isValid);
          return isValid;
        }
      }
      
      logger.debug(`[ProxmoxBackend] User ${username} not found in shadow file`);
      return false;
    } catch (err) {
      logger.error('[ProxmoxBackend] Error during authentication:', { error: err });
      return false;
    }
  }
}

module.exports = ProxmoxBackend;