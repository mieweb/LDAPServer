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
      maxPoolSize: 10,
    });
    await client.connect();
    db = client.db(config.database);
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
  }
}

async function findUserByUsername(username) {
  if (!db) {
    throw new Error('MongoDB connection not established. Call connect() first.');
  }
  return await db.collection("users").findOne({ username });
}

async function findGroupsByMemberUid(username) {
  if (!db) {
    throw new Error('MongoDB connection not established. Call connect() first.');
  }
  const groups = await db.collection("groups").find({ member_uids: username }).toArray();
  
  // Normalize the group structure to match expected format
  return groups.map(group => {
    const gidNumber = group.gid_number || group.gid;
    return {
      id: gidNumber,
      name: group.name,
      gid_number: gidNumber,
      gidNumber: gidNumber,
      memberUids: group.member_uids || [],
      member_uids: group.member_uids || []
    };
  });
}

async function getAllUsers() {
  if (!db) {
    throw new Error('MongoDB connection not established. Call connect() first.');
  }
  return await db.collection('users').find({}).toArray();
}

// Add this method to your DatabaseService class (MongoDB version)
async function getAllGroups() {
  if (!db) {
    throw new Error('MongoDB connection not established. Call connect() first.');
  }
  try {
    logger.debug('Getting all groups from MongoDB');
    
    // Get all groups from MongoDB
    const groups = await db.collection('groups').find({}).toArray();
    
    logger.debug('Raw groups from MongoDB:', groups);
    
    const result = [];
    
    for (const group of groups) {
      try {
        // Support both gid and gid_number fields
        const gidNumber = group.gid_number || group.gid;
        
        // Get additional members from user_groups collection (secondary groups)
        const userGroupLinks = await db.collection('user_groups').find({
          group_id: gidNumber
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
          id: gidNumber,
          name: group.name,
          gid_number: gidNumber,
          gidNumber: gidNumber,  // Support both field names
          memberUids: uniqueMembers,  // Use camelCase for consistency with other backends
          member_uids: uniqueMembers  // Also support snake_case
        });
        
      } catch (memberError) {
        const gidNumber = group.gid_number || group.gid;
        logger.error('Error getting members for group:', { groupGid: gidNumber, error: memberError.message });
        // Add group without additional members if member query fails
        result.push({
          id: gidNumber,
          name: group.name,
          gid_number: gidNumber,
          gidNumber: gidNumber,
          memberUids: group.member_uids || [],
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
