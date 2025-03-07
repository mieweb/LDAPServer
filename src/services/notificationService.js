const axios = require("axios");

class NotificationService {
  static async sendAuthenticationNotification(appId) {
    try {
      // Create a promise for the notification request
      const notificationPromise = axios.post(
        process.env.NOTIFICATION_URL,
        {
          appId: appId,
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

      // Timeout promise that resolves after 30 seconds
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          console.log("Notification timeout after 30 seconds");
          resolve({
            data: {
              action: "timeout",
              message: "No response received within 30 seconds",
            },
          });
        }, 25000); // 30 seconds
      });

      // Race the notification response against the timeout
      const result = await Promise.race([notificationPromise, timeoutPromise]);
      return result.data;
    } catch (error) {
      throw new Error(`Notification failed: ${error.message}`);
    }
  }
}

module.exports = NotificationService;
