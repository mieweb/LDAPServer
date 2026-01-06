# Test Data Directory

This directory contains **centralized test data** for all backend integration tests. Test data is organized by purpose and backend type, with a single source of truth for shared data.

## � File Organization

### Common Data (SQL/MongoDB Backends)
- **`common.users.json`** - Standard test users (testuser, admin, jdoe, disabled)
- **`common.groups.json`** - Standard test groups with membership (users, admins, developers, empty)

These files contain plain-text passwords that are hashed at runtime by database seeders.

### Proxmox Backend
- **`auth.proxmox.shadow.cfg`** - Shadow file with Unix crypt password hashes
- **`directory.proxmox.user.cfg`** - User and group definitions in Proxmox format

Proxmox uses its own file format and user set (alice, bob, carol) due to its file-based configuration requirements.

### End-to-End Tests
- **`e2e.sssd.sql`** - MySQL initialization script for SSSD integration tests

### Configuration
- **`directory.sqlite.env`** - Environment variables for SQLite shell script tests

## 🔧 Usage

### Loading Test Data

```javascript
const { 
  loadCommonUsers,
  loadCommonGroups,
  loadProxmoxUserData,
  loadProxmoxShadowData
} = require('../utils/dataLoader');

// Load common test data
const users = loadCommonUsers();      // SQL/MongoDB backends
const groups = loadCommonGroups();

// Load Proxmox-specific data
const proxmoxUsers = loadProxmoxUserData();
const proxmoxShadow = loadProxmoxShadowData();
```

### Using Database Seeders

```javascript
const { MySQLSeeder, MongoDBSeeder } = require('../utils/dbSeeder');

// MySQL
const mysqlSeeder = new MySQLSeeder(connection);
await mysqlSeeder.seed();

// MongoDB
const mongoSeeder = new MongoDBSeeder(db);
await mongoSeeder.seed();
```

Seeders automatically:
- Load data from `common.users.json` and `common.groups.json`
- Hash passwords with bcrypt (10 rounds)
- Transform data to backend-specific format
- Insert into database

## 👥 Test Users

### SQL/MongoDB Backends

| Username | Password | UID | GID | Full Name | Email |
|----------|----------|-----|-----|-----------|-------|
| `testuser` | `password123` | 1001 | 1001 | Test User | testuser@example.com |
| `admin` | `admin123` | 1000 | 1000 | Administrator | admin@example.com |
| `jdoe` | `test123` | 1002 | 1001 | John Doe | jdoe@example.com |
| `disabled` | `password` | 1003 | 1001 | Disabled User | disabled@example.com |

### Proxmox Backend

| Username | Password | Realm | Groups |
|----------|----------|-------|---------|
| `alice` | `alicepass` | pve | ldapusers, sysadmins |
| `bob` | `bobpass` | pve | ldapusers |
| `carol` | `carolpass` | pve | ldapusers |

## 👥 Test Groups

### SQL/MongoDB Backends

| Group | GID | Members | Description |
|-------|-----|---------|-------------|
| `users` | 1001 | testuser, jdoe, disabled | Standard users group |
| `admins` | 1000 | admin | System administrators |
| `developers` | 1002 | testuser, jdoe | Development team |
| `empty` | 1003 | _(none)_ | Empty group for testing |

### Proxmox Backend

| Group | Members |
|-------|---------|
| `ldapusers` | alice, bob, carol |
| `sysadmins` | alice |
| `proxmox-sudo` | alice |

## 🔐 Password Handling

### SQL/MongoDB Backends (Runtime Hashing)

Passwords are stored in plain text in `common.users.json` and hashed at runtime:

```javascript
// In common.users.json
{
  "username": "testuser",
  "password": "password123"  // Plain text
}

// Seeder hashes at runtime
const hash = await bcrypt.hash(user.password, 10);
// → $2b$10$DJylnYTJZBhXqzYDV62nTOCW3/6ytjmXITpGo.tSqR5eCppmERflS
```

