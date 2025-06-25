function createLdapEntry(user) {
  // Temp-Fix: Webchart schema doesn't have these right now
  const uidNumber = user.uid_number !== undefined && user.uid_number !== null ? user.uid_number.toString() : "0";
  const gidNumber = user.gid_number !== undefined && user.gid_number !== null ? user.gid_number.toString() : "0";

  const entry = {
    dn: `uid=${user.username},${process.env.LDAP_BASE_DN}`,
    attributes: {
      objectClass: ["top", "posixAccount", "inetOrgPerson", "shadowAccount"],
      uid: user.username,
       uidNumber,
      gidNumber,
      cn: user.full_name || user.username,
      gecos: user.full_name || user.username,
      sn: user.surname || "Unknown",
      mail: user.mail || `${user.username}@mieweb.com`, // Mandatory
      homeDirectory: user.home_directory,
      loginShell: "/bin/bash",
      shadowLastChange: "0",
      userpassword: `{CRYPT}${user.password}`,
    },
  };

  return entry;
}

module.exports = { createLdapEntry };
