const { handleUserSearch } = require("./userSearchHandler");

describe("handleUserSearch", () => {
  const mockRes = {
    send: jest.fn(),
    end: jest.fn(),
  };

  const mockDb = {
    findUserByUsername: jest.fn(),
  };

  const mockUser = {
    username: "john",
    uid_number: 1001,        
    gid_number: 1001,       
    full_name: "John Doe",   
    surname: "Doe",         
    mail: "john@example.com",
    home_directory: "/home/john",
    shadowLastChange: "10",
  };

  // Set the LDAP_BASE_DN environment variable for the test
  beforeAll(() => {
    process.env.LDAP_BASE_DN = "dc=mieweb,dc=com";
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should send LDAP entry if user is found", async () => {
    mockDb.findUserByUsername.mockResolvedValue(mockUser);

    await handleUserSearch("john", mockRes, mockDb);

    // Verifying that the response was sent with the correct LDAP entry
    expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
      dn: "uid=john,dc=mieweb,dc=com", 
      attributes: expect.objectContaining({
        cn: "John Doe",      
        uid: "john",          
        mail: "john@example.com",
        uidNumber: "1001",      
        gidNumber: "1001",    
        homeDirectory: "/home/john", 
      }),
    }));

    expect(mockRes.end).toHaveBeenCalled();
  });

  it("should end response if user not found", async () => {
    mockDb.findUserByUsername.mockResolvedValue(null);

    await handleUserSearch("ghost", mockRes, mockDb);

    expect(mockRes.send).not.toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });
});
