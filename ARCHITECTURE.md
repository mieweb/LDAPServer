# SQL Backend Architecture

This document describes the architecture of the multi-dialect SQL backend support.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     LDAP Gateway Server                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Backend Layer                                 │ │
│  │                                                            │ │
│  │  ┌──────────────────┐       ┌─────────────────┐          │ │
│  │  │   sql.auth.js    │       │ sql.directory.js│          │ │
│  │  │  (Generic SQL    │       │  (Generic SQL   │          │ │
│  │  │  Authentication) │       │   Directory)    │          │ │
│  │  └────────┬─────────┘       └────────┬────────┘          │ │
│  └───────────┼──────────────────────────┼───────────────────┘ │
│              │                          │                       │
│  ┌───────────┼──────────────────────────┼───────────────────┐ │
│  │           │   Driver Factory Layer   │                   │ │
│  │           │                          │                   │ │
│  │     ┌─────▼──────────────────────────▼─────┐            │ │
│  │     │      SqlDriverFactory                │            │ │
│  │     │  • Creates appropriate driver        │            │ │
│  │     │  • Reads configuration              │            │ │
│  │     │  • Manages driver lifecycle         │            │ │
│  │     └─────┬──────────────────────┬─────────┘            │ │
│  └───────────┼──────────────────────┼──────────────────────┘ │
│              │                      │                         │
│  ┌───────────┼──────────────────────┼──────────────────────┐ │
│  │  Driver   │                      │                      │ │
│  │  Layer    │                      │                      │ │
│  │           │                      │                      │ │
│  │     ┌─────▼──────┐   ┌──────────▼───┐   ┌────────────┐ │ │
│  │     │   MySQL    │   │ PostgreSQL   │   │   SQLite   │ │ │
│  │     │   Driver   │   │    Driver    │   │   Driver   │ │ │
│  │     └─────┬──────┘   └──────┬───────┘   └──────┬─────┘ │ │
│  │           │                 │                  │       │ │ │
│  │     ┌─────▼─────────────────▼──────────────────▼─────┐ │ │
│  │     │             BaseSqlDriver                       │ │ │
│  │     │  • Abstract interface                          │ │ │
│  │     │  • Common utilities                            │ │ │
│  │     │  • Placeholder conversion                      │ │ │
│  │     └────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
│              │                 │                  │            │
└──────────────┼─────────────────┼──────────────────┼────────────┘
               │                 │                  │
         ┌─────▼──────┐   ┌──────▼───────┐   ┌────▼────────┐
         │   MySQL    │   │ PostgreSQL   │   │   SQLite    │
         │  Database  │   │   Database   │   │  Database   │
         └────────────┘   └──────────────┘   └─────────────┘
```

## Component Responsibilities

### Backend Layer

#### sql.auth.js
- Implements `AuthProvider` interface
- Uses `SqlDriverFactory` to get appropriate driver
- Delegates authentication to driver
- Handles initialization and cleanup

#### sql.directory.js
- Implements `DirectoryProvider` interface
- Uses `SqlDriverFactory` to get appropriate driver
- Provides user/group lookup functionality
- Handles LDAP filter parsing

### Driver Factory Layer

#### SqlDriverFactory
- **Responsibility**: Create and configure SQL drivers
- **Methods**:
  - `createDriver(type, config)` - Instantiate driver
  - `getConfigFromEnv()` - Read environment variables
  - `getDefaultPort(driver)` - Get default port per dialect
  - `getSupportedDrivers()` - List available drivers

### Driver Layer

#### BaseSqlDriver (Abstract)
- Defines interface all drivers must implement
- Provides utility methods (placeholder conversion)
- Enforces consistent API across dialects

#### MySQLDriver
- Extends `BaseSqlDriver`
- Uses `mysql2` package
- Implements MySQL-specific queries
- JSON operations with `JSON_CONTAINS()`
- Connection pooling (10 connections)

#### PostgreSQLDriver
- Extends `BaseSqlDriver`
- Uses `pg` package
- Implements PostgreSQL-specific queries
- JSONB operations with `?` operator
- Placeholder conversion (? → $1, $2)
- Connection pooling (10 connections)

#### SQLiteDriver
- Extends `BaseSqlDriver`
- Uses `sqlite3` package
- Implements SQLite-specific queries
- JSON operations with JSON1 extension
- File-based database (no pooling)

## Data Flow

### Authentication Flow

```
1. User attempts to authenticate
   ↓
2. sql.auth.js receives request
   ↓
3. SqlDriverFactory creates appropriate driver
   ↓
4. Driver connects to database
   ↓
5. Driver executes findUserByUsername(username)
   ↓
6. Database returns user record
   ↓
7. sql.auth.js validates password
   ↓
8. Returns authentication result
```

### Directory Lookup Flow

```
1. LDAP search request received
   ↓
2. sql.directory.js receives request
   ↓
3. SqlDriverFactory creates appropriate driver
   ↓
4. Driver connects to database
   ↓
5. Driver executes appropriate query:
   - findUser(username)
   - getAllUsers()
   - findGroups(filter)
   - getAllGroups()
   ↓
6. Database returns records
   ↓
7. sql.directory.js formats as LDAP entries
   ↓
8. Returns LDAP response
```

## Configuration Flow

```
Environment Variables (.env)
   ↓
