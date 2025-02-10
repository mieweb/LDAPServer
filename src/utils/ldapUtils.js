function createLdapEntry(user) {
  return {
    dn: `cn=${user.username},${process.env.LDAP_BASE_DN}`,
    attributes: {
      objectClass: ["posixAccount", "inetOrgPerson", "shadowAccount"],
      uid: user.username,
      uidNumber: user.uid_number.toString(),
      gidNumber: user.gid_number.toString(),
      cn: user.full_name || user.username,
      gecos: user.full_name || user.username,
      homeDirectory: user.home_directory,
      loginShell: "/bin/bash",
      shadowLastChange: "0",
      userpassword: `{CRYPT}${user.password}`,
    },
  };
}

module.exports = { createLdapEntry };
