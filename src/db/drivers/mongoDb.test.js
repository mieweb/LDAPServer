const { MongoClient } = require("mongodb");

jest.mock("mongodb", () => {
  const mCollection = {
    findOne: jest.fn(),
    find: jest.fn(() => ({ toArray: jest.fn() })),
  };
  const mDb = {
    collection: jest.fn(() => mCollection),
  };
  const mClient = {
    connect: jest.fn(),
    db: jest.fn(() => mDb),
    close: jest.fn(),
  };
  return {
    MongoClient: jest.fn(() => mClient),
  };
});

const mongoService = require("./mongoDb");

describe("MongoDB Utility", () => {
  const config = {
    uri: "mongodb://localhost:27017",
    database: "test_db",
  };

  let mockClient;
  let mockDb;
  let mockCollection;

  beforeEach(async () => {
    mockClient = new MongoClient();
    mockDb = mockClient.db();
    mockCollection = mockDb.collection();

    await mongoService.connect(config);
  });

  afterEach(async () => {
    await mongoService.close();
    jest.clearAllMocks();
  });

  test("connect should initialize MongoDB client and db", async () => {
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockClient.db).toHaveBeenCalledWith(config.database);
  });

  test("findUserByUsername should call users.findOne", async () => {
    const username = "john";
    const expectedUser = { username: "john", email: "john@example.com" };
    mockCollection.findOne.mockResolvedValue(expectedUser);

    const user = await mongoService.findUserByUsername(username);
    expect(mockDb.collection).toHaveBeenCalledWith("users");
    expect(mockCollection.findOne).toHaveBeenCalledWith({ username });
    expect(user).toEqual(expectedUser);
  });

  test("findGroupsByMemberUid should call groups.find().toArray()", async () => {
    const username = "john";
    const mockGroups = [{ name: "devs" }, { name: "admins" }];
    const findMock = { toArray: jest.fn().mockResolvedValue(mockGroups) };

    mockCollection.find.mockReturnValue(findMock);
    mockDb.collection.mockReturnValueOnce(mockCollection);

    const groups = await mongoService.findGroupsByMemberUid(username);
    expect(mockDb.collection).toHaveBeenCalledWith("groups");
    expect(mockCollection.find).toHaveBeenCalledWith({ member_uids: username });
    expect(groups).toEqual(mockGroups);
  });

  test("close should close the MongoDB connection", async () => {
    await mongoService.close();
    expect(mockClient.close).toHaveBeenCalled();
  });
});
