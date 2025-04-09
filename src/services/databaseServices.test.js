const DatabaseService = require('./databaseServices');
const mysqlDriver = require('../db/drivers/mysql');
const mongodbDriver = require('../db/drivers/mongoDb');

// Mock the database drivers
jest.mock('../db/drivers/mysql');
jest.mock('../db/drivers/mongoDb');

describe("DatabaseService", () => {
    let dbService;

    beforeEach(() => {
        jest.clearAllMocks();

    })

    it('should choose mysqlDriver for mysql database', () => {
        const dbConfig = { type: 'mysql', host: 'localhost', user: 'root', password: 'password' };
        dbService = new DatabaseService(dbConfig);

        expect(dbService.driver).toBe(mysqlDriver);
    });

    it('should choose mongodbDriver for mongodb database', () => {
        const dbConfig = { type: 'mongodb', host: 'localhost', user: 'root', password: 'password' };
        dbService = new DatabaseService(dbConfig);

        expect(dbService.driver).toBe(mongodbDriver);
    });

    it('should throw an error for unsupported database type', () => {
        const dbConfig = { type: 'unsupportedDb', host: 'localhost', user: 'root', password: 'password' };

        expect(() => new DatabaseService(dbConfig)).toThrow('Unsupported database type: unsupportedDb');
    });

    it('should initialize the database connection pool', async () => {
        const dbConfig = { type: 'mysql', host: 'localhost', user: 'root', password: 'password' };
        dbService = new DatabaseService(dbConfig);
        dbService.driver.connect = jest.fn().mockResolvedValue(true); // Mock the connect method
    
        await dbService.initialize();
        
        expect(dbService.driver.connect).toHaveBeenCalledWith(dbConfig);
        expect(dbService.initialized).toBe(true);
      });

      it('should shut down the database connection pool', async () => {
        const dbConfig = { type: 'mysql', host: 'localhost', user: 'root', password: 'password' };
        dbService = new DatabaseService(dbConfig);
        dbService.driver.close = jest.fn().mockResolvedValue(true); // Mock the close method
        
        dbService.initialized = true; // Assume the service has been initialized
    
        await dbService.shutdown();
    
        expect(dbService.driver.close).toHaveBeenCalled();
        expect(dbService.initialized).toBe(false);
      });

      it('should call findUserByUsername and delegate to driver', async () => {
        const dbConfig = { type: 'mysql', host: 'localhost', user: 'root', password: 'password' };
        dbService = new DatabaseService(dbConfig);
        const mockUser = { username: 'john_doe' };
    
        dbService.driver.findUserByUsername = jest.fn().mockResolvedValue(mockUser); // Mock the driver method
    
        const user = await dbService.findUserByUsername('john_doe');
        
        expect(dbService.driver.findUserByUsername).toHaveBeenCalledWith('john_doe');
        expect(user).toEqual(mockUser);
      });

      it('should call findGroupsByMemberUid and delegate to driver', async () => {
        const dbConfig = { type: 'mysql', host: 'localhost', user: 'root', password: 'password' };
        dbService = new DatabaseService(dbConfig);
      
        const mockGroups = [
          { groupName: 'group1' },
          { groupName: 'group2' }
        ];
      
        dbService.driver.findGroupsByMemberUid = jest.fn().mockResolvedValue(mockGroups);
      
        const groups = await dbService.findGroupsByMemberUid('john_doe');
      
        expect(dbService.driver.findGroupsByMemberUid).toHaveBeenCalledWith('john_doe');
        expect(groups).toEqual(mockGroups);
      });
      
})