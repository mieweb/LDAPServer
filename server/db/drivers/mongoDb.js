const { MongoClient } = require("mongodb");
const logger = require("../../utils/logger");

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
      maxPoolSize: 10,
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

async function findUserByUsername(username) {
  console.log("looking for user", username);
  return await db.collection("users").findOne({ username });
}

async function findGroupsByMemberUid(username) {
  return await db.collection("groups").find({ member_uids: username }).toArray();
}

async function getAllUsers() {
  return await db.collection('users').find({}).toArray();
}

// Add this method to your DatabaseService class (MongoDB version)
async function getAllGroups() {
  try {
    logger.debug('Getting all groups from MongoDB');
    
    // Get all groups from MongoDB
    const groups = await db.collection('groups').find({}).toArray();
    
    logger.debug('Raw groups from MongoDB:', groups);
    
    const result = [];
    
    for (const group of groups) {
      try {
        // Get additional members from user_groups collection (secondary groups)
        const userGroupLinks = await db.collection('user_groups').find({
          group_id: group.gid
        }).toArray();
        
        // Get usernames for the linked users
        const linkedUserIds = userGroupLinks.map(ug => ug.user_id);
        const linkedUsers = await db.collection('users').find({
          _id: { $in: linkedUserIds }
        }).toArray();
        
        const linkedUsernames = linkedUsers.map(u => u.username);
        
        // Combine member_uids from group document with linked usernames
        const allMembers = [
          ...(group.member_uids || []),
          ...linkedUsernames
        ];
        
        // Remove duplicates
        const uniqueMembers = [...new Set(allMembers)];
        
        result.push({
          id: group.gid,
          name: group.name,
          gid: group.gid,
          member_uids: uniqueMembers
        });
        
      } catch (memberError) {
        logger.error('Error getting members for group:', { groupGid: group.gid, error: memberError.message });
        // Add group without additional members if member query fails
        result.push({
          id: group.gid,
          name: group.name,
          gid: group.gid,
          member_uids: group.member_uids || []
        });
      }
    }
    
    logger.debug('Processed groups result:', result);
    return result;
    
  } catch (error) {
    logger.error('Error getting all groups:', { 
      error: error.message, 
      stack: error.stack 
    });
    throw error;
  }
}


module.exports = {
  connect,
  close,
  findUserByUsername,
  findGroupsByMemberUid,
  getAllUsers,
  getAllGroups
};
