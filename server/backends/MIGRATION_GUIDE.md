# Migration Guide: MySQL Backend to SQL Backend

This guide helps you migrate from the legacy `mysql` backend to the new unified `sql` backend.

## Quick Start

The **good news**: If you're happy with MySQL, you don't need to change anything! The old `mysql` backend still works.

The **better news**: If you want to use the new features (PostgreSQL, SQLite, custom queries), the migration is simple.

## Why Migrate?

The new `sql` backend offers:

1. **Multi-dialect support**: MySQL, PostgreSQL, SQLite
2. **Custom queries**: Override default queries for custom schemas
3. **Better architecture**: Cleaner, more maintainable code
4. **Same performance**: No performance impact
5. **Future-proof**: New SQL features will be added here

## Migration Steps

### Step 1: Check Your Current Configuration

Look at your `.env` file for these variables:

```ini
AUTH_BACKENDS=mysql
DIRECTORY_BACKEND=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=rootpassword
MYSQL_DATABASE=ldap_user_db
```

### Step 2: Update Backend Names

Change `mysql` to `sql` and add the `SQL_DRIVER` variable:

```ini
# Old
AUTH_BACKENDS=mysql
DIRECTORY_BACKEND=mysql

# New
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql
SQL_DRIVER=mysql
```

### Step 3: Choose Your Variable Style

You have two options:

#### Option A: Keep MYSQL_* Variables (Backward Compatible)

Just add `SQL_DRIVER` and keep everything else:

```ini
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql
SQL_DRIVER=mysql

# Keep these
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=rootpassword
MYSQL_DATABASE=ldap_user_db
```

#### Option B: Use SQL_* Variables (Recommended)

Replace `MYSQL_*` with `SQL_*`:

```ini
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql

SQL_DRIVER=mysql
SQL_HOST=localhost
SQL_PORT=3306
SQL_USER=root
SQL_PASSWORD=rootpassword
SQL_DATABASE=ldap_user_db
```

### Step 4: Restart the Service

```bash
sudo systemctl restart ldap-gateway
```

### Step 5: Verify

Check the logs to ensure it's working:

```bash
sudo journalctl -u ldap-gateway -f
```

You should see:
```
[SQLAuthProvider] Initializing MYSQL connection...
[SQLAuthProvider] Connected to MYSQL: localhost/ldap_user_db
```

## Testing Your Migration

Test LDAP search to ensure everything works:

```bash
ldapsearch -x -H ldaps://localhost:636 -b "dc=your-domain,dc=com" "(uid=testuser)"
```

Test SSH authentication if you use SSSD:

```bash
ssh testuser@your-server
```

## Rollback Plan

If you encounter issues, rolling back is simple:

### Step 1: Restore Old Configuration

```ini
# Change back to mysql
AUTH_BACKENDS=mysql
DIRECTORY_BACKEND=mysql

# Keep MYSQL_* variables
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=rootpassword
MYSQL_DATABASE=ldap_user_db
```

### Step 2: Restart

```bash
sudo systemctl restart ldap-gateway
```

The old `mysql` backend is unchanged and will work exactly as before.

## Advanced: Switching to PostgreSQL

Once you've migrated to the `sql` backend, switching to PostgreSQL is easy:

### Step 1: Set Up PostgreSQL Database

```bash
# Install PostgreSQL
sudo apt-get install postgresql

# Create database
sudo -u postgres psql -c "CREATE DATABASE ldap_user_db;"
sudo -u postgres psql -c "CREATE USER ldap_user WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ldap_user_db TO ldap_user;"

# Initialize schema
sudo -u postgres psql ldap_user_db < /usr/share/ldap-gateway/sql/init-postgresql.sql
```

### Step 2: Migrate Data

Export from MySQL:

```bash
mysqldump -u root -p ldap_user_db > mysql_backup.sql
```

Import to PostgreSQL (may require syntax conversion):

```bash
# Manual conversion or use migration tools
# This is specific to your data
```

### Step 3: Update Configuration

```ini
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql

SQL_DRIVER=postgresql
SQL_HOST=localhost
SQL_PORT=5432
SQL_USER=ldap_user
SQL_PASSWORD=secure_password
SQL_DATABASE=ldap_user_db
```

