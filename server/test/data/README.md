# Test Data Directory

This directory contains **centralized test data** for all backend types and test scenarios. Instead of duplicating test data in multiple places, we maintain a single source of truth here.

## 📁 File Naming Convention

Files follow the pattern: `{purpose}.{backend}.{format}`

- **Purpose**: `common`, `auth`, `directory`
- **Backend**: `sql`, `mongodb`, `proxmox`, `sqlite`
- **Format**: `json`, `sql`, `cfg`, `env`

## 📋 Available Test Data Files

### Common Data (Backend-agnostic)
- **`common.users.json`** - Standard test users with plain passwords
- **`common.groups.json`** - Standard test groups with member lists

### SQL/MySQL Backend
- **`auth.sql.sql`** - User table with bcrypt password hashes for auth tests
- **`directory.sql.sql`** - Users and groups tables for directory tests

### MongoDB Backend
- **`auth.mongodb.json`** - User documents with password hashes for auth tests
- **`directory.mongodb.json`** - User and group documents for directory tests

### SQLite Backend
- **`directory.sqlite.sql`** - SQLite-specific schema and data
- **`directory.sqlite.env`** - SQLite configuration

### Proxmox Backend
- **`auth.proxmox.shadow.cfg`** - Proxmox shadow file format (password hashes)
- **`directory.proxmox.user.cfg`** - Proxmox user configuration format
- **`proxmox.env`** - Proxmox-specific configuration

## 🔧 Usage in Tests

### Using the Data Loader

```javascript
const { 
  loadCommonUsers,
  loadCommonGroups,
  getTestData 
} = require('../utils/dataLoader');

// Load common test data
const users = loadCommonUsers();
const groups = loadCommonGroups();

// Load backend-specific data
const sqlAuthData = getTestData('sql', 'auth');
const mongoDirectoryData = getTestData('mongodb', 'directory');
```

### Using with DB Seeder

```javascript
const { MySQLSeeder } = require('../utils/dbSeeder');

// Seeder automatically loads from data/ directory
const seeder = new MySQLSeeder(connection);
await seeder.seed(); // Uses common.users.json and common.groups.json
```

## 👥 Test Users

All test data files include these standard users:

| Username | Password | UID | GID | Purpose |
|----------|----------|-----|-----|---------|
| `testuser` | `password123` | 1001 | 1001 | Standard test user |
| `admin` | `admin123` | 1000 | 1000 | Admin user tests |
| `jdoe` | `test123` | 1002 | 1001 | Additional user |
| `disabled` | `password` | 1003 | 1001 | Disabled account test |

## 👥 Test Groups

All test data files include these standard groups:

| Group | GID | Members | Purpose |
|-------|-----|---------|---------|
| `users` | 1001 | testuser, jdoe, disabled | Standard users |
| `admins` | 1000 | admin | Administrators |
| `developers` | 1002 | testuser, jdoe | Development team |
| `empty` | 1003 | (none) | Empty group test |

## 🔐 Password Hashes

For authentication tests, passwords are pre-hashed using bcrypt:

```javascript
// Plain passwords (in common.users.json)
{
  "username": "testuser",
  "password": "password123"  // Plain text for reference
}

// Hashed passwords (in auth.*.json/sql)
{
  "username": "testuser",
  "password": "$2b$10$..."  // Bcrypt hash
}
```

## 📝 Adding New Test Data

1. **Create the file** following naming convention
2. **Use existing data as template** for consistency
3. **Update dataLoader.js** to add loader function
4. **Document in this README** with purpose and usage

Example for new backend:

```bash
# Add LDAP backend test data
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

1. **Single source of truth**: No duplicate test data
2. **Easy to maintain**: Update once, used everywhere
3. **Backend-specific**: Each backend gets appropriate format
4. **Discoverable**: Clear naming makes finding data easy
5. **Reusable**: Same data for unit, integration, and E2E tests
6. **Realistic**: Uses actual file formats (SQL, JSON, config files)

## 🔄 Migration from Old Approach

**Before** (scattered data):
- `npm/test/fixtures/testData.js` - Hardcoded JS
- `server/test/fixtures/testData.js` - Duplicate hardcoded JS
- `test/e2e/sql/init.sql` - E2E specific SQL
- Each test creates its own data

**After** (centralized):
- `test/data/*.json` - Common test data
- `test/data/*.sql` - Backend-specific schemas
- `test/utils/dataLoader.js` - Load from files
- `test/utils/dbSeeder.js` - Uses dataLoader

## 📚 Related Files

- **`../utils/dataLoader.js`** - Utility to load data from this directory
- **`../utils/dbSeeder.js`** - Seeds databases using data files
- **`../fixtures/mockProviders.js`** - Mock providers using data files
