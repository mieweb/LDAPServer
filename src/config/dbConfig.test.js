// config/dbConfig.test.js
describe("Database Configuration", () => {
    // Save the original environment variables
    const originalEnv = { ...process.env };
    
    beforeAll(() => {
      // Mock environment variables
      process.env.MYSQL_HOST = "mysql_test_host";
      process.env.MYSQL_USER = "mysql_test_user";
      process.env.MYSQL_PASSWORD = "mysql_test_password";
      process.env.MYSQL_DATABASE = "mysql_test_db";
      process.env.MONGO_URI = "mongodb://localhost:27017/test_db";
      process.env.MONGO_DATABASE = "mongo_test_db";
    });
    
    beforeEach(() => {
      // Clear the module cache before each test to ensure a fresh module load
      jest.resetModules();
    });
    
    afterEach(() => {
      // Reset environment variables after each test 
      // Delete all properties we know we're using in tests
      delete process.env.DB_TYPE;
    });
    
    afterAll(() => {
      // Restore the original environment after all tests
      process.env = originalEnv;
    });
    
    it("should default to MySQL configuration if DB_TYPE is not set", () => {
      // Unset DB_TYPE environment variable
      delete process.env.DB_TYPE;
      
      // Require the dbconfig module
      const config = require("./dbconfig");
      
      // Test expectations
      expect(config).toEqual({
        type: 'mysql',
        host: "mysql_test_host",
        user: "mysql_test_user",
        password: "mysql_test_password",
        database: "mysql_test_db",
      });
    });
    
    it("should use MySQL configuration if DB_TYPE is mysql", () => {
      process.env.DB_TYPE = "mysql";
      
      const config = require("./dbconfig");
      
      expect(config).toEqual({
        type: 'mysql',
        host: "mysql_test_host",
        user: "mysql_test_user",
        password: "mysql_test_password",
        database: "mysql_test_db",
      });
    });
    
    it("should use MongoDB configuration if DB_TYPE is mongodb", () => {
      process.env.DB_TYPE = "mongodb";
      
      const config = require("./dbconfig");
      
      expect(config).toEqual({
        type: 'mongodb',
        uri: "mongodb://localhost:27017/test_db",
        database: "mongo_test_db",
      });
    });
    
    it("should throw an error for unsupported DB_TYPE", () => {
      process.env.DB_TYPE = "postgresql";
      
      expect(() => {
        require("./dbconfig");
      }).toThrowError("Unsupported database type: postgresql");
    });
  });