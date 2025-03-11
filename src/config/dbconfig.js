// dbconfig.js
// Database configuration with environment variable support
// Allows the connection settings to be configured per environment
// through .env files or direct environment variables.
// Default fallback values are provided for local development.
require("dotenv").config();

const dbConfig = {
  host: process.env.MYSQL_HOST || "mysql",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "rootpassword",
  database: process.env.MYSQL_DATABASE || "ldap_user_db",
};

module.exports = dbConfig;
