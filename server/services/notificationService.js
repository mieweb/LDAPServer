const axios = require("axios");

class NotificationService {
  /**
   * Send an authentication push notification
   * @param {string} username - The username requesting authentication
   * @param {string} [notificationUrl] - Override URL (falls back to NOTIFICATION_URL env var)
   * @returns {Promise<Object>} Response data with action field
   */
  static async sendAuthenticationNotification(username, notificationUrl = null) {
    const url = notificationUrl ?? process.env.NOTIFICATION_URL;
    if (!url) {
      throw new Error(
        'NOTIFICATION_URL must be configured (set NOTIFICATION_URL environment variable ' +
        'or provide notificationUrl option in realm config)'
      );
    }
    try {
      const response = await axios.post(
        url,
        {
          username: username,
          title: "SSH Authentication Request",
          body: "Please review and respond to your pending authentication request.",
          actions: [
            { icon: "approve", title: "Approve", callback: "approve" },
            { icon: "reject", title: "Reject", callback: "reject" },
          ],
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Notification failed: ${error.message}`);
    }
  }
}

module.exports = NotificationService;
