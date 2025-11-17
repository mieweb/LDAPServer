const { AuthProvider } = require('@ldap-gateway/core');
const NotificationService = require('../services/notificationService');
const logger = require('../utils/logger');

/**
 * MFA/Notification AuthProvider that sends push notifications for authentication
 * Works as a standalone auth provider in the chain (doesn't wrap other providers)
 */
class NotificationAuthProvider extends AuthProvider {
  constructor() {
    super();
    this.initialized = false;
  }

  async initialize() {
    if (!this.initialized) {
      this.initialized = true;
      logger.debug('[NotificationAuthProvider] Initialized with MFA support');
    }
  }

  async authenticate(username, password, req) {
    try {
      logger.debug(`[NotificationAuthProvider] Sending MFA notification for ${username}`);
      
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
    if (this.initialized) {
      this.initialized = false;
      logger.info("[NotificationAuthProvider] Cleanup completed");
    }
  }
}

module.exports = {
  name: 'notification',
  type: 'auth',
  provider: NotificationAuthProvider,
};