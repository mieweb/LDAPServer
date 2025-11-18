// MongoDB initialization script for LDAP Gateway testing
// This script creates test users and groups in MongoDB

// Switch to the ldap_user_db database
db = db.getSiblingDB('ldap_user_db');

// Clear existing data (if any)
db.users.deleteMany({});
db.groups.deleteMany({});
db.user_groups.deleteMany({});

// Insert test users
db.users.insertMany([
  {
    _id: ObjectId(),
    username: "ann",
    password: "maya",
    full_name: "Ann",
    email: "ann@mieweb.com",
    uid_number: 1001,
    gid_number: 1001,
    home_directory: "/home/ann"
  },
  {
    _id: ObjectId(),
    username: "abrol", 
    password: "abrol",
    full_name: "Abrol",
    email: "abrol@mieweb.com",
    uid_number: 1002,
    gid_number: 1002,
    home_directory: "/home/abrol"
  },
  {
    _id: ObjectId(),
    username: "evan",
    password: "evan", 
    full_name: "Evan Pant",
    email: "evan@mieweb.com",
    uid_number: 1003,
    gid_number: 1003,
    home_directory: "/home/evan"
  },
  {
    _id: ObjectId(),
    username: "hrits",
    password: "maya",
    full_name: "Hrits Pant", 
    email: "hrits@mieweb.com",
    uid_number: 1004,
    gid_number: 1004,
    home_directory: "/home/hrits"
  },
  {
    _id: ObjectId(),
    username: "chris",
    password: "chris",
    full_name: "Chris Evans",
    email: "chris@mieweb.com", 
    uid_number: 1005,
    gid_number: 1005,
    home_directory: "/home/chris"
  }
]);

// Insert primary groups (each user's primary group)
db.groups.insertMany([
  {
    gid_number: 1001,
    name: "ann_primary",
    description: "Primary group for Ann",
    member_uids: ["ann"]
  },
  {
    gid_number: 1002,
    name: "abrol_primary", 
    description: "Primary group for Abrol",
    member_uids: ["abrol"]
  },
  {
    gid_number: 1003,
    name: "evan_primary",
    description: "Primary group for Evan", 
    member_uids: ["evan"]
  },
  {
    gid_number: 1004,
    name: "hrits_primary",
    description: "Primary group for Hrits",
    member_uids: ["hrits"]
  },
  {
    gid_number: 1005,
    name: "chris_primary",
    description: "Primary group for Chris",
    member_uids: ["chris"]
  }
]);

// Insert secondary groups
db.groups.insertMany([
  {
    gid_number: 5000,
    name: "developers",
    description: "Development team",
    member_uids: ["ann", "evan"]
  },
  {
    gid_number: 5001, 
    name: "sysadmins",
    description: "System administrators",
    member_uids: ["abrol", "hrits", "chris"]
  },
  {
    gid_number: 5002,
    name: "devops", 
    description: "DevOlds team",
    member_uids: ["ann", "hrits"]
  }
]);

// Get user IDs for linking to secondary groups
const ann = db.users.findOne({username: "ann"});
const abrol = db.users.findOne({username: "abrol"});
const evan = db.users.findOne({username: "evan"});
const hrits = db.users.findOne({username: "hrits"});
const chris = db.users.findOne({username: "chris"});

// Insert user-group relationships (secondary group memberships)
db.user_groups.insertMany([
  { user_id: ann._id, group_id: 5000 },    // ann -> developers
  { user_id: ann._id, group_id: 5002 },    // ann -> devops
  { user_id: abrol._id, group_id: 5001 },  // abrol -> sysadmins
  { user_id: evan._id, group_id: 5000 },   // evan -> developers  
  { user_id: hrits._id, group_id: 5001 },  // hrits -> sysadmins
  { user_id: hrits._id, group_id: 5002 },  // hrits -> devops
  { user_id: chris._id, group_id: 5001 }   // chris -> sysadmins
]);

// Print summary
print("✅ MongoDB initialization complete!");
print("📊 Users created: " + db.users.countDocuments());
print("📊 Groups created: " + db.groups.countDocuments());
print("📊 User-group links created: " + db.user_groups.countDocuments());
print("");
print("Test users: ann, abrol, evan, hrits, chris");
print("Test groups: developers, sysadmins, devops");