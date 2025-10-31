# Custom LDAP Gateway Backends

This directory contains dynamically loaded backend providers. Backends placed here are loaded at runtime without requiring a rebuild of the application.

## 📁 Directory Structure

```
server/backends/
├── README.md                    # This file
├── template.js                  # Template for creating new backends
├── custom-auth.example.js       # Example authentication backend
└── custom-directory.example.js  # Example directory backend
```

## 🚀 Quick Start

1. **Copy the template**: Start with `template.js` or an example file
2. **Rename the file**: Use a descriptive name (e.g., `redis-auth.js`)
3. **Implement the interface**: Add your backend logic
4. **Configure**: Set `AUTH_BACKEND` or `DIRECTORY_BACKEND` to your backend name
5. **Restart**: The backend loads automatically on server start

## 📝 Backend Structure

Every backend must export an object with three properties:

```javascript
module.exports = {
  name: 'my-backend',           // Unique identifier (used in .env)
  type: 'auth',                 // 'auth' or 'directory'
  provider: class MyBackend {   // Provider class implementation
    // Your methods here
  }
};
```

## 🔐 Authentication Backend Interface

Authentication backends must extend `AuthProvider` and implement:

```javascript
const { AuthProvider } = require('@ldap-gateway/core');

class MyAuthBackend extends AuthProvider {
  constructor(options) {
    super();
    // Initialize with options passed from .env
  }

  /**
   * Authenticate a user
   * @param {string} username - Username to authenticate
   * @param {string} password - Password to verify
   * @param {Object} req - LDAP request object (optional, for context)
   * @returns {Promise<boolean>} True if authenticated
   */
  async authenticate(username, password, req) {
    // Your authentication logic here
    return true; // or false
  }
}
```

## 📂 Directory Backend Interface

Directory backends must extend `DirectoryProvider` and implement:

```javascript
const { DirectoryProvider } = require('@ldap-gateway/core');

class MyDirectoryBackend extends DirectoryProvider {
  constructor(options) {
    super();
    // Initialize with options
  }

  /**
   * Find a specific user
   * @param {string} username - Username to find
   * @returns {Promise<Object|null>} User object or null
   */
  async findUser(username) {
    // Return user object with LDAP attributes
    return {
      uid: username,
      cn: 'Full Name',
      uidNumber: 1000,
      gidNumber: 1000,
      homeDirectory: `/home/${username}`,
      loginShell: '/bin/bash',
      mail: `${username}@example.com`
    };
  }

  /**
   * Get all users
   * @returns {Promise<Array>} Array of user objects
   */
  async getAllUsers() {
    return [];
  }

  /**
   * Find groups (filtered)
   * @param {Object|string} filter - LDAP filter object or parsed filter
   * @returns {Promise<Array>} Array of group objects
   */
  async findGroups(filter) {
    return [];
  }

  /**
   * Get all groups
   * @returns {Promise<Array>} Array of group objects
   */
  async getAllGroups() {
    return [];
  }
}
```

## 🎯 User Object Format

Users should return objects with these standard LDAP attributes:

```javascript
{
  uid: 'username',              // Login name (required)
  cn: 'Full Name',              // Common name (required)
  sn: 'Last',                   // Surname (optional)
  givenName: 'First',           // First name (optional)
  mail: 'user@example.com',     // Email (optional)
  uidNumber: 1000,              // POSIX UID (required for SSH)
  gidNumber: 1000,              // POSIX GID (required for SSH)
  homeDirectory: '/home/user',  // Home directory (required for SSH)
  loginShell: '/bin/bash',      // Login shell (optional)
  userPassword: '{SSHA}...'     // Password hash (optional)
}
```

## 👥 Group Object Format

Groups should return objects with:

```javascript
{
  cn: 'groupname',              // Group name (required)
  gidNumber: 1000,              // POSIX GID (required)
  memberUid: ['user1', 'user2'], // Array of member usernames (required)
  description: 'Group desc'     // Description (optional)
}
```

## ⚙️ Configuration

### Environment Variables

Set your backend in `.env`:

```ini
# Use a dynamic authentication backend
AUTH_BACKEND=my-custom-auth

# Use a dynamic directory backend
DIRECTORY_BACKEND=my-custom-directory

# Optional: Custom backend directory
BACKEND_DIR=/path/to/backends
```

### Passing Options to Backends

Options are passed to your backend constructor. They come from:

1. **Database service**: If using database, pass `databaseService`
2. **LDAP pool**: If using LDAP, pass `ldapServerPool`
3. **Custom paths**: Pass any required file paths or URLs
4. **Environment variables**: Access via `process.env` in constructor

Example in your backend:

```javascript
constructor(options) {
  super();
  this.apiUrl = process.env.MY_API_URL;
  this.apiKey = process.env.MY_API_KEY;
  this.db = options.databaseService; // If passed from factory
}
```

## 🔍 Examples

See the example files:
- `custom-auth.example.js` - Simple API-based authentication
- `custom-directory.example.js` - JSON file-based directory

## 🐛 Debugging

Enable debug logging:

```ini
LOG_LEVEL=debug
```

Watch for backend loading messages:

```
[BackendLoader] Scanning for backends in: /path/to/backends
[BackendLoader] Registered auth backend: my-backend from my-backend.js
[BackendLoader] Loaded 1 auth backends
```

## ⚠️ Important Notes

### File Naming
- Use `.js` extension
- Avoid `.example.js` suffix (those are skipped)
- Don't name your file `template.js` (skipped)

### Security
- Only load backends from trusted sources
- Validate all user input in your backend
- Use environment variables for secrets (never hardcode)
- Consider implementing rate limiting

### Performance
- Backends are loaded once at startup
- Cache data when possible to reduce external calls
- Use connection pooling for databases
- Implement timeouts for external APIs

### Error Handling
- Always use try/catch for async operations
- Return `false` for failed authentication (don't throw)
- Return empty arrays for not-found queries
- Log errors with the logger utility

## 🧪 Testing Your Backend

Before deploying:

1. **Test authentication**:
   ```bash
   ldapwhoami -x -H ldaps://localhost:636 -D "uid=test,dc=example,dc=com" -W
   ```

2. **Test user search**:
   ```bash
   ldapsearch -x -H ldaps://localhost:636 -b "dc=example,dc=com" "(uid=test)"
   ```

3. **Test group search**:
   ```bash
   ldapsearch -x -H ldaps://localhost:636 -b "dc=example,dc=com" "(objectClass=posixGroup)"
   ```

4. **Test SSH**:
   ```bash
   ssh test@localhost -p 2222
   ```

## 📚 Additional Resources

- [LDAP Gateway Core Documentation](../npm/README.md)
- [AuthProvider Interface](../npm/src/interfaces/AuthProvider.js)
- [DirectoryProvider Interface](../npm/src/interfaces/DirectoryProvider.js)
- [Existing Backend Examples](../server/auth/providers/)

## 🆘 Getting Help

If your backend isn't loading:

1. Check logs for validation errors
2. Ensure all required methods are implemented
3. Verify the module exports structure matches the template
4. Test the backend file with `node -c your-backend.js` (syntax check)
5. Review example files for reference patterns