SqlDriverFactory.getConfigFromEnv()
   ↓
Configuration Object {
  driver: 'mysql' | 'postgresql' | 'sqlite',
  host: string,
  port: number,
  user: string,
  password: string,
  database: string,
  queries: {
    findUserByUsername?: string,
    findGroupsByMemberUid?: string,
    getAllUsers?: string,
    getAllGroups?: string
  }
}
   ↓
SqlDriverFactory.createDriver(driver, config)
   ↓
Appropriate Driver Instance
```

## Placeholder Conversion (PostgreSQL)

MySQL and SQLite use `?` placeholders, PostgreSQL uses `$1`, `$2`, etc.

```
Query with ? placeholders:
"SELECT * FROM users WHERE username = ? AND active = ?"

PostgreSQL Driver converts to:
"SELECT * FROM users WHERE username = $1 AND active = $2"

This happens automatically in PostgreSQLDriver._executeCustomQuery()
```

## Custom Query Support

Users can override default queries:

```ini
SQL_QUERY_FIND_USER=SELECT * FROM employees WHERE login = ?
```

Flow:
```
1. Driver receives findUserByUsername(username) call
   ↓
2. Check if config.queries.findUserByUsername is set
   ↓
3. If set: Use custom query
   If not: Use default query
   ↓
4. Execute query with parameters
   ↓
5. Return result
```

## Error Handling

```
Try {
  1. Initialize driver
  2. Connect to database
  3. Execute query
  4. Return results
} Catch (error) {
  1. Log error with context
  2. Return appropriate error response
  3. Ensure connection cleanup
} Finally {
  1. Release connection (pooled drivers)
  2. Update state
}
```

## Backward Compatibility

The system maintains compatibility with legacy MySQL backend:

```
Legacy Configuration:
AUTH_BACKENDS=mysql
DIRECTORY_BACKEND=mysql
MYSQL_HOST=localhost
   ↓
Still works with mysql.auth.js and mysql.directory.js
   ↓
Uses original MySQL driver directly

New Configuration:
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql
SQL_DRIVER=mysql
MYSQL_HOST=localhost  ← Still supported!
   ↓
Uses sql.auth.js and sql.directory.js
   ↓
SqlDriverFactory creates MySQLDriver
   ↓
Same functionality, cleaner architecture
```

## Extension Points

### Adding a New SQL Dialect

1. Create new driver class extending `BaseSqlDriver`
2. Implement required methods:
   - `connect(config)`
   - `close()`
   - `query(sql, params)`
   - `findUserByUsername(username)`
   - `findGroupsByMemberUid(username)`
   - `getAllUsers()`
   - `getAllGroups()`
3. Add driver to `SqlDriverFactory.createDriver()` switch
4. Add default port to `SqlDriverFactory.getDefaultPort()`
5. Update `getSupportedDrivers()` list
6. Create initialization SQL script
7. Add documentation and examples

### Custom Backend

Users can create custom backends that use the SQL drivers:

```javascript
const { AuthProvider } = require('@ldap-gateway/core');
const SqlDriverFactory = require('../db/drivers/sqlDriverFactory');

class CustomAuthProvider extends AuthProvider {
  constructor() {
    super();
    const config = SqlDriverFactory.getConfigFromEnv();
    this.driver = SqlDriverFactory.createDriver(config.driver, config);
  }

  async authenticate(username, password) {
    // Custom authentication logic using this.driver
  }
}
```

## Performance Characteristics

### MySQL/MariaDB
- Connection pooling: 10 connections
- Query optimization: Uses indexes
- JSON operations: Native JSON type
- Suitable for: Production, large deployments

### PostgreSQL
- Connection pooling: 10 connections
- Query optimization: Uses indexes
- JSON operations: Native JSONB type
- Suitable for: Production, large deployments

### SQLite
- No connection pooling (single connection)
- Query optimization: Uses indexes
- JSON operations: JSON1 extension
- Suitable for: Development, small deployments (<1000 users)

## Security Considerations

1. **SQL Injection Prevention**: All queries use parameterized statements
2. **Connection Credentials**: Never logged in plaintext
3. **Password Storage**: TODO - implement bcrypt/argon2
4. **Custom Queries**: User-provided, must be validated
5. **Connection Pooling**: Limits concurrent connections
6. **Error Messages**: Don't expose sensitive information

## Testing Strategy

### Unit Tests
- Test each driver class independently
- Mock database connections
- Test placeholder conversion
- Test error handling

### Integration Tests
- Test actual database connectivity
- Test query execution
- Test all CRUD operations
- Test with real data

### End-to-End Tests
- Test through LDAP protocol
- Test authentication flow
- Test directory lookup
- Test with SSSD client

## Monitoring & Debugging

Enable debug logging:
```ini
LOG_LEVEL=debug
```

Logs include:
- Driver creation and initialization
- Database connections
- Query execution
- Error details with stack traces
- Performance metrics (query time)

## Future Enhancements

1. **Additional Drivers**
   - Microsoft SQL Server
   - Oracle Database
   - MariaDB-specific optimizations

2. **Features**
   - Query result caching
   - Connection pool tuning
   - Automatic schema migration
   - Health check endpoints
   - Metrics/monitoring integration

3. **Optimizations**
   - Prepared statement caching
   - Batch operations
   - Read replicas support
   - Query plan optimization
