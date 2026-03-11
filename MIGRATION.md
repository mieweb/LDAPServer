# Migration Guide: v0.x → v1.x

This guide helps you migrate from the monolithic LDAP server (v0.x) to the new modular architecture (v1.x).

## 🔄 Architecture Changes

### Before (v0.x - Monolithic)
```
LDAPServer/
├── src/
│   ├── server.js          # Main server
│   ├── auth/providers/    # Auth backends  
│   ├── services/          # Database services
│   └── utils/             # Utilities
└── package.json           # Single package
```

### After (v1.x - Modular)
```
LDAPServer/
├── npm/                   # @ldap-gateway/core (reusable)
│   ├── src/interfaces/    # Provider interfaces
│   ├── src/utils/         # Core utilities
│   └── src/LdapEngine.js  # Main engine
├── server/                # ldap-gateway-server (standalone)
│   ├── src/providers.js   # Provider factory
│   └── serverMain.js      # Server implementation
└── package.json           # Workspace coordinator
```

## 📦 Installation Migration

### Old Installation
```bash
git clone repo
cd LDAPServer
npm install
cp src/.env.example src/.env
node src/server.js
```

### New Installation

#### Option 1: Binary (Recommended)
```bash
curl -LO https://github.com/mieweb/LDAPServer/releases/latest/download/ldap-gateway-linux.tar.gz
tar -xzf ldap-gateway-linux.tar.gz
sudo ./install.sh
systemctl start ldap-gateway
```

#### Option 2: Development
```bash
git clone repo
cd LDAPServer
npm install
cp server/.env.example server/.env
npm run dev
```

## ⚙️ Configuration Migration

### File Location Changes
| Old Location | New Location | Notes |
|--------------|--------------|-------|  
| `src/.env` | `server/.env` | Development setup |
| `src/.env` | `/etc/ldap-gateway/.env` | Production (binary install) |

### Environment Variables
**Configuration syntax has changed** - backend names and SQL configuration updated:

```ini
# Backend names changed from 'mysql' to 'sql'
DIRECTORY_BACKEND=sql      # Changed from 'mysql'
AUTH_BACKENDS=sql,ldap     # Changed from 'mysql,ldap'

# SQL configuration now uses connection URL and custom queries
SQL_URL=mysql://user:password@localhost:3306/database  # Replaces MYSQL_HOST, MYSQL_PORT, etc.
SQL_QUERY_ONE_USER='SELECT * FROM users WHERE username = ?'
SQL_QUERY_ALL_USERS='SELECT * FROM users'
SQL_QUERY_GROUPS_BY_MEMBER='SELECT * FROM groups WHERE member = ?'
SQL_QUERY_ALL_GROUPS='SELECT * FROM groups'

# Other settings remain the same
LDAP_BIND_DN=...
# etc.
```

## 🔧 Custom Code Migration

### If You Extended the Core Server

#### Old Pattern (v0.x)
```javascript
// src/server.js modifications
const ldap = require('ldapjs');
const server = ldap.createServer();

server.bind('...', (req, res, next) => {
  // Custom authentication logic
});
```

#### New Pattern (v1.x)
```javascript
// Use @ldap-gateway/core for reusable components
const { LdapEngine, AuthProvider } = require('@ldap-gateway/core');

class MyCustomAuthProvider extends AuthProvider {
  async authenticate(username, password, req) {
    // Your custom logic here
    return { success: true, user: {...} };
  }
}

const engine = new LdapEngine({
  authProvider: new MyCustomAuthProvider(),
  // ... other config
});
```

### If You Added Custom Backends

#### Old Pattern (v0.x)
```javascript
// src/auth/providers/auth/myBackend.js
class MyBackend {
  async authenticate(username, password) {
    // Custom logic
  }
}
```

