const sqlQueries = {
  users: {
    findByUsername: "SELECT username FROM users WHERE username = ?",
    findByUsernameWithAppId:
      "SELECT username, appId FROM users WHERE username = ?",
    findUserDetails: "SELECT * FROM users WHERE username = ?",
    updateAppId: "UPDATE users SET appId = ? WHERE username = ?",
  },
  groups: {
    findGroupsByMemberUid: `
        SELECT g.name, g.gid, g.member_uids 
        FROM \`groups\` g
        WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))
      `,
  },
};

module.exports = sqlQueries;
