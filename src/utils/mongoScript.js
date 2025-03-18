require('dotenv').config();
const { MongoClient } = require("mongodb");

// MongoDB Atlas URI
const uri = process.env.MONGO_URL
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas!");

    const database = client.db("ldap_user_db");
    const usersCollection = database.collection("users");
    const groupsCollection = database.collection("groups");

    // Insert users data
    const users = [
      { username: "ann", full_name: "Ann", email: "ann@mieweb.com", uid_number: 1001, gid_number: 1001, home_directory: "/home/ann" },
      { username: "abrol", full_name: "Abrol", email: "abrol@mieweb.com", uid_number: 1002, gid_number: 1002, home_directory: "/home/abrol" },
      { username: "evan", full_name: "Evan Pant", email: "evan@mieweb.com", uid_number: 1003, gid_number: 1003, home_directory: "/home/evan" },
      { username: "hrits", full_name: "Hrits Pant", email: "hrits@mieweb.com", uid_number: 1004, gid_number: 1004, home_directory: "/home/hrits" },
      { username: "chris", full_name: "Chris Evans", email: "chris@mieweb.com", uid_number: 1005, gid_number: 1005, home_directory: "/home/chris" }
    ];

    // Insert groups data, using usernames instead of UIDs for member_uids
    const groups = [
      { gid: 1001, name: "ann_primary", description: "Primary group for Ann", member_uids: ["ann"] },
      { gid: 1002, name: "abrol_primary", description: "Primary group for Abrol", member_uids: ["abrol"] },
      { gid: 1003, name: "evan_primary", description: "Primary group for Evan", member_uids: ["evan"] },
      { gid: 1004, name: "hrits_primary", description: "Primary group for Hrits", member_uids: ["hrits"] },
      { gid: 1005, name: "chris_primary", description: "Primary group for Chris", member_uids: ["chris"] },
      { gid: 5000, name: "developers", description: "Development team", member_uids: ["ann", "evan"] },
      { gid: 5001, name: "sysadmins", description: "System administrators", member_uids: ["abrol", "hrits", "chris"] },
      { gid: 5002, name: "devops", description: "DevOps team", member_uids: ["ann", "hrits"] }
    ];

    // Insert groups data
    const groupResult = await groupsCollection.insertMany(groups);
    console.log(`${groupResult.insertedCount} groups added!`);

    // Insert users data
    const userResult = await usersCollection.insertMany(users);
    console.log(`${userResult.insertedCount} users added!`);

  } catch (err) {
    console.error("Error inserting data:", err);
  } finally {
    await client.close();
  }
}

run().catch(console.error);
