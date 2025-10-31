# Quick Start: Creating Your First Custom Backend

This guide walks you through creating a simple custom authentication backend in under 5 minutes.

## Example: Redis Authentication Backend

Let's create a backend that authenticates users against a Redis database.

### Step 1: Install Dependencies

```bash
cd server
npm install redis
```

### Step 2: Create Backend File

Create `server/backends/redis-auth.js`:

```javascript
const { AuthProvider } = require('@ldap-gateway/core');
const redis = require('redis');

class RedisAuthBackend extends AuthProvider {
  constructor(options = {}) {
    super();
    
    // Configure Redis connection from environment
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = null;
    this.connected = false;
    
    // Connect to Redis
    this.connect();
  }

  async connect() {
    try {
      this.client = redis.createClient({
        url: this.redisUrl
      });
      
      this.client.on('error', (err) => {
        console.error('[RedisAuth] Redis error:', err);
        this.connected = false;
      });
      
      this.client.on('connect', () => {
        console.log('[RedisAuth] Connected to Redis');
        this.connected = true;
      });
      
      await this.client.connect();
    } catch (error) {
      console.error('[RedisAuth] Failed to connect:', error);
    }
  }

  async authenticate(username, password, req) {
    if (!this.connected || !this.client) {
      console.error('[RedisAuth] Redis not connected');
      return false;
    }

    try {
      // Get stored password hash for user
      // Expected Redis key format: user:username:password
      const storedHash = await this.client.get(`user:${username}:password`);
      
      if (!storedHash) {
        console.log(`[RedisAuth] User not found: ${username}`);
        return false;
      }
      
      // Simple comparison (in production, use bcrypt or similar)
      const isValid = storedHash === password;
      
      console.log(`[RedisAuth] Authentication ${isValid ? 'success' : 'failed'} for ${username}`);
      return isValid;
    } catch (error) {
      console.error('[RedisAuth] Authentication error:', error);
      return false;
    }
  }

  // Cleanup on shutdown
  async destroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}

module.exports = {
  name: 'redis-auth',
  type: 'auth',
  provider: RedisAuthBackend
};
```

### Step 3: Configure Environment

Add to your `.env` file:

```ini
# Use Redis authentication
AUTH_BACKEND=redis-auth

# Redis connection
REDIS_URL=redis://localhost:6379

# Keep existing directory backend
DIRECTORY_BACKEND=mysql
```

### Step 4: Add Test Data to Redis

```bash
# Connect to Redis CLI
redis-cli

# Add a test user
SET user:testuser:password "testpass"

# Verify
GET user:testuser:password
```

### Step 5: Restart Server

```bash
sudo systemctl restart ldap-gateway

# Or in development
npm run dev
```

### Step 6: Test Authentication

```bash
# Test with ldapwhoami
ldapwhoami -x -H ldaps://localhost:636 \
  -D "uid=testuser,dc=example,dc=com" \
  -w testpass

# Should return: dn:uid=testuser,dc=example,dc=com
```

## 🎉 You're Done!

You've just created a custom authentication backend without modifying any core code!

## Next Steps

### Enhance Your Backend

1. **Add password hashing**:
   ```javascript
   const bcrypt = require('bcrypt');
   const isValid = await bcrypt.compare(password, storedHash);
   ```

2. **Add caching**:
   ```javascript
   this.cache = new Map();
   // Cache successful authentications for 5 minutes
   ```

3. **Add metrics**:
   ```javascript
   this.authAttempts = 0;
   this.authSuccesses = 0;
   ```

4. **Add rate limiting**:
   ```javascript
   const rateLimit = require('express-rate-limit');
   ```

### Create a Directory Backend

Extend the example to also provide user directory information:

```javascript
class RedisDirectoryBackend extends DirectoryProvider {
  async findUser(username) {
    const userData = await this.client.hGetAll(`user:${username}`);
    return {
      uid: username,
      cn: userData.fullName,
      mail: userData.email,
      uidNumber: parseInt(userData.uidNumber),
      gidNumber: parseInt(userData.gidNumber),
      homeDirectory: `/home/${username}`,
      loginShell: '/bin/bash'
    };
  }
  
  async getAllUsers() {
    // Scan Redis for all user keys
    const keys = await this.client.keys('user:*');
    const users = [];
    for (const key of keys) {
      const username = key.split(':')[1];
      const user = await this.findUser(username);
      if (user) users.push(user);
    }
    return users;
  }
  
  // ... implement other methods
}
```

## More Examples

Check out these example backends:
- `custom-auth.example.js` - REST API authentication
- `custom-directory.example.js` - JSON file-based directory
- `../auth/providers/dbBackend.js` - Database authentication
- `../auth/providers/ldapBackend.js` - LDAP delegation

## Troubleshooting

### Backend Not Loading?

1. **Check logs**:
   ```bash
   journalctl -u ldap-gateway -f | grep BackendLoader
   ```

2. **Verify syntax**:
   ```bash
   node -c server/backends/redis-auth.js
   ```

3. **Test module export**:
   ```bash
   node -e "console.log(require('./server/backends/redis-auth.js'))"
   ```

### Authentication Not Working?

1. **Enable debug logging**:
   ```ini
   LOG_LEVEL=debug
   ```

2. **Check Redis connection**:
   ```bash
   redis-cli PING
   ```

3. **Verify user data exists**:
   ```bash
   redis-cli GET user:testuser:password
   ```

## 📚 Additional Resources

- [Backend README](README.md) - Complete interface documentation
- [Template](template.js) - Starter template with all methods
- [Core Interfaces](../../npm/src/interfaces/) - Base classes
- [Tests](../test/backendLoader.test.js) - Testing examples

---

Happy backend building! 🚀
