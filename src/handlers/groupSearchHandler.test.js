const { handleGroupSearch } = require("./groupSearchHandler");

describe("handleGroupSearch", () => {
  const mockRes = {
    send: jest.fn(),
    end: jest.fn(),
  };

  const mockDb = {
    findGroupsByMemberUid: jest.fn(),
  };

  const mockGroups = [
    { name: "devs", gid: 5001, member_uids: ["john", "doe"] },
    { name: "admins", gid: 5002, member_uids: ["john"] },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should send group entries if memberUid is present", async () => {
    mockDb.findGroupsByMemberUid.mockResolvedValue(mockGroups);

    await handleGroupSearch("(memberUid=john)", mockRes, mockDb);

    expect(mockRes.send).toHaveBeenCalledTimes(2);
    expect(mockRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ dn: expect.stringContaining("devs") })
    );
    expect(mockRes.end).toHaveBeenCalled();
  });

  it("should end response even if no memberUid match", async () => {
    await handleGroupSearch("(objectClass=posixGroup)", mockRes, mockDb);

    expect(mockRes.send).not.toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });

  it("should handle and log errors", async () => {
    mockDb.findGroupsByMemberUid.mockRejectedValue(new Error("DB Error"));

    await handleGroupSearch("(memberUid=john)", mockRes, mockDb);

    expect(mockRes.end).toHaveBeenCalled();
  });
});
