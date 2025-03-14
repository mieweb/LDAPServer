// config/dbconfig.js
require("dotenv").config();

// Available database configurations
const dbConfigs = {
  mysql: {
    type: 'mysql',
    host: process.env.MYSQL_HOST || "mysql",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "rootpassword",
    database: process.env.MYSQL_DATABASE || "ldap_user_db",
  },
  
  mongodb: {
    type: 'mongodb',
    uri: process.env.MONGO_URI || "mongodb://localhost:27017/ldap_user_db",
    database: process.env.MONGO_DATABASE || "ldap_user_db"
  }
};

// Get the active database configuration based on environment variable
const activeDbType = process.env.DB_TYPE || 'mysql';
const dbConfig = dbConfigs[activeDbType];

if (!dbConfig) {
  throw new Error(`Unsupported database type: ${activeDbType}`);
}

module.exports = dbConfig;