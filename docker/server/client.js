const ldap = require("ldapjs");
const fs = require("fs");

// LDAP server connection configuration
const clientConfig = {
  url: "ldap://localhost:389",
  tlsOptions: {
    ca: [fs.readFileSync("../certificates/ca-cert.pem")],
    rejectUnauthorized: true,
  },
};

// Create an LDAP client
const client = ldap.createClient(clientConfig);

// Helper function to bind to the LDAP server
function bindToServer(username, password, baseDN) {
  return new Promise((resolve, reject) => {
    const dn = `uid=${username},${baseDN}`;
    console.log(`\n[INFO] Attempting to bind as DN: ${dn}`);

    client.bind(dn, password, (err) => {
      if (err) {
        console.error(`[ERROR] Bind failed: ${err.message}`);
        return reject(err);
      }
      console.log("[SUCCESS] Bind successful");
      resolve();
    });
  });
}

// Helper function to search the LDAP directory
function searchDirectory(baseDN, filter) {
  return new Promise((resolve, reject) => {
    const searchOptions = {
      scope: "sub",
      filter,
      attributes: ["*"], // Request all attributes
    };

    console.log(`\n[INFO] Initiating search with filter: ${filter}`);

    client.search(baseDN, searchOptions, (err, res) => {
      if (err) {
        console.error(`[ERROR] Search failed: ${err.message}`);
        return reject(err);
      }

      const entries = [];

      res.on("searchEntry", (entry) => {
        console.log("\n[INFO] Raw Search Entry:");
        console.log(entry);

        // Extract the JSON representation of the entry
        const result = entry.json;
        if (result) {
          console.log("\n[RESULT] Parsed Search Entry:");
          console.log(JSON.stringify(result, null, 2));
          entries.push(result);
        } else {
          console.warn("[WARNING] No valid JSON found in search entry");
        }
      });

      res.on("end", (result) => {
        console.log(`[INFO] Search completed with status: ${result.status}`);
        resolve(entries);
      });

      res.on("error", (err) => {
        console.error(`[ERROR] Search error: ${err.message}`);
        reject(err);
      });
    });
  });
}

// Main function to test the client
async function testLDAPClient() {
  const baseDN = "dc=mieweb,dc=com";
  const username = "ann";
  const password = "anns";
  const searchFilter = `(uid=${username})`;

  try {
    console.log("[INFO] Starting LDAP client operations...");

    // Test bind operation
    await bindToServer(username, password, baseDN);

    // Test search operation
    const results = await searchDirectory(baseDN, searchFilter);

    // Display final results
    console.log("\n[FINAL RESULTS] All Search Results:");
    console.log(JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(`[ERROR] Operation failed: ${err.message}`);
  } finally {
    // Unbind the client
    client.unbind((err) => {
      if (err) {
        console.error(`[ERROR] Failed to unbind client: ${err.message}`);
      } else {
        console.log("[INFO] Client unbound successfully");
      }
    });
  }
}

// Execute the client test
testLDAPClient();
