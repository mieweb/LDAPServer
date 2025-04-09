const axios = require("axios");
const NotificationService = require("./notificationService");

jest.mock("axios");

describe("NotificationService", () => {
  describe("sendAuthenticationNotification", () => {
    it("should send a notification successfully and return success true when approved", async () => {
      // Mock the successful response when approved
      const mockResponse = { data: { success: true } };
      axios.post.mockResolvedValue(mockResponse);

      const username = "john_doe";

      const response = await NotificationService.sendAuthenticationNotification(username);

      expect(axios.post).toHaveBeenCalledWith(
        process.env.NOTIFICATION_URL,
        expect.objectContaining({
          username: username,
          title: "SSH Authentication Request",
          body: "Please review and respond to your pending authentication request.",
          actions: [
            { icon: "approve", title: "Approve", callback: "approve" },
            { icon: "reject", title: "Reject", callback: "reject" },
          ],
        }),
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
        })
      );

      // Assert the response data when approved
      expect(response).toEqual(mockResponse.data);
      expect(response.success).toBe(true);
    });

    it("should return success false when rejected", async () => {
      const mockResponse = { data: { success: false } };
      axios.post.mockResolvedValue(mockResponse);

      const username = "john_doe";

      const response = await NotificationService.sendAuthenticationNotification(username);

      expect(axios.post).toHaveBeenCalledWith(
        process.env.NOTIFICATION_URL,
        expect.objectContaining({
          username: username,
          title: "SSH Authentication Request",
          body: "Please review and respond to your pending authentication request.",
          actions: [
            { icon: "approve", title: "Approve", callback: "approve" },
            { icon: "reject", title: "Reject", callback: "reject" },
          ],
        }),
        expect.objectContaining({
          headers: { "Content-Type": "application/json" },
        })
      );

      expect(response).toEqual(mockResponse.data);
      expect(response.success).toBe(false);
    });

    it("should throw an error if the notification fails", async () => {
      // Mock the error response
      const mockError = new Error("Network Error");
      axios.post.mockRejectedValue(mockError);

      const username = "john_doe";

      await expect(
        NotificationService.sendAuthenticationNotification(username)
      ).rejects.toThrow("Notification failed: Network Error");
    });
  });
});
