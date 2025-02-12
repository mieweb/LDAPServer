require("dotenv").config();
const ldap = require("ldapjs");
const { getUserByUsername } = require("./database");
const { extractCredentials } = require("./utils/utils");
const { hashPassword } = require("./utils/passwordUtils");
const NotificationService = require("./services/notificationService");
const { NOTIFICATION_ACTIONS } = require("./constants/constants");

async function startLDAPServer() {
  const certContent = process.env.LDAP_CERT_CONTENT;
  const keyContent = process.env.LDAP_KEY_CONTENT;

  if (!certContent || !keyContent) {
    console.error("Error: Certificate or key content missing!");
    process.exit(1);
  }

  const server = ldap.createServer({
    certificate: certContent,
    key: keyContent,
  });

  server.bind(process.env.LDAP_BASE_DN, async (req, res, next) => {
    const { username, password } = extractCredentials(req);

    try {
      const user = await getUserByUsername(username);
      if (!user || hashPassword(password, user.salt) !== user.password) {
        return next(new ldap.InvalidCredentialsError("Invalid credentials"));
      }

      const response = await NotificationService.sendAuthenticationNotification(
        user.appId
      );

      if (response.action === NOTIFICATION_ACTIONS.APPROVE) {
        return res.end();
      } else {
        return next(
          new ldap.InvalidCredentialsError("Authentication rejected")
        );
      }
    } catch (error) {
      console.error("Authentication error:", error);
      return next(new ldap.OperationsError("Authentication failed"));
    }
  });

  server.search(process.env.LDAP_BASE_DN, async (req, res, next) => {
    console.log("\n[DEBUG] Incoming search request:", req.filter.toString());

    const match = req.filter.toString().match(/\(uid=([^)]*)\)/);
    const username = match ? match[1] : null;

    if (!username) {
      return next(new ldap.OperationsError("Invalid filter"));
    }

    try {
      const user = await getUserByUsername(username);
      if (!user) {
        return next();
      }

      res.send(createLdapEntry(user));
      res.end();
    } catch (error) {
      console.error("Search operation failed:", error.message);
      return next(new ldap.OperationsError("Search failed"));
    }
  });

  server.listen(636, "0.0.0.0", () => {
    console.log("Secure LDAP Server running on port 636");
  });
}

module.exports = startLDAPServer;
