function extractCredentials(req) {
  const dnParts = req.dn.toString().split(",");
  const username = dnParts[0].split("=")[1];
  const password = req.credentials;

  return { username, password };
}

module.exports = { extractCredentials };
