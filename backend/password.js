const crypto = require("crypto");

// Step 1: Generate a random salt
const salt = crypto.randomBytes(16).toString("hex"); // 16-byte salt

// Step 2: Concatenate password and salt
const password = "ann";

// Step 3: Hash the password with salt using PBKDF2
const hashedPassword = crypto
  .pbkdf2Sync(password, salt, 1000, 64, "sha512") // 1000 iterations, 64-byte hash
  .toString("hex");

console.log("Salt:", salt);
console.log("Hashed Password:", hashedPassword);
