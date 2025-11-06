const { AuthProvider } = require('@ldap-gateway/core');
const NotificationService = require('../../../services/notificationService');
const logger = require('../../../utils/logger');

/**
 * Wrapper AuthProvider that adds MFA/notification functionality to any base auth provider
 */
class NotificationAuthProvider extends AuthProvider {
  constructor(baseAuthProvider) {
    super();
    this.baseAuthProvider = baseAuthProvider;
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      // Initialize the wrapped provider
      if (this.baseAuthProvider.initialize) {
        await this.baseAuthProvider.initialize();
      }
      this.initialized = true;
      logger.debug('[NotificationAuthProvider] Initialized with MFA support');
    }
  }

  async authenticate(username, password, req) {
    try {
      // Step 1: Perform base authentication
      const isValid = await this.baseAuthProvider.authenticate(username, password, req);
      
      if (!isValid) {
        logger.debug(`[NotificationAuthProvider] Base auth failed for ${username}`);
        return false;
      }

      // Step 2: MFA/Notification check
      logger.debug(`[NotificationAuthProvider] Base auth succeeded, sending MFA notification for ${username}`);
      
      const response = await NotificationService.sendAuthenticationNotification(username);
      
      if (response.action === "APPROVE") {
        logger.debug(`[NotificationAuthProvider] MFA approved for ${username}`);
        return true;
      } else {
        logger.debug(`[NotificationAuthProvider] MFA rejected for ${username}`);
        return false;
      }
    } catch (error) {
      logger.error(`[NotificationAuthProvider] Error during authentication for ${username}:`, error);
      return false;
    }
  }

  async cleanup() {
    if (this.initialized && this.baseAuthProvider.cleanup) {
      await this.baseAuthProvider.cleanup();
      this.initialized = false;
    }
  }
}

module.exports = NotificationAuthProvider;