const { createLdapEntry } = require('./ldapUtils');

describe('createLdapEntry', () => {
  it('should create a valid LDAP entry with required attributes', () => {
    const user = {
      username: 'john_doe',
      uid_number: 1001,
      gid_number: 1001,
      full_name: 'John Doe',
      surname: 'Doe',
      mail: 'john.doe@example.com',
      home_directory: '/home/john_doe',
    };

    const entry = createLdapEntry(user);

    expect(entry).toHaveProperty('dn');
    expect(entry.dn).toBe(`uid=${user.username},${process.env.LDAP_BASE_DN}`);
    expect(entry).toHaveProperty('attributes');
    expect(entry.attributes).toHaveProperty('uid', user.username);
    expect(entry.attributes).toHaveProperty('mail', user.mail);
    expect(entry.attributes).toHaveProperty('homeDirectory', user.home_directory);
  });

  it('should use default values when optional fields are missing', () => {
    const user = {
      username: 'jane_doe',
      uid_number: 1002,
      gid_number: 1002,
      full_name: 'Jane Doe',
      // surname, mail, and other optional fields omitted
      home_directory: '/home/jane_doe',
    };

    const entry = createLdapEntry(user);

    // Default values for missing fields
    expect(entry.attributes).toHaveProperty('sn', 'Unknown');
    expect(entry.attributes).toHaveProperty('mail', `${user.username}@mieweb.com`);
  });

  it('should handle missing full_name and use username as fallback', () => {
    const user = {
      username: 'alex_smith',
      uid_number: 1003,
      gid_number: 1003,
      // full_name omitted
      surname: 'Smith',
      home_directory: '/home/alex_smith',
    };

    const entry = createLdapEntry(user);

    // full_name is missing, so username should be used
    expect(entry.attributes).toHaveProperty('cn', user.username);
    expect(entry.attributes).toHaveProperty('gecos', user.username);
  });

  it('should handle missing surname and set it to Unknown', () => {
    const user = {
      username: 'sara_lee',
      uid_number: 1004,
      gid_number: 1004,
      full_name: 'Sara Lee',
      // surname omitted
      home_directory: '/home/sara_lee',
    };

    const entry = createLdapEntry(user);

    // surname is missing, so it should default to 'Unknown'
    expect(entry.attributes).toHaveProperty('sn', 'Unknown');
  });
});
