require("dotenv").config();
const express = require("express");
const apiRoutes = require("./routes/apiRoutes");
const startLDAPServer = require("./ldapServer");

const app = express();
app.use(express.json());
app.use("/api", apiRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API Server listening on port ${PORT}`);
});

// Start LDAP Server
startLDAPServer();
