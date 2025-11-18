# SQL Backend Guide

The LDAP Gateway now supports multiple SQL database dialects through a unified SQL backend. This allows you to use MySQL/MariaDB, PostgreSQL, or SQLite as your authentication and directory backend.

## Overview

The SQL backend provides:
- **Multi-dialect support**: MySQL/MariaDB, PostgreSQL, and SQLite
- **Unified configuration**: Single set of environment variables works across all dialects
- **Custom queries**: Override default queries for your specific schema
- **Backward compatibility**: Existing MYSQL_* variables still work

## Configuration

### Basic Setup

To use the SQL backend, set these environment variables in your `.env` file:

```ini
# Use sql backend
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql

# Choose your SQL dialect
SQL_DRIVER=mysql              # Options: mysql, postgresql, sqlite

# Connection settings
SQL_HOST=localhost
SQL_PORT=3306                 # 3306 for MySQL, 5432 for PostgreSQL
SQL_USER=your_user
SQL_PASSWORD=your_password
SQL_DATABASE=ldap_user_db
```

### MySQL/MariaDB Configuration

```ini
SQL_DRIVER=mysql
SQL_HOST=localhost
SQL_PORT=3306
SQL_USER=root
SQL_PASSWORD=rootpassword
SQL_DATABASE=ldap_user_db
```

**Backward Compatibility**: The old `MYSQL_*` variables still work:
```ini
# These are equivalent to SQL_* variables above
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=rootpassword
MYSQL_DATABASE=ldap_user_db
```

### PostgreSQL Configuration

```ini
SQL_DRIVER=postgresql         # or 'postgres' or 'pg'
SQL_HOST=localhost
SQL_PORT=5432
SQL_USER=postgres
SQL_PASSWORD=your_password
SQL_DATABASE=ldap_user_db
```

### SQLite Configuration

For SQLite, specify the database file path:

```ini
SQL_DRIVER=sqlite             # or 'sqlite3'
SQL_DATABASE=/path/to/database.sqlite
# or use SQL_FILENAME
SQL_FILENAME=/var/lib/ldap-gateway/ldap.db
```

SQLite doesn't use host, port, user, or password settings.

## Database Schema

All SQL dialects use the same logical schema with three main tables:

### Users Table
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(100),
  email VARCHAR(100),
  uid_number INTEGER UNIQUE,
  gid_number INTEGER,
  home_directory VARCHAR(200)
);
```

### Groups Table
```sql
CREATE TABLE groups (
  gid_number INTEGER PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(200),
  member_uids JSON/JSONB NOT NULL  -- Array of usernames
);
```

### User Groups Table (for secondary groups)
```sql
CREATE TABLE user_groups (
  user_id INTEGER,
  group_id INTEGER,
  PRIMARY KEY (user_id, group_id)
);
```

### Initializing the Database

Initialization scripts are provided in `docker/sql/`:

**MySQL**:
```bash
mysql -u root -p < docker/sql/init.sql
```

**PostgreSQL**:
```bash
psql -U postgres -d ldap_user_db -f docker/sql/init-postgresql.sql
```

**SQLite**:
```bash
sqlite3 /path/to/database.sqlite < docker/sql/init-sqlite.sql
```

## Custom Queries

If your database schema differs from the default, you can provide custom SQL queries:

```ini
# Custom query to find a user (use ? for placeholders)
SQL_QUERY_FIND_USER=SELECT * FROM my_users WHERE user_name = ?

# Custom query to find groups by member
SQL_QUERY_FIND_GROUPS_BY_MEMBER=SELECT g.* FROM my_groups g JOIN my_memberships m ON g.id = m.group_id WHERE m.username = ?

# Custom query to get all users
SQL_QUERY_GET_ALL_USERS=SELECT * FROM my_users WHERE active = 1

