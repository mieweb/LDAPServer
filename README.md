# LDAP Gateway

A modular LDAP gateway server that bridges LDAP authentication to various backends (MySQL/MongoDB/Proxmox). Built with Node.js and ldapjs, it separates **directory lookups** (user/group info) from **authentication** (password validation) for flexible integration with modern and legacy systems.

## 🏗️ Architecture

The project is structured as a **modular monorepo** with distinct responsibilities:

```mermaid
graph TB
    subgraph "📦 @ldap-gateway/core (npm package)"
        A[LdapEngine] --> B[AuthProvider Interface]
        A --> C[DirectoryProvider Interface]  
        A --> D[Utilities & Error Handling]
    end
    
    subgraph "🚀 ldap-gateway-server (standalone)"
        E[Server Implementation] --> F[Provider Factory]
        E --> G[Configuration Loader]
        F --> H[DB Backend]
        F --> I[LDAP Backend]
        F --> J[Proxmox Backend]
    end
    
    subgraph "📋 Distribution"
        K[Binary Executable]
        L[.deb/.rpm packages]
        M[Homebrew Formula]
        N[Docker Images]
    end
    
    A -.-> E
    E --> K
    E --> L
    E --> M
    E --> N

    classDef coreStyle fill:#e1f5fe
    classDef serverStyle fill:#f3e5f5  
    classDef distStyle fill:#e8f5e8
    
    class A,B,C,D coreStyle
    class E,F,G,H,I,J serverStyle
    class K,L,M,N distStyle
```

### � Authentication Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Client as 🖥️ SSH Client
    participant SSSD as 🔐 SSSD
    participant Gateway as 🌉 LDAP Gateway
    participant Directory as 📁 Directory Backend
    participant Auth as 🔑 Auth Backend
    
    User->>Client: SSH login attempt
    Client->>SSSD: Authenticate user
    SSSD->>Gateway: LDAP bind request
    Gateway->>Directory: Fetch user info
    Directory-->>Gateway: User details + groups
    Gateway->>Auth: Validate credentials
    Auth-->>Gateway: Auth result
    Gateway-->>SSSD: LDAP response
    SSSD-->>Client: Access granted/denied
    Client-->>User: Login success/failure
```

---

## 🚀 Quick Start

### Installation Options

#### Option 1: Binary Release (Recommended)
```bash
# Download latest release
curl -LO https://github.com/mieweb/LDAPServer/releases/latest/download/ldap-gateway-linux.tar.gz
tar -xzf ldap-gateway-linux.tar.gz
cd ldap-gateway-*
sudo ./install.sh
```

#### Option 2: Package Manager

**Ubuntu/Debian:**
```bash
curl -LO https://github.com/mieweb/LDAPServer/releases/latest/download/ldap-gateway_amd64.deb
sudo dpkg -i ldap-gateway_amd64.deb
```

**RHEL/CentOS/Fedora:**
```bash
curl -LO https://github.com/mieweb/LDAPServer/releases/latest/download/ldap-gateway.rpm
sudo rpm -i ldap-gateway.rpm
```

**macOS (Homebrew):**
```bash
brew tap mieweb/homebrew-tap
brew install ldap-gateway
```

#### Option 3: Development Setup
```bash
git clone https://github.com/mieweb/LDAPServer.git
cd LDAPServer
npm install
cp server/.env.example server/.env
# Edit .env with your configuration
./launch.sh
```

### Configuration

Create or edit `/etc/ldap-gateway/.env`:

```ini
# Directory backend: where to find user/group information
DIRECTORY_BACKEND=sql  # sql | mongodb | proxmox

# Authentication backends: how to validate passwords (comma-separated for multiple)
AUTH_BACKENDS=ldap      # sql | mongodb | ldap | proxmox | notification | sql,ldap | ldap,notification

# LDAP Server Configuration
LDAP_BASE_DN=dc=company,dc=com

# SQL configuration (for any SQL-based system)
SQL_URL=mysql://ldap_user:secure_password@localhost:3306/your_database
SQL_QUERY_ONE_USER='SELECT * FROM users WHERE username = ?'
SQL_QUERY_GROUPS_BY_MEMBER='SELECT * FROM groups g WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))'
SQL_QUERY_ALL_USERS='SELECT * FROM users'
SQL_QUERY_ALL_GROUPS='SELECT
    g.gid_number,
    g.name,
    g.gid_number AS id,
    GROUP_CONCAT(u.username) AS member_uids
FROM groups g
LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
LEFT JOIN users u ON ug.user_id = u.id
GROUP BY g.gid_number, g.name
ORDER BY g.name'

