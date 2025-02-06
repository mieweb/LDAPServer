const axios = require("axios");

class NotificationService {
  static async sendAuthenticationNotification() {
    try {
      const response = await axios.post(
        process.env.NOTIFICATION_URL,
        {
          appId: process.env.NOTIFICATION_APP_ID,
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