# Custom query to get all groups
SQL_QUERY_GET_ALL_GROUPS=SELECT g.id as gid_number, g.name, GROUP_CONCAT(u.username) as member_uids FROM my_groups g LEFT JOIN my_users u ON u.group_id = g.id GROUP BY g.id
```

**Important Notes**:
- Use `?` as the placeholder for all dialects (the driver converts to `$1`, `$2` for PostgreSQL automatically)
- Ensure your custom queries return columns matching the expected schema
- For `findUserByUsername`: return user object with at least `username` and `password`
- For `findGroupsByMemberUid`: return groups with `name`, `gid_number`, and `member_uids`
- For `getAllUsers`: return array of user objects
- For `getAllGroups`: return groups with `id`, `name`, `gid_number`, and `member_uids`

## JSON Handling

Different SQL dialects handle JSON differently:

### MySQL
Uses JSON type with `JSON_CONTAINS` for queries:
```sql
SELECT * FROM groups WHERE JSON_CONTAINS(member_uids, JSON_QUOTE(?))
```

### PostgreSQL
Uses JSONB type with `?` operator:
```sql
SELECT * FROM groups WHERE member_uids::jsonb ? $1
```

### SQLite
Uses JSON1 extension with `json_each`:
```sql
SELECT * FROM groups WHERE EXISTS (
  SELECT 1 FROM json_each(member_uids) WHERE json_each.value = ?
)
```

The SQL drivers handle these differences automatically.

## Migration Guide

### From MySQL Backend to SQL Backend

If you're currently using `mysql` backend:

1. **Update backend names** in `.env`:
   ```ini
   # Old
   AUTH_BACKENDS=mysql
   DIRECTORY_BACKEND=mysql
   
   # New
   AUTH_BACKENDS=sql
   DIRECTORY_BACKEND=sql
   SQL_DRIVER=mysql
   ```

2. **Keep existing MYSQL_* variables** (backward compatible):
   ```ini
   # These still work!
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=root
   MYSQL_PASSWORD=rootpassword
   MYSQL_DATABASE=ldap_user_db
   ```

3. **Or migrate to SQL_* variables** (recommended):
   ```ini
   SQL_DRIVER=mysql
   SQL_HOST=localhost
   SQL_PORT=3306
   SQL_USER=root
   SQL_PASSWORD=rootpassword
   SQL_DATABASE=ldap_user_db
   ```

4. **Restart the server**:
   ```bash
   systemctl restart ldap-gateway
   ```

No database changes are required - the SQL backend uses the same schema.

### Switching Between SQL Dialects

To switch from one SQL dialect to another:

1. **Export your data** from the current database
2. **Create and initialize** the new database using the appropriate init script
3. **Import your data** into the new database
4. **Update SQL_DRIVER** in `.env`
5. **Restart the server**

## Examples

### Example 1: MySQL with Custom Schema

```ini
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql
SQL_DRIVER=mysql
SQL_HOST=localhost
SQL_DATABASE=custom_db

# Custom queries for different table/column names
SQL_QUERY_FIND_USER=SELECT * FROM employees WHERE login_name = ?
SQL_QUERY_GET_ALL_USERS=SELECT employee_id as id, login_name as username, display_name as full_name, uid as uid_number, primary_group as gid_number FROM employees
```

### Example 2: PostgreSQL Production Setup

```ini
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql
SQL_DRIVER=postgresql
SQL_HOST=postgres.example.com
SQL_PORT=5432
SQL_USER=ldap_readonly
SQL_PASSWORD=secure_password
SQL_DATABASE=corporate_directory
```

### Example 3: SQLite for Development

```ini
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql
SQL_DRIVER=sqlite
SQL_DATABASE=./dev-ldap.db
LOG_LEVEL=debug
```

## Troubleshooting

### Connection Issues

**Problem**: Can't connect to database

**Solutions**:
- Verify SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD are correct
- Check firewall rules allow connections
- For PostgreSQL, verify `pg_hba.conf` allows connections
- For SQLite, check file permissions and path

### Query Errors

**Problem**: Custom queries failing

**Solutions**:
- Test queries directly in database client first
- Use `?` placeholders (not `$1`, `:param`, etc.)
- Ensure returned columns match expected names
- Check logs with `LOG_LEVEL=debug`

### JSON Parsing Errors

**Problem**: `member_uids` not parsed correctly

**Solutions**:
- Ensure JSON column contains valid JSON array
- For MySQL: use JSON type, not TEXT
- For PostgreSQL: use JSONB type
- For SQLite: ensure JSON1 extension is available

### Performance Issues

**Problem**: Slow queries with large datasets

**Solutions**:
- Create indexes on username columns
- Index foreign keys in user_groups table
- Use connection pooling (already enabled)
- Consider custom queries optimized for your schema

## Best Practices

1. **Use SQL_* variables**: More portable across dialects
2. **Index frequently queried columns**: `username`, `gid_number`, foreign keys
3. **Use connection pooling**: Already enabled by default
4. **Test custom queries**: Verify in database client before deploying
5. **Monitor logs**: Use `LOG_LEVEL=debug` to diagnose issues
6. **Backup before migration**: Always backup before switching dialects
7. **Use read-only accounts**: Grant minimal required permissions

## Performance Considerations

### Connection Pooling

All SQL drivers use connection pooling:
- **MySQL/PostgreSQL**: 10 connections by default
- **SQLite**: Single connection (no pooling needed)

### Query Optimization

Default queries are optimized for common use cases. If you have specific performance needs:
1. Analyze slow queries with database profiling tools
2. Create appropriate indexes
3. Provide custom queries via `SQL_QUERY_*` variables
4. Consider caching frequently accessed data

## Security Notes

1. **Never commit credentials**: Use `.env` file (gitignored)
2. **Use least privilege**: Grant only SELECT on required tables
3. **Use secure connections**: Enable SSL/TLS for remote databases
4. **Password hashing**: Current implementation uses plaintext (TODO: implement bcrypt/argon2)
5. **Input validation**: Parameterized queries prevent SQL injection

## Getting Help

For issues or questions:
1. Check logs with `LOG_LEVEL=debug`
2. Test database connectivity independently
3. Verify schema matches expected structure
4. Open an issue on GitHub with logs and configuration (redact credentials)
