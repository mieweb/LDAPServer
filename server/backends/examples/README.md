# SQL Backend Configuration Examples

This directory contains example `.env` configuration files for different SQL backends.

## Available Examples

- **`.env.mysql`** - MySQL/MariaDB configuration
- **`.env.postgresql`** - PostgreSQL configuration  
- **`.env.sqlite`** - SQLite configuration

## Usage

1. **Choose your SQL dialect** (MySQL, PostgreSQL, or SQLite)

2. **Copy the example file** to your server's configuration directory:
   ```bash
   # For package installations
   sudo cp .env.mysql /etc/ldap-gateway/.env
   
   # For development
   cp .env.mysql ../../../server/.env
   ```

3. **Edit the configuration** with your database credentials:
   ```bash
   sudo nano /etc/ldap-gateway/.env
   ```

4. **Initialize the database** using the appropriate SQL script:
   ```bash
   # MySQL
   mysql -u root -p < ../../../../docker/sql/init.sql
   
   # PostgreSQL
   psql -U postgres -d ldap_user_db -f ../../../../docker/sql/init-postgresql.sql
   
   # SQLite
   sqlite3 /var/lib/ldap-gateway/ldap.db < ../../../../docker/sql/init-sqlite.sql
   ```

5. **Restart the service**:
   ```bash
   sudo systemctl restart ldap-gateway
   ```

## Quick Start by Database Type

### MySQL/MariaDB

```bash
# 1. Copy example
cp .env.mysql /etc/ldap-gateway/.env

# 2. Edit credentials
nano /etc/ldap-gateway/.env

# 3. Initialize database
mysql -u root -p < /usr/share/ldap-gateway/sql/init.sql

# 4. Restart
systemctl restart ldap-gateway
```

### PostgreSQL

```bash
# 1. Copy example
cp .env.postgresql /etc/ldap-gateway/.env

# 2. Edit credentials
nano /etc/ldap-gateway/.env

# 3. Create database
sudo -u postgres createdb ldap_user_db

# 4. Initialize schema
sudo -u postgres psql ldap_user_db < /usr/share/ldap-gateway/sql/init-postgresql.sql

# 5. Restart
systemctl restart ldap-gateway
```

### SQLite

```bash
# 1. Copy example
cp .env.sqlite /etc/ldap-gateway/.env

# 2. Edit database path (if needed)
nano /etc/ldap-gateway/.env

# 3. Initialize database
mkdir -p /var/lib/ldap-gateway
sqlite3 /var/lib/ldap-gateway/ldap.db < /usr/share/ldap-gateway/sql/init-sqlite.sql

# 4. Restart
systemctl restart ldap-gateway
```

## Configuration Variables

### Common Settings (All Databases)

```ini
AUTH_BACKENDS=sql           # Use SQL backend for authentication
DIRECTORY_BACKEND=sql       # Use SQL backend for directory
SQL_DRIVER=mysql           # Database type: mysql, postgresql, sqlite
LDAP_BASE_DN=dc=example,dc=com
```

### MySQL/PostgreSQL Settings

```ini
SQL_HOST=localhost         # Database host
SQL_PORT=3306             # Port (3306 for MySQL, 5432 for PostgreSQL)
SQL_USER=your_user        # Database username
SQL_PASSWORD=your_pass    # Database password
SQL_DATABASE=ldap_user_db # Database name
```

### SQLite Settings

```ini
SQL_DATABASE=/path/to/db.sqlite  # Database file path
# Note: No host, port, user, or password needed
```

### Custom Queries (Optional)

Override default SQL queries for custom schemas:

```ini
SQL_QUERY_FIND_USER=SELECT * FROM users WHERE username = ?
SQL_QUERY_FIND_GROUPS_BY_MEMBER=SELECT * FROM groups WHERE ? = ANY(member_uids)
SQL_QUERY_GET_ALL_USERS=SELECT * FROM users
SQL_QUERY_GET_ALL_GROUPS=SELECT * FROM groups
```

## Validation

After configuration, validate your setup:

```bash
# Check service status
systemctl status ldap-gateway

# View logs
journalctl -u ldap-gateway -f

# Test LDAP search
ldapsearch -x -H ldaps://localhost:636 -b "dc=example,dc=com" "(uid=testuser)"
```

## Troubleshooting

### Connection Issues

1. **Verify database connectivity** independently:
   ```bash
   # MySQL
   mysql -h $SQL_HOST -u $SQL_USER -p $SQL_DATABASE
   
   # PostgreSQL
   psql -h $SQL_HOST -U $SQL_USER -d $SQL_DATABASE
   
   # SQLite
   sqlite3 $SQL_DATABASE ".tables"
   ```

2. **Check firewall rules** (MySQL/PostgreSQL):
   ```bash
   sudo ufw allow 3306/tcp  # MySQL
   sudo ufw allow 5432/tcp  # PostgreSQL
   ```

3. **Review logs** with debug level:
   ```ini
   LOG_LEVEL=debug
   ```

### Permission Issues

Ensure the ldap-gateway service has permissions:

```bash
# For SQLite
sudo chown ldap-gateway:ldap-gateway /var/lib/ldap-gateway/ldap.db
sudo chmod 640 /var/lib/ldap-gateway/ldap.db

# For configuration files
sudo chown root:ldap-gateway /etc/ldap-gateway/.env
sudo chmod 640 /etc/ldap-gateway/.env
```

## Documentation

For more detailed information:

- [SQL Backend Guide](../SQL_BACKEND_GUIDE.md) - Comprehensive documentation
- [Migration Guide](../MIGRATION_GUIDE.md) - Migrating from old MySQL backend
- [Main README](../../../README.md) - General LDAP Gateway documentation

## Support

For issues or questions:
1. Check the [SQL Backend Guide](../SQL_BACKEND_GUIDE.md)
2. Review logs with `LOG_LEVEL=debug`
3. Open an issue on GitHub
