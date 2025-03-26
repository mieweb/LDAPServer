// drivers/mongodb.js
const { MongoClient } = require("mongodb");

// Connection management
async function connect(config) {
  const client = new MongoClient(config.uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  const db = client.db(config.database);
  // Attach client to db object for later closing
  db.client = client;
  return db;
}

async function close(db) {
  if (db && db.client) {
    await db.client.close();
  }
}

// User operations
async function findUserByUsername(db, username) {
  return await db.collection("users").findOne({ username });
}

async function findUserWithAppId(db, username) {
  return await db.collection("users").findOne({ username });
}

async function findUserDetails(db, username) {
  return await db.collection("users").findOne({ username });
}

async function updateUserAppId(db, username, appId) {
  await db.collection("users").updateOne(
    { username },
    { $set: { appId } }
  );
}

// Group operations
async function findGroupsByMemberUid(db, username) {
  const groups = await db.collection("groups")
    .find({ member_uids: username })
    .toArray();
  
  // Transform the result to match the expected format
  return groups.map(group => ({
    name: group.name,
    gid: group.gid,
    member_uids: group.member_uids
  }));
}

module.exports = {
  connect,
  close,
  findUserByUsername,
  findUserWithAppId,
  findUserDetails,
  updateUserAppId,
  findGroupsByMemberUid
};
