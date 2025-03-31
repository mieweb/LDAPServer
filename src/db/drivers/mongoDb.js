const { MongoClient } = require("mongodb");

let client;
let db;

/**
 * Initializes the database connection pool.
 */
async function connect(config) {
  if (!client) {
    client = new MongoClient(config.uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10, // Limit the number of connections in the pool
    });
    await client.connect();
    db = client.db(config.database);
    console.log("MongoDB Connected with Connection Pooling");
  }
  return db;
}

/**
 * Closes the database connection pool.
 */
async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("MongoDB Connection Closed");
  }
}

// User operations - no need to pass connection anymore
async function findUserByUsername(username) {
  console.log("looking for user", username);
  return await db.collection("users").findOne({ username });
}

async function updateUserAppId(username, appId) {
  await db.collection("users").updateOne(
    { username },
    { $set: { appId } }
  );
}

// Group operations - no need to pass connection anymore
async function findGroupsByMemberUid(username) {
  return await db.collection("groups").find({ member_uids: username }).toArray();
}

module.exports = {
  connect,
  close,
  findUserByUsername,
  updateUserAppId,
  findGroupsByMemberUid,
};
