// utils/passwordUtils.js
const crypto = require("crypto");

// Helper function to hash passwords
function hashPassword(password, salt) {
  return crypto
    .pbkdf2Sync(
      password,
      salt,
      1000, // iterations
      64, // key length
      "sha512"
    )
    .toString("hex");
}

module.exports = { hashPassword };