#### New Pattern (v1.x)
```javascript
// npm/src/providers/MyAuthProvider.js
const { AuthProvider } = require('@ldap-gateway/core');

class MyAuthProvider extends AuthProvider {
  async authenticate(username, password, req) {
    // Same logic, enhanced interface
    return { success: true, user: {...} };
  }
}

// Register via Provider Factory
// server/src/providers.js
const providers = {
  auth: {
    // ...existing
    my: () => new MyAuthProvider()
  }
};
```

## 🚀 Deployment Migration

### Docker Migration

#### Old Dockerfile Pattern
```dockerfile
FROM node:24
COPY src/ /app/src/
COPY package.json /app/
RUN npm install
CMD ["node", "src/server.js"]
```

#### New Dockerfile Pattern
```dockerfile
FROM node:24
# Option 1: Use binary release
COPY ldap-gateway /usr/local/bin/
CMD ["ldap-gateway"]

# Option 2: Use workspace
COPY package.json /app/
COPY npm/ /app/npm/
COPY server/ /app/server/
RUN npm install
CMD ["npm", "run", "start"]
```

### Systemd Service Migration

#### Old Service
```ini
[Unit]
Description=LDAP Server
After=network.target

[Service]
Type=simple
User=ldap
WorkingDirectory=/opt/ldapserver
ExecStart=/usr/bin/node src/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

#### New Service (Auto-installed)
```ini
[Unit]
Description=LDAP Gateway
After=network.target

[Service]
Type=simple
User=ldap-gateway
WorkingDirectory=/opt/ldap-gateway
ExecStart=/usr/local/bin/ldap-gateway
EnvironmentFile=/etc/ldap-gateway/.env
Restart=always

[Install]
WantedBy=multi-user.target
```

## 🧪 Testing Migration

### Verify Migration Success

1. **Configuration Test**
   ```bash
   # Old: Check manually
   cat src/.env
   
   # New: Built-in validation
   ldap-gateway --config-test
   ```

2. **Service Test**
   ```bash
   # Same LDAP queries work
   ldapsearch -x -H ldaps://localhost:636 -b "dc=company,dc=com" "(uid=test)"
   ```

3. **Authentication Test**
   ```bash
   # Same SSH authentication
   ssh test@ldap-client-host
   ```

## 🔧 Troubleshooting

### Common Issues

#### "Cannot find module" errors
**Cause**: Old import paths
**Solution**: Use new module structure
```javascript
// Old 
const utils = require('./src/utils/ldapUtils');

// New
const { ldapUtils } = require('@ldap-gateway/core');
```

#### "Permission denied" on binary
**Cause**: Binary not executable
**Solution**: 
```bash
chmod +x /usr/local/bin/ldap-gateway
```

#### "Config file not found"
**Cause**: Config file in old location
**Solution**:
```bash
# Copy to new location
sudo cp src/.env /etc/ldap-gateway/.env
# Or set explicit path
ldap-gateway --config=/path/to/.env
```

## 📋 Migration Checklist

- [ ] **Backup** existing configuration files
- [ ] **Install** new version (binary/package/source)
- [ ] **Copy** `.env` to new location
- [ ] **Test** configuration with `ldap-gateway --config-test`
- [ ] **Start** new service
- [ ] **Verify** LDAP queries work
- [ ] **Test** authentication flows
- [ ] **Update** monitoring/logging paths
- [ ] **Remove** old installation

## 🆘 Need Help?

- **Slack**: #ldap-gateway
- **Issues**: [GitHub Issues](https://github.com/mieweb/LDAPServer/issues)
- **Email**: support@mieweb.com

---

## 🎯 Benefits of Migration

- ✅ **Modular Architecture** - Reusable core package
- ✅ **Better Packaging** - .deb/.rpm packages with systemd
- ✅ **Improved Testing** - Automated CI/CD pipeline
- ✅ **Documentation** - Comprehensive API docs
- ✅ **Distribution** - Multiple install options
- ✅ **Backward Compatibility** - Same configuration format