# Security: Require authentication for search operations
# Default: true (authentication required for security)
# Set to false only for development/testing if you need anonymous access
REQUIRE_AUTH_FOR_SEARCH=true

# MongoDB configuration (for mongodb backends)
MONGO_URI=mongodb://localhost:27017/ldap_user_db
MONGO_DATABASE=ldap_user_db

# External LDAP/AD authentication
LDAP_BIND_DN=CN=ldap-service,OU=Service Accounts,DC=company,DC=com
LDAP_BIND_PASSWORD=ldap_service_password
AD_DOMAIN=company.com
```

### Security Settings

#### Require Authentication for Search

By default, authentication is required before allowing LDAP search operations:

```ini
# Authentication required by default (recommended for security)
REQUIRE_AUTH_FOR_SEARCH=true  # This is the default

# Only disable for development/testing if needed
# REQUIRE_AUTH_FOR_SEARCH=false
```

**Behavior:**
- `true` (default): Clients must authenticate with valid credentials before searching
- `false`: Allows anonymous searches - only use for development/testing

**Example:**
```bash
# Without authentication (fails when REQUIRE_AUTH_FOR_SEARCH=true)
ldapsearch -H ldaps://localhost:636 -x -b "dc=company,dc=com" "(uid=john)"
# Result: Insufficient access (error 50)

# With authentication (succeeds)
ldapsearch -H ldaps://localhost:636 -x -D "uid=john,dc=company,dc=com" -w password -b "dc=company,dc=com" "(uid=john)"
# Result: Returns user information
```

**Recommendation:** Set to `true` for all production environments to prevent unauthorized directory enumeration.

#### TLS Version and Cipher Configuration

For LDAPS connections, you can configure which TLS versions and ciphers are allowed:

```ini
# Minimum TLS version (default: uses Node.js default, typically TLSv1.2)
# Options: TLSv1.2, TLSv1.3
TLS_MIN_VERSION=TLSv1.2

# Maximum TLS version (default: uses Node.js default, typically TLSv1.3)
# Options: TLSv1.2, TLSv1.3
TLS_MAX_VERSION=TLSv1.3

# Allowed ciphers (OpenSSL cipher list format)
# Leave empty/unset to use Node.js defaults
TLS_CIPHERS=TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-RSA-AES256-GCM-SHA384
```

**Recommended Settings for High Security:**
```ini
# Enforce TLS 1.3 only (most secure, but may not work with older clients)
TLS_MIN_VERSION=TLSv1.3
TLS_MAX_VERSION=TLSv1.3
```

**Recommended Settings for Compatibility:**
```ini
# Allow TLS 1.2 and 1.3 (good balance of security and compatibility)
TLS_MIN_VERSION=TLSv1.2
TLS_MAX_VERSION=TLSv1.3
```

**Testing TLS Configuration:**
```bash
# Check which TLS versions are supported
openssl s_client -connect localhost:636 -tls1_2 </dev/null 2>&1 | grep "Protocol"
openssl s_client -connect localhost:636 -tls1_3 </dev/null 2>&1 | grep "Protocol"

# Check available ciphers
openssl s_client -connect localhost:636 -cipher 'HIGH' </dev/null 2>&1 | grep "Cipher"
```

**Notes:**
- TLS 1.0 and 1.1 are not supported (deprecated and insecure)
- When both `TLS_MIN_VERSION` and `TLS_MAX_VERSION` are unset, Node.js defaults apply
- Invalid version combinations (min > max) will be rejected with a warning
- Invalid cipher strings may cause connection failures

### Start Service

```bash
# Using systemd (installed packages)
sudo systemctl enable ldap-gateway
sudo systemctl start ldap-gateway

# Or run directly  
ldap-gateway

# Development mode
npm run dev
```

---

## 🔧 Backend Configuration

The LDAP gateway separates **directory lookups** from **authentication**, allowing flexible mixing:

### Directory Backends (`DIRECTORY_BACKEND`)

| Backend | Description | Use Case |
|---------|-------------|----------|
| `sql` | MySQL/MariaDB/SQLite3/PostgreSQL databases | Any SQL-based system (WebChart, custom schemas) |
| `mongodb` | MongoDB collections | Modern web applications |
| `proxmox` | Proxmox user.cfg/shadow.cfg files | Virtualization environments |

### Authentication Backends (`AUTH_BACKENDS`) 

**Multiple backends supported** - Use comma-separated values (e.g., `AUTH_BACKENDS=sql,ldap`) to try authentication providers in order.

| Backend | Description | Use Case |
|---------|-------------|----------|
| `sql` | MySQL/MariaDB/SQLite3/PostgreSQL password hashes | Self-contained auth with SQL databases |
| `mongodb` | MongoDB password hashes | Self-contained auth with MongoDB collections |
| `ldap` | External LDAP/Active Directory | Enterprise SSO integration |
| `proxmox` | Proxmox shadow file | Proxmox container authentication |
| `notification` | MFA push notifications via mobile app | Two-factor authentication, enhanced security |

### Example Configurations

#### SQL + Active Directory
```ini
DIRECTORY_BACKEND=sql   # User info from MySQL
AUTH_BACKENDS=ldap        # Passwords via AD
AD_DOMAIN=your-domain.com
LDAP_BIND_DN=CN=service,DC=your-domain,DC=com
SQL_URL=mysql://ldap_user:secure_password@localhost:3306/your_database
SQL_QUERY_ONE_USER='SELECT * FROM users WHERE username = ?'
SQL_QUERY_GROUPS_BY_MEMBER='SELECT * FROM groups g WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))'
SQL_QUERY_ALL_USERS='SELECT * FROM users'
SQL_QUERY_ALL_GROUPS='SELECT
    g.gid_number,
    g.name,
    g.gid_number AS id,
    GROUP_CONCAT(u.username) AS member_uids
FROM groups g
LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
LEFT JOIN users u ON ug.user_id = u.id
GROUP BY g.gid_number, g.name
ORDER BY g.name'
```

#### MySQL Self-Contained
```ini
DIRECTORY_BACKEND=mysql   # User info from MySQL
AUTH_BACKENDS=mysql       # Passwords in MySQL
SQL_URL=mysql://ldap_user:secure_password@localhost:3306/your_database
SQL_QUERY_ONE_USER='SELECT * FROM users WHERE username = ?'
SQL_QUERY_GROUPS_BY_MEMBER='SELECT * FROM groups g WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))'
SQL_QUERY_ALL_USERS='SELECT * FROM users'
SQL_QUERY_ALL_GROUPS='SELECT
    g.gid_number,
    g.name,
    g.gid_number AS id,
    GROUP_CONCAT(u.username) AS member_uids
FROM groups g
LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
LEFT JOIN users u ON ug.user_id = u.id
GROUP BY g.gid_number, g.name
ORDER BY g.name'
```

#### MongoDB Self-Contained
```ini  
DIRECTORY_BACKEND=mongodb  # User info from MongoDB
AUTH_BACKENDS=mongodb      # Passwords in MongoDB
MONGO_URI=mongodb://localhost:27017/users
MONGO_DATABASE=users
```

#### Proxmox Container Auth
```ini
DIRECTORY_BACKEND=proxmox  # Users from Proxmox config
AUTH_BACKENDS=proxmox      # Passwords from Proxmox
PROXMOX_USER_CFG=/etc/pve/user.cfg
PROXMOX_SHADOW_CFG=/etc/pve/shadow.cfg
```

#### Multi-Backend Authentication (Fallback)

🎥 **[Multiple Backends Demo](https://youtube.com/shorts/4N-aov0wxZ4?si=AA9SN_s_EfpkM-MK)** - See how to configure multiple authentication backends

```ini
DIRECTORY_BACKEND=sql    # User info from SQL
AUTH_BACKENDS=sql,ldap   # Try SQL auth first, fallback to LDAP
SQL_URL=mysql://ldap_user:secure_password@localhost:3306/your_database
SQL_QUERY_ONE_USER='SELECT * FROM users WHERE username = ?'
SQL_QUERY_GROUPS_BY_MEMBER='SELECT * FROM groups g WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))'
SQL_QUERY_ALL_USERS='SELECT * FROM users'
SQL_QUERY_ALL_GROUPS='SELECT
    g.gid_number,
    g.name,
    g.gid_number AS id,
    GROUP_CONCAT(u.username) AS member_uids
FROM groups g
LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
LEFT JOIN users u ON ug.user_id = u.id
GROUP BY g.gid_number, g.name
ORDER BY g.name'
AD_DOMAIN=your-domain.com
LDAP_BIND_DN=CN=service,DC=your-domain,DC=com
```

#### MFA with Push Notifications
```ini
DIRECTORY_BACKEND=sql       # User info from MySQL
AUTH_BACKENDS=ldap,notification # LDAP auth + MFA push notifications
AD_DOMAIN=your-domain.com
LDAP_BIND_DN=CN=service,DC=your-domain,DC=com
SQL_URL=mysql://ldap_user:secure_password@localhost:3306/your_database
SQL_QUERY_ONE_USER='SELECT * FROM users WHERE username = ?'
SQL_QUERY_GROUPS_BY_MEMBER='SELECT * FROM groups g WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))'
SQL_QUERY_ALL_USERS='SELECT * FROM users'
SQL_QUERY_ALL_GROUPS='SELECT
    g.gid_number,
    g.name,
    g.gid_number AS id,
    GROUP_CONCAT(u.username) AS member_uids
FROM groups g
LEFT JOIN user_groups ug ON g.gid_number = ug.group_id
LEFT JOIN users u ON ug.user_id = u.id
GROUP BY g.gid_number, g.name
ORDER BY g.name'

# MFA Configuration (requires MIE Authenticator app)
ENABLE_NOTIFICATION=true
NOTIFICATION_URL=https://your-notification-service.com
```

### 🔌 Custom Backends (Dynamic Loading)

**NEW:** Create your own backends without rebuilding! Place JavaScript files in `server/backends/` to add custom authentication or directory providers.

#### Quick Example

1. **Create a custom auth backend** (`server/backends/my-auth.js`):
```javascript
const { AuthProvider } = require('@ldap-gateway/core');

class MyAuthBackend extends AuthProvider {
  async authenticate(username, password) {
    // Your custom authentication logic
    return await myApiCall(username, password);
  }
}

module.exports = {
  name: 'my-auth',
  type: 'auth',
  provider: MyAuthBackend
};
```

2. **Configure to use it**:
```ini
AUTH_BACKENDS=my-auth
```

3. **Restart the server** - your backend loads automatically!

#### Features
- ✅ **No rebuild required** - just add JS files
- ✅ **Hot reload support** - change files without restarting
- ✅ **Full access to core interfaces** - use AuthProvider and DirectoryProvider
- ✅ **Template included** - `server/backends/template.js` to get started
- ✅ **Examples provided** - See `server/backends/*.example.js`

🎥 **[Quick Demo](https://youtube.com/shorts/D3332Tr4fYk?si=igINgFQvvrxmSySd)** - See custom backend creation in action

📚 **Full documentation**: See [server/backends/README.md](server/backends/README.md) for complete guide with examples.

---

## 🧪 Testing

### LDAP Queries
```bash
# Search for users
ldapsearch -x -H ldaps://localhost:636 -b "dc=company,dc=com" "(uid=john)"

# List all users  
ldapsearch -x -H ldaps://localhost:636 -b "dc=company,dc=com" "(objectClass=posixAccount)"

# List groups
ldapsearch -x -H ldaps://localhost:636 -b "dc=company,dc=com" "(objectClass=posixGroup)"
```

### SSH Authentication
```bash
# Test SSH authentication through SSSD
ssh john@ldap-client-host

# Test with specific port
ssh john@localhost -p 2222
```

### Health Check
```bash
# Check service status
systemctl status ldap-gateway

# View logs
journalctl -u ldap-gateway -f

# Test configuration
ldap-gateway --config-test
```

---

## 🏥 WebChart Integration

The LDAP Gateway integrates with [WebChart EHR](https://www.mieweb.com/) systems using the SQL backend:

```ini
DIRECTORY_BACKEND=sql    # WebChart uses MySQL
AUTH_BACKENDS=sql
SQL_URL=mysql://ldap_user:secure_password@localhost:3306/your_database
# TODO: implement queries matching the webchart schema
```

WebChart users are mapped to standard LDAP objects with healthcare-specific attributes and group memberships based on WebChart realms.

---

## 🖥️ Proxmox Integration  

Direct integration with Proxmox virtualization environments:

### Features
- **Container Authentication** → Centralized LDAP for all containers/VMs
- **Configuration Syncing** → Reads directly from Proxmox user/shadow files
- **MFA Support** → Optional push notifications via [MIE Authenticator](https://github.com/mieweb/mieweb_auth_app)
- **Automated Setup** → Use [pown.sh](https://github.com/mieweb/pown.sh) for container LDAP client configuration

### Deployment
```bash
# Install in Proxmox container
pct create 100 --template debian-12 --hostname ldap-gateway
pct set 100 --mp0 /etc/pve,mp=/etc/pve:ro  # Mount Proxmox config
pct start 100
pct enter 100

# Install LDAP Gateway
curl -L https://github.com/mieweb/LDAPServer/releases/latest/download/ldap-gateway_amd64.deb
dpkg -i ldap-gateway_amd64.deb

# Configure for Proxmox
cat > /etc/ldap-gateway/.env << EOF
DIRECTORY_BACKEND=proxmox
AUTH_BACKENDS=proxmox
PROXMOX_USER_CFG=/etc/pve/user.cfg
PROXMOX_SHADOW_CFG=/etc/pve/shadow.cfg
EOF

systemctl enable --now ldap-gateway
```

---

## 📦 Development

### Architecture Overview
```
LDAPServer/
├── npm/                    # @ldap-gateway/core package
│   ├── src/               # Core interfaces and utilities  
│   ├── dist/              # Built package
│   └── package.json       # Core package definition
├── server/                # ldap-gateway-server package
│   ├── src/               # Server implementation
│   ├── dist/              # Built server
│   └── package.json       # Server package definition
├── .github/workflows/     # CI/CD automation
├── nfpm/                  # Package configuration
├── docker/                # Development containers
└── terraform/             # AWS deployment
```

### Building

```bash
# Install dependencies
npm install

# Build core package
npm run build:core

# Build server package  
npm run build:server

# Create binary
npm run build:binary

# Build packages (.deb/.rpm)
nfpm package --packager deb
```

### Testing

```bash  
# Run all tests
npm test

# Test specific package
npm run test:core
npm run test:server

# Integration testing with Docker
./launch.sh  # Starts MySQL + test client
./shutdown.sh  # Cleanup
```

### Contributing

1. **Fork** and **clone** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Make** your changes with tests
4. **Run** the test suite: `npm test`
5. **Submit** a pull request

---

## 📚 Resources

- 🎬 **[Quick Demo](https://youtube.com/shorts/C_7CIJVPkgg?si=VHommCsoQokObiKp)** - Complete walkthrough shorts
- 📖 **[API Documentation](./npm/README.md)** - Core package usage
- 🔧 **[Server Configuration](./server/README.md)** - Server setup guide
- 🏥 **[WebChart Integration](https://docs.google.com/document/d/1_6iutppKego9Kg_FGuDg5OwbXJUqZ0a2Fj7ajgNLU8k/edit)** - Healthcare deployment
- 📱 **[MIE Authenticator](https://github.com/mieweb/mieweb_auth_app)** - MFA mobile app
- 🛠️ **[pown.sh](https://github.com/mieweb/pown.sh)** - Container automation

---




## Elaborative

### With AD/LDAP for authentication

```mermaid
sequenceDiagram
    participant User as ann (User)
    participant Client as Client (SSHD)
    participant SSSD as SSSD
    participant CustomLDAP as Custom LDAPServer (ldapjs)
    participant DB as Database (MySQL/MongoDB)
    participant AuthSys as Authentication System (AD/LDAP)
    
    User->>Client: SSH login request (ann)
    Client->>SSSD: Authenticate user (ann)
    
    %% User information lookup
    SSSD->>CustomLDAP: Fetch user info (id, groups)
    CustomLDAP->>DB: Check if user exists
    DB-->>CustomLDAP: User exists
    CustomLDAP-->>SSSD: Return user info + group memberships
    
    %% Password verification via your custom LDAP server connecting to auth system
    SSSD->>CustomLDAP: Verify user credentials
    CustomLDAP->>AuthSys: Forward authentication request
    AuthSys-->>CustomLDAP: Authentication result
    CustomLDAP-->>SSSD: Forward authentication result
    
    %% Group membership and final authorization
    SSSD-->>Client: Authentication success/failure
    Client-->>User: Login allowed/denied
```

### Integration with Push notification
```mermaid
sequenceDiagram
    participant User as ann (User)
    participant Client as Client (SSHD)
    participant SSSD as SSSD
    participant CustomLDAP as Custom LDAPServer (ldapjs)
    participant DB as Database (MySQL/MongoDB)
    participant AuthSys as Authentication System (AD/LDAP)
    participant NotifSvc as Notification Service
    
    User->>Client: SSH login request (ann)
    Client->>SSSD: Authenticate user (ann)
    SSSD->>CustomLDAP: Check user authentication
    CustomLDAP->>DB: Check if user exists
    DB-->>CustomLDAP: User exists
    CustomLDAP->>AuthSys: Authenticate user credentials
    AuthSys-->>CustomLDAP: Authentication successful
    CustomLDAP-->>SSSD: Authentication successful
    SSSD-->>Client: Authentication successful
    CustomLDAP->>NotifSvc: Send notification for approval
    NotifSvc-->>User: Push notification to phone
    User-->>NotifSvc: Approve SSH request
    NotifSvc-->>CustomLDAP: Send approval response
    CustomLDAP-->>Client: Allow SSH login
```
## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

<sub>Built with ❤️ by [MIEWeb](https://www.mieweb.com/) for healthcare and enterprise environments.</sub>