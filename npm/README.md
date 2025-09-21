# @ldap-gateway/core

A reusable LDAP gateway core with pluggable authentication and directory backends.

## Overview

The LDAP Gateway Core provides a modular, event-driven LDAP server implementation that supports pluggable authentication and directory providers. It handles the LDAP protocol operations while delegating authentication and directory lookups to configurable backends.

## Key Components

### LdapEngine

The main LDAP server engine that handles:
- LDAP server creation and lifecycle management
- Bind operations (authentication)
- Search operations (directory queries)
- Error normalization and event emission
- SSL/TLS certificate management

```javascript
const { LdapEngine } = require('@ldap-gateway/core');

const engine = new LdapEngine({
  baseDn: 'dc=example,dc=com',
  port: 636,
  certificate: certContent,
  key: keyContent,
  logger: myLogger
});

await engine.start();
```

### Provider Interfaces

#### AuthProvider

Implement this interface to add custom authentication backends:

```javascript
const { AuthProvider } = require('@ldap-gateway/core');

class MyAuthProvider extends AuthProvider {
  async authenticate(username, password, req) {
    // Your authentication logic here
    // Return true for successful auth, false otherwise
    // Throw error for system failures
    return await myAuthService.verify(username, password);
  }
}
```

**Contract Requirements:**
- `authenticate(username, password, req)` must return a boolean
- Successful authentication returns `true`
- Invalid credentials return `false`
- System errors should throw exceptions (will be normalized to LDAP errors)

#### DirectoryProvider

Implement this interface to add custom directory backends:

```javascript
const { DirectoryProvider } = require('@ldap-gateway/core');

class MyDirectoryProvider extends DirectoryProvider {
  async findUser(username) {
    // Return user object or null
    return await myDirectory.getUser(username);
  }

  async findGroups(filter) {
    // Return array of group objects
    return await myDirectory.searchGroups(filter);
  }

  async getAllUsers() {
    // Return array of all user objects
    return await myDirectory.listUsers();
  }

  async getAllGroups() {
    // Return array of all group objects
    return await myDirectory.listGroups();
  }
}
```

**User Object Contract:**
```javascript
{
  username: string,           // Required: unique user identifier
  full_name?: string,         // Display name
  surname?: string,           // Last name
  mail?: string,              // Email address
  uid_number?: number,        // POSIX UID
  gid_number?: number,        // POSIX primary GID
  home_directory?: string,    // Home directory path
  password?: string           // Hashed password (optional)
}
```

**Group Object Contract:**
```javascript
{
  name: string,               // Required: group name
  gid_number: number,         // Required: POSIX GID
  dn?: string,                // LDAP DN (auto-generated if not provided)
  objectClass?: string[],     // LDAP object classes
  memberUids?: string[],      // Array of member usernames
  members?: string[]          // Array of member DNs
}
```

## Events

The LdapEngine emits events for monitoring and integration:

### Authentication Events
- `bindRequest({ username, anonymous })` - Bind attempt started
- `bindSuccess({ username, anonymous })` - Authentication succeeded
- `bindFail({ username, reason })` - Authentication failed
- `bindError({ username, error })` - Authentication system error

### Search Events
- `searchRequest({ filter, attributes, baseDn, scope })` - Search started
- `searchResponse({ filter, attributes, entryCount, duration })` - Search completed
- `searchError({ filter, error, duration })` - Search failed
- `entryFound({ type, entry })` - Individual entry found

### Server Events
- `started({ port, baseDn, hasCertificate })` - Server started successfully
- `stopped()` - Server stopped
- `startupError(error)` - Server startup failed
- `serverError(error)` - General server error
- `clientError({ error, socket })` - Client connection error

### Notification Events (if enabled)
- `notificationRequest({ username })` - MFA notification sent
- `notificationResponse({ username, action })` - MFA response received

## Utilities

### Filter Utilities
- `extractCredentials(req)` - Extract username/password from bind request
- `getUsernameFromFilter(filterStr)` - Parse username from search filter
- `isAllUsersRequest(filterStr, attributes)` - Detect user listing requests
- `isGroupSearchRequest(filterStr, attributes)` - Detect group search requests
- `isMixedSearchRequest(filterStr)` - Detect mixed search requests

### LDAP Entry Utilities
- `createLdapEntry(user, baseDn)` - Create LDAP entry from user object
- `createLdapGroupEntry(group, baseDn)` - Create LDAP group entry
- `extractDomainFromBaseDn(baseDn)` - Extract domain from base DN

### Error Utilities
- `normalizeAuthError(error)` - Convert auth errors to LDAP errors
- `normalizeSearchError(error)` - Convert search errors to LDAP errors
- `normalizeServerError(error)` - Convert server errors to LDAP errors
- `createErrorResponse(error, context)` - Create structured error response

## Usage Example

```javascript
const { LdapEngine, AuthProvider, DirectoryProvider } = require('@ldap-gateway/core');

// Create custom providers
class DatabaseAuthProvider extends AuthProvider {
  async authenticate(username, password, req) {
    return await db.verifyUser(username, password);
  }
}

class DatabaseDirectoryProvider extends DirectoryProvider {
  async findUser(username) {
    return await db.getUser(username);
  }
  
  async getAllUsers() {
    return await db.listUsers();
  }
  
  async getAllGroups() {
    return await db.listGroups();
  }
  
  async findGroups(filter) {
    return await db.searchGroups(filter);
  }
}

// Create and configure engine
const engine = new LdapEngine({
  baseDn: 'dc=company,dc=com',
  port: 636,
  certificate: fs.readFileSync('cert.pem'),
  key: fs.readFileSync('key.pem'),
  logger: winston.createLogger(...)
});

// Set providers
engine.setAuthProvider(new DatabaseAuthProvider());
engine.setDirectoryProvider(new DatabaseDirectoryProvider());

// Setup event handlers
engine.on('bindSuccess', ({ username }) => {
  console.log(`User ${username} authenticated`);
});

engine.on('searchRequest', ({ filter, attributes }) => {
  console.log(`Search: ${filter}`);
});

// Start the server
await engine.start();
```

## Error Handling

The core automatically normalizes internal errors to appropriate LDAP errors:

- Database connection errors → `UnavailableError`
- Timeout errors → `TimeLimitExceededError`
- Permission errors → `InsufficientAccessRightsError`
- Invalid credentials → `InvalidCredentialsError`
- Not found errors → `NoSuchObjectError`
- Other errors → `OperationsError`

## Best Practices

1. **Provider Implementation**
   - Always handle errors gracefully in providers
   - Return `null` for not found cases, don't throw
   - Use consistent user/group object formats
   - Implement proper connection pooling for database providers

2. **Event Handling**
   - Use events for logging, monitoring, and metrics
   - Don't perform heavy operations in event handlers
   - Consider using async event handlers for I/O operations

3. **Error Handling**
   - Let the core normalize errors automatically
   - Provide meaningful error messages in thrown exceptions
   - Include relevant context in error objects

4. **Performance**
   - Implement caching in providers when appropriate
   - Use connection pooling for database providers
   - Consider pagination for large result sets

## License

MIT