# Test Data Directory

This directory contains **centralized test data** for all backend types and test scenarios. Instead of duplicating test data in multiple places, we maintain a single source of truth here.

## 📁 File Naming Convention

Files follow the pattern: `{purpose}.{backend}.{format}`

- **Purpose**: `common`, `auth`, `directory`
- **Backend**: `sql`, `mongodb`, `proxmox`, `sqlite`
- **Format**: `json`, `sql`, `cfg`, `env`

## 📋 Available Test Data Files

### Common Data (Used by all SQL/MongoDB backends via seeders)
- **`common.users.json`** - Standard test users with plain passwords (testuser, admin, jdoe, disabled)
- **`common.groups.json`** - Standard test groups with member lists (users, admins, developers, empty)

### Proxmox Backend (File-based configuration format)
- **`auth.proxmox.shadow.cfg`** - Proxmox shadow file format with Unix crypt password hashes (alice, bob, carol)
- **`directory.proxmox.user.cfg`** - Proxmox user.cfg format with user/group definitions (alice, bob, carol)

### E2E Test Data
- **`e2e.sssd.sql`** - MySQL initialization script for SSSD end-to-end tests

### Configuration Files
- **`directory.sqlite.env`** - Environment variables for SQLite shell script tests (`test001-sqlite.sh`)

## 🔧 Usage in Tests

### Using the Data Loader

```javascript
const { 
  loadCommonUsers,
  loadCommonGroups,
  loadProxmoxUserData,
  loadProxmoxShadowData
} = require('../utils/dataLoader');

// Load common test data (for SQL/MongoDB backends)
const users = loadCommonUsers();
const groups = loadCommonGroups();

// Load Proxmox-specific data
const proxmoxUsers = loadProxmoxUserData();
const proxmoxShadow = loadProxmoxShadowData();
```

### Using with DB Seeder

```javascript
const { MySQLSeeder } = require('../utils/dbSeeder');

// Seeder automatically loads from common.users.json and common.groups.json
const seeder = new MySQLSeeder(connection);
await seeder.seed(); // Hashes passwords with bcrypt and inserts into DB
```

## 👥 Test Users

### SQL/MongoDB Backends (from common.users.json)

| Username | Password | UID | GID | Purpose |
|----------|----------|-----|-----|---------|
| `testuser` | `password123` | 1001 | 1001 | Standard test user |
| `admin` | `admin123` | 1000 | 1000 | Admin user tests |
| `jdoe` | `test123` | 1002 | 1001 | Additional user |
| `disabled` | `password` | 1003 | 1001 | Disabled account test |

### Proxmox Backend (from directory.proxmox.user.cfg)

| Username | Password | Realm | Purpose |
|----------|----------|-------|---------|
| `alice` | `alicepass` | pve | Standard test user |
| `bob` | `bobpass` | pve | Additional user |
| `carol` | `carolpass` | pve | Additional user |

## 👥 Test Groups

### SQL/MongoDB Backends (from common.groups.json)

| Group | GID | Members | Purpose |
|-------|-----|---------|---------|
| `users` | 1001 | testuser, jdoe, disabled | Standard users |
| `admins` | 1000 | admin | Administrators |
| `developers` | 1002 | testuser, jdoe | Development team |
| `empty` | 1003 | (none) | Empty group test |

### Proxmox Backend (from directory.proxmox.user.cfg)

| Group | Members | Purpose |
|-------|---------|---------|
| `ldapusers` | alice, bob, carol | All LDAP users |
| `sysadmins` | alice | System administrators |

## 🔐 Password Hashes

### SQL/MongoDB Backends

Passwords from `common.users.json` are hashed at runtime by DB seeders using bcrypt:

```javascript
// Plain passwords (in common.users.json)
{
  "username": "testuser",
  "password": "password123"  // Plain text for reference
}

// Hashed at runtime by seeder
const hash = await bcrypt.hash(user.password, 10);
// INSERT INTO users ... password_hash = '$2b$10$...'
```

### Proxmox Backend

Passwords are pre-hashed using Unix crypt (SHA-256) in `auth.proxmox.shadow.cfg`:

```
alice:$5$h3.sbsBS2v7BXkld$A2PnAw43NHbHCSl/FSm.vmcbwrZNH5MQLoSz45c3NTB:
bob:$5$9wSWJ4H1XqDuqpmS$9OpkAWryhFvB5IrR7yR/3e4y4lWanMmwPJjUisueX75:
carol:$5$dOfGEOt4S4g10frO$jUER2m34iBgLzzHzUvYJ4A4.rrobUAHp5rragC/fQc0:
```

## 📝 Adding New Test Data

### Adding Users/Groups to SQL/MongoDB Backends

1. **Edit `common.users.json`** or **`common.groups.json`**
2. DB seeders automatically hash passwords and insert data
3. No need to update multiple files!

### Adding Proxmox Users

1. **Edit `directory.proxmox.user.cfg`** for user metadata
   ```
   user:newuser@pve:1:0:First:Last:email@example.com:::
   ```

2. **Edit `auth.proxmox.shadow.cfg`** for password hash
   ```bash
   # Generate hash
   mkpasswd -m sha-256 yourpassword
   # Add to file
   newuser:$5$...hash...:
   ```

### Adding a New Backend Type

If you need test data for a completely new backend:

```bash
# Example: Adding LDAP backend test data
touch data/auth.ldap.ldif
touch data/directory.ldap.ldif
```

Then add loader in `dataLoader.js`:

```javascript
function loadLDAPAuthData() {
  return loadText('auth.ldap.ldif');
}
```

## ✅ Benefits of This Approach

1. **Single source of truth**: Common data in one place (common.users.json)
2. **Easy to maintain**: Update users once, seeders handle backend-specific format
3. **Runtime hashing**: Passwords hashed during seeding, not stored in files
4. **Backend-specific when needed**: Proxmox uses .cfg files due to format requirements
5. **Discoverable**: Clear naming makes finding data easy
6. **Reusable**: Same data for unit, integration, and E2E tests

## 🔄 Why This Design?

### Evolution from Backend-Specific Files

**Old approach** (removed):
- `auth.sql.sql`, `directory.sql.sql` - SQL with pre-hashed passwords
- `auth.mongodb.json`, `directory.mongodb.json` - MongoDB with pre-hashed passwords
- `directory.sqlite.sql` - SQLite with pre-hashed passwords

**Problems**:
- ❌ Duplicate user data across multiple files
- ❌ Password hashes duplicated and out of sync
- ❌ Hard to add/modify test users
- ❌ Backend-specific logic mixed with data

**Current approach**:
- ✅ `common.users.json` + `common.groups.json` (single source)
- ✅ DB Seeders transform data to backend-specific format
- ✅ Runtime bcrypt hashing (no pre-hashed files)
- ✅ Easy to maintain and extend

**Exception**: Proxmox keeps separate files because:
- Requires specific file format (user.cfg, shadow.cfg)
- Uses Unix crypt hashing (different from bcrypt)
- Different user set (alice/bob/carol vs testuser/admin/jdoe)

## 📚 Related Files

- **`../utils/dataLoader.js`** - Utility to load data from this directory
- **`../utils/dbSeeder.js`** - Seeds databases using data files
- **`../fixtures/mockProviders.js`** - Mock providers using data files
