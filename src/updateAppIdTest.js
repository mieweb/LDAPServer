const axios = require("axios");

async function updateAppId(username, appId) {
  try {
    const response = await axios.post(
      "https://c95c-192-5-91-111.ngrok-free.app/update-app-id",
      {
        username: username,
        appId: appId,
      }
    );

    console.log("Response:", response.data);
  } catch (error) {
    console.error(
      "Error updating appId:",
      error.response ? error.response.data : error.message
    );
  }
}

// Example usage
updateAppId("ann", "5e1f1b8412c031084307eb3edeaa8f1f");