### Step 4: Restart and Test

```bash
sudo systemctl restart ldap-gateway
```

## Advanced: Using SQLite

For small deployments or development, SQLite is perfect:

### Step 1: Create SQLite Database

```bash
# Initialize database
sudo mkdir -p /var/lib/ldap-gateway
sudo sqlite3 /var/lib/ldap-gateway/ldap.db < /usr/share/ldap-gateway/sql/init-sqlite.sql
```

### Step 2: Update Configuration

```ini
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql

SQL_DRIVER=sqlite
SQL_DATABASE=/var/lib/ldap-gateway/ldap.db
```

### Step 3: Restart

```bash
sudo systemctl restart ldap-gateway
```

## Troubleshooting

### Issue: "Unknown auth provider type: sql"

**Cause**: Old version of ldap-gateway doesn't have SQL backend.

**Solution**: Update to latest version:
```bash
sudo apt-get update
sudo apt-get upgrade ldap-gateway
```

### Issue: Connection fails after migration

**Cause**: Driver name or credentials incorrect.

**Solution**:
1. Check `SQL_DRIVER` is set correctly (`mysql`, `postgresql`, or `sqlite`)
2. Verify credentials with database client:
   ```bash
   # MySQL
   mysql -h $SQL_HOST -u $SQL_USER -p$SQL_PASSWORD $SQL_DATABASE
   
   # PostgreSQL
   psql -h $SQL_HOST -U $SQL_USER -d $SQL_DATABASE
   
   # SQLite
   sqlite3 $SQL_DATABASE
   ```

### Issue: "Cannot find module 'pg'" or "Cannot find module 'sqlite3'"

**Cause**: Dependencies not installed (shouldn't happen with package install).

**Solution**: Reinstall or install dependencies:
```bash
# Package install (recommended)
sudo apt-get install --reinstall ldap-gateway

# Or if building from source
cd /path/to/LDAPServer/server
npm install
```

### Issue: Old backend still being used

**Cause**: `AUTH_BACKENDS` or `DIRECTORY_BACKEND` still set to `mysql`.

**Solution**: Ensure both are changed to `sql`:
```ini
AUTH_BACKENDS=sql        # Not mysql
DIRECTORY_BACKEND=sql    # Not mysql
SQL_DRIVER=mysql
```

### Issue: "SQL_DRIVER not defined"

**Cause**: Using `sql` backend but didn't specify driver.

**Solution**: Add `SQL_DRIVER`:
```ini
SQL_DRIVER=mysql
```

## FAQs

### Q: Do I need to migrate?

**A:** No! The old `mysql` backend works fine. Migrate when you want new features.

### Q: Will this break my existing setup?

**A:** No. The migration is non-breaking and can be rolled back instantly.

### Q: Can I use both old and new backends?

**A:** No, choose one. But both work with the same database schema.

### Q: Which should I use: MYSQL_* or SQL_* variables?

**A:** Use `SQL_*` for new setups. Use `MYSQL_*` for backward compatibility.

### Q: Does the database schema change?

**A:** No! Same schema for all SQL dialects.

### Q: What about performance?

**A:** Identical. The new backend uses the same underlying drivers.

### Q: Can I mix backends? (e.g., sql for directory, mongodb for auth)

**A:** Yes! Backends are independent:
```ini
DIRECTORY_BACKEND=sql
AUTH_BACKENDS=mongodb
```

## Getting Help

If you encounter issues:

1. **Check logs** with debug level:
   ```ini
   LOG_LEVEL=debug
   ```

2. **Test database connectivity** independently

3. **Review documentation**:
   - [SQL Backend Guide](./SQL_BACKEND_GUIDE.md)
   - [Main README](../../README.md)

4. **Open an issue** on GitHub with:
   - Your configuration (redact credentials)
   - Log output
   - Steps to reproduce

## Summary

Migration is simple:

1. ✅ Change `mysql` → `sql` in backend names
2. ✅ Add `SQL_DRIVER=mysql`
3. ✅ Optionally rename `MYSQL_*` → `SQL_*`
4. ✅ Restart service
5. ✅ Test

Rollback is even simpler:

1. ✅ Change `sql` → `mysql` in backend names
2. ✅ Restart service

No database changes. No downtime. No risk.
