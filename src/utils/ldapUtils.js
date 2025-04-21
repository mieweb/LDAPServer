function createLdapEntry(user) {
  const entry = {
    dn: `uid=${user.username},${process.env.LDAP_BASE_DN}`,
    attributes: {
      objectClass: ["top", "posixAccount", "inetOrgPerson", "shadowAccount"],
      uid: user.username,
      uidNumber: user.uid_number.toString(),
      gidNumber: user.gid_number.toString(),
      cn: user.full_name || user.username,
      gecos: user.full_name || user.username,
      sn: user.surname || "Unknown",
      mail: user.mail || `${user.username}@mieweb.com`, // Mandatory
      homeDirectory: user.home_directory,
      loginShell: "/bin/bash",
      shadowLastChange: "0",
    },
  };

  return entry;
}

module.exports = { createLdapEntry };
