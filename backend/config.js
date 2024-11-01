// config.js
require("dotenv").config();

module.exports = {
  ldapConfig: {
    url: process.env.LDAP_URL,
    baseDN: process.env.LDAP_BASE_DN,
    adminDN: process.env.LDAP_ADMIN_DN,
    adminPassword: process.env.LDAP_ADMIN_PASSWORD,
    userSearchBase: process.env.LDAP_BASE_DN,
  },
  mysqlConfig: {
    tableName: process.env.MYSQL_TABLE,
  },
};