**Why runtime hashing?**
- Easy to update bcrypt rounds if needed
- Clear what the actual passwords are
- No risk of hash mismatches

### Proxmox Backend (Pre-hashed)

Uses Unix crypt (SHA-256) in `auth.proxmox.shadow.cfg`:

```
alice:$5$h3.sbsBS2v7BXkld$A2PnAw43NHbHCSl/FSm.vmcbwrZNH5MQLoSz45c3NTB:
```

**Why pre-hashed?**
- Proxmox requires specific shadow file format
- File is loaded directly, not processed by Node.js

### E2E Tests (Pre-hashed)

The `e2e.sssd.sql` file contains pre-hashed passwords:

```sql
-- Password: 'password123' (bcrypt hashed with 10 rounds)
-- Pre-hashed because this SQL is loaded directly by MySQL, not processed by Node.js
INSERT INTO users ... '$2b$10$DJylnYTJZBhXqzYDV62nTOCW3/6ytjmXITpGo.tSqR5eCppmERflS' ...
```

**Why pre-hashed?**
- SQL file loaded directly by MySQL Docker init
- Cannot hash at runtime

## 📝 Adding New Test Data

### Adding Users to SQL/MongoDB Tests

Edit `common.users.json`:

```json
{
  "username": "newuser",
  "password": "plaintext123",
  "uid_number": 1004,
  "gid_number": 1001,
  "full_name": "New User",
  "surname": "User",
  "given_name": "New",
  "mail": "newuser@example.com",
  "home_directory": "/home/newuser",
  "login_shell": "/bin/bash",
  "enabled": true
}
```

All seeders will automatically pick up the new user.

### Adding Groups

Edit `common.groups.json`:

```json
{
  "cn": "newgroup",
  "gid_number": 1004,
  "description": "New test group",
  "member_uids": ["testuser", "newuser"]
}
```

### Adding Proxmox Users

1. Add user to `directory.proxmox.user.cfg`:
   ```
   user:newuser@pve:1:0:First:Last:email@example.com:::
   ```

2. Generate password hash and add to `auth.proxmox.shadow.cfg`:
   ```bash
   mkpasswd -m sha-256 yourpassword
   ```
   ```
   newuser:$5$...hash...:
   ```

### Updating E2E Test Data

Edit `e2e.sssd.sql` and regenerate password hashes:

```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('yourpassword', 10).then(h => console.log(h));"
```

## 🏗️ Architecture Design

### Why Centralized Data?

**Benefits:**
- ✅ Single source of truth for test data
- ✅ Easy to add/modify test users globally
- ✅ Runtime hashing keeps passwords visible
- ✅ Seeders handle backend-specific transformations
- ✅ Same data reused across unit, integration, and E2E tests

### Why Backend-Specific Files?

Some backends require their own data files:

**Proxmox:**
- Requires specific file formats (user.cfg, shadow.cfg)
- Uses different encryption (Unix crypt vs bcrypt)
- Serves as realistic test data matching production format

**E2E Tests:**
- SQL loaded directly by MySQL Docker
- No opportunity for runtime processing
- Pre-hashed passwords are necessary

### Data Flow

```
common.users.json → DB Seeder → Runtime bcrypt → SQL/MongoDB Database
                                      ↓
                              password123 → $2b$10$...

directory.proxmox.user.cfg → DirectoryProvider → LDAP Entries
auth.proxmox.shadow.cfg    → AuthProvider      → Password Verification

e2e.sssd.sql → MySQL Docker Init → Test Database
```

## 📚 Related Files

- **`../utils/dataLoader.js`** - Functions to load data files
- **`../utils/dbSeeder.js`** - Database seeders for all SQL backends
- **`../fixtures/testData.js`** - Test constants and LDAP filters
- **`../fixtures/mockProviders.js`** - Mock auth/directory providers
