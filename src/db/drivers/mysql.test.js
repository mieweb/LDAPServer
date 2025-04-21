jest.mock("mysql2/promise", () => {
    const mockConnection = {
      execute: jest.fn(),
      release: jest.fn(),
    };
  
    const mockPool = {
      getConnection: jest.fn(() => Promise.resolve(mockConnection)),
      end: jest.fn(() => Promise.resolve()),
    };
  
    return {
      createPool: jest.fn(() => mockPool),
    };
  });
  
  const mysql = require("mysql2/promise");
  const mysqlDb = require("./mysql");
  
  describe("MySQL DB Utility", () => {
    const config = {
      host: "localhost",
      user: "test_user",
      password: "test_pass",
      database: "test_db",
    };
  
    let mockPool;
    let mockConnection;
  
    beforeEach(async () => {
      mockPool = mysql.createPool();
      mockConnection = await mockPool.getConnection();
  
      await mysqlDb.connect(config);
    });
  
    afterEach(async () => {
      await mysqlDb.close();
      jest.clearAllMocks();
    });
  
    test("connect should create MySQL connection pool", () => {
      expect(mysql.createPool).toHaveBeenCalledWith({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
    });
  
    test("findUserByUsername should return user", async () => {
      const username = "john";
      const expectedRows = [[{ username: "john", email: "john@example.com" }]];
  
      mockConnection.execute.mockResolvedValue(expectedRows);
  
      const user = await mysqlDb.findUserByUsername(username);
  
      expect(mockConnection.execute).toHaveBeenCalledWith(
        "SELECT * FROM users WHERE username = ?",
        [username]
      );
      expect(user).toEqual(expectedRows[0][0]);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  
    test("findGroupsByMemberUid should return parsed group list", async () => {
      const username = "john";
      const jsonString = JSON.stringify(["john", "jane"]);
      const expectedRows = [[
        { name: "devs", gid: 1, member_uids: jsonString },
      ]];
  
      mockConnection.execute.mockResolvedValue(expectedRows);
  
      const groups = await mysqlDb.findGroupsByMemberUid(username);
  
      expect(mockConnection.execute).toHaveBeenCalledWith(
        "SELECT g.name, g.gid, g.member_uids " +
        "FROM `groups` g " +
        "WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))",
        [username]
      );
  
      expect(groups).toEqual([
        { name: "devs", gid: 1, member_uids: ["john", "jane"] },
      ]);
      expect(mockConnection.release).toHaveBeenCalled();
    });
  
    test("close should close the MySQL pool", async () => {
      await mysqlDb.close();
      expect(mockPool.end).toHaveBeenCalled();
    });
  });
  