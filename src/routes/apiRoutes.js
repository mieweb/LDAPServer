const express = require("express");
const { updateAppId, getUserByUsername } = require("../database");

const router = express.Router();

router.post("/update-app-id", async (req, res) => {
  console.log("Request body:", req.body);
  const { username, appId } = req.body;

  if (!username || !appId) {
    return res.status(400).json({ message: "Username and appId are required" });
  }

  try {
    const user = await getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await updateAppId(username, appId);
    return res.status(200).json({ message: "AppId linked successfully" });
  } catch (error) {
    console.error("Error linking appId:", error);
    return res.status(500).json({ message: "Error linking appId" });
  }
});

module.exports = router;
