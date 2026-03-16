# Multi-Realm LDAP Gateway

## Overview

The LDAP Gateway supports **multi-realm architecture**, enabling a single gateway instance to serve multiple directory backends, each with its own baseDN and authentication chain.

**Capabilities:**
- Serve users from multiple domains (e.g., `dc=mieweb,dc=com`, `dc=bluehive,dc=com`)
- Apply different authentication requirements per user population (MFA for employees, password-only for service accounts)
- Isolate directory data across organizational boundaries
- Override authentication per user via the `auth_backends` database column
- Maintain full backward compatibility with single-realm deployments

### Architecture Overview

```mermaid
flowchart TB
    subgraph "Client Layer"
        C1["SSSD Client\ndc=mieweb,dc=com"]
        C2["SSSD Client\ndc=bluehive,dc=com"]
        C3["Service Account\ndc=mieweb,dc=com"]
    end
    
    subgraph "LDAP Gateway"
        GW["BaseDN Router"]
    end
    
    subgraph "Realm Layer"
        R1["Realm: mieweb\ndc=mieweb,dc=com"]
        R2["Realm: bluehive\ndc=bluehive,dc=com"]
        R3["Realm: service-accounts\ndc=mieweb,dc=com"]
        
        R1 --> DIR1["SQL Directory\nusers table"]
        R1 --> AUTH1["Auth: SQL + MFA"]
        
        R2 --> DIR2["SQL Directory\nbluehive_users"]
        R2 --> AUTH2["Auth: SQL"]
        
        R3 --> DIR3["SQL Directory\nservice_accounts"]
        R3 --> AUTH3["Auth: SQL only"]
    end
    
    C1 -->|"bind/search"| GW
    C2 -->|"bind/search"| GW
    C3 -->|"bind/search"| GW
    
    GW -->|"dc=mieweb"| R1
    GW -->|"dc=bluehive"| R2
    GW -->|"dc=mieweb"| R3
```

## Prerequisites

- LDAP Gateway v2.0+
- A `realms.json` configuration file (or `REALM_CONFIG` environment variable)
- Configured backend databases or directory sources for each realm
- Understanding of your organization's LDAP baseDN structure

## Core Concepts

### Realm

A **realm** is an isolated authentication and directory domain consisting of:

| Property | Description | Example |
|----------|-------------|---------|
| `name` | Unique identifier | `"mieweb-employees"` |
| `baseDn` | LDAP subtree root | `"dc=mieweb,dc=com"` |
| `directory` | Backend for user/group lookups | SQL, MongoDB, Proxmox |
| `auth.backends` | Ordered list of authentication providers | SQL, Notification (MFA) |

Multiple realms can share the same baseDN (e.g., employees and service accounts both under `dc=mieweb,dc=com`).

### Routing Behavior

**Different baseDNs (complete isolation):**
- Each baseDN routes to its own set of realms
- No result merging across baseDNs

**Same baseDN, multiple realms:**

| Operation | Behavior |
|-----------|----------|
| **Bind (auth)** | Realms checked in config order; first realm containing the user wins |
| **Search** | All realms queried in parallel; results merged with DN deduplication |
| **Duplicate DNs** | First realm's entry wins; duplicates silently dropped |

### Authentication Chain

Each realm defines a sequential authentication chain. **All providers in the chain must succeed** for authentication to pass:

```json
"auth": {
  "backends": [
    { "type": "sql" },
    { "type": "notification" }
  ]
}
```

In the example above, SQL password validation must pass first, then the MFA notification provider must also succeed.

### Authentication Flow

When a client binds (authenticates), the gateway routes by baseDN, finds the user across realms, and runs the authentication chain:

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as LDAP Gateway
    participant R1 as Realm: employees
    participant R2 as Realm: service-accounts
    participant Auth as Auth Chain

    Client->>Gateway: BIND uid=ldap-reader,dc=mieweb,dc=com

    Gateway->>Gateway: Route by baseDN: dc=mieweb,dc=com

    Gateway->>R1: Find user 'ldap-reader'
    R1-->>Gateway: Not found

    Gateway->>R2: Find user 'ldap-reader'
    R2-->>Gateway: Found (auth_backends: null)

    Note over Gateway: First match wins

    Gateway->>Gateway: Resolve auth chain for realm

    alt auth_backends is null
        Note over Gateway: Use realm default: [SQL]
    else auth_backends = 'sql,hardware-token'
        Note over Gateway: Use per-user override
    end

    Gateway->>Auth: SQL password check
    Auth-->>Gateway: Pass

    Gateway-->>Client: BIND SUCCESS (realm: service-accounts)
```

### Search Flow

When a client searches, all realms sharing the baseDN are queried in parallel and results are merged:

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as LDAP Gateway
    participant R1 as Realm: employees
    participant R2 as Realm: service-accounts

    Client->>Gateway: SEARCH base=dc=mieweb,dc=com

    par Query all matching realms
        Gateway->>R1: Get users
        R1-->>Gateway: [uid=apant, uid=horner]
        
        Gateway->>R2: Get users
        R2-->>Gateway: [uid=ldap-reader, uid=monitoring-bot]
    end

    Gateway->>Gateway: Merge & deduplicate by DN

    Gateway-->>Client: 4 unique entries
```

## Configuration

### Multi-Realm Mode

Set the `REALM_CONFIG` environment variable to enable multi-realm mode:

**Option 1: File Path**
```bash
REALM_CONFIG=/etc/ldap-gateway/realms.json
```

**Option 2: Inline JSON**
```bash
REALM_CONFIG='[{"name":"mieweb","baseDn":"dc=mieweb,dc=com",...}]'
```

### Realm Configuration Structure

**`realms.json` example:**

```json
[
  {
    "name": "mieweb-employees",
    "baseDn": "dc=mieweb,dc=com",
    "directory": {
      "backend": "sql",
      "options": {
        "sqlUri": "mysql://user:pass@db.mieweb.com:3306/company_prod",
        "sqlQueryOneUser": "SELECT * FROM users WHERE username = ?",
        "sqlQueryAllUsers": "SELECT * FROM users",
        "sqlQueryAllGroups": "SELECT * FROM groups",
        "sqlQueryGroupsByMember": "SELECT * FROM groups g WHERE JSON_CONTAINS(g.member_uids, JSON_QUOTE(?))"
      }
    },
    "auth": {
      "backends": [
        {
          "type": "sql",
          "options": {
            "sqlUri": "mysql://user:pass@db.mieweb.com:3306/company_prod",
            "sqlQueryOneUser": "SELECT * FROM users WHERE username = ?"
          }
        },
        {
          "type": "notification",
          "options": {
            "notificationUrl": "https://push.mieweb.com/notify"
          }
        }
      ]
    }
  },
  {
    "name": "service-accounts",
    "baseDn": "dc=mieweb,dc=com",
    "directory": {
      "backend": "sql",
      "options": {
        "sqlUri": "mysql://user:pass@db.mieweb.com:3306/company_prod",
        "sqlQueryOneUser": "SELECT * FROM service_accounts WHERE username = ?"
      }
    },
    "auth": {
      "backends": [
        {
          "type": "sql",
          "options": {
            "sqlUri": "mysql://user:pass@db.mieweb.com:3306/company_prod",
            "sqlQueryOneUser": "SELECT * FROM service_accounts WHERE username = ?"
          }
        }
      ]
    }
  }
]
```

A full example configuration is available at [`server/realms.example.json`](../server/realms.example.json).

### Configuration Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique realm identifier |
| `baseDn` | string | Yes | LDAP base DN for this realm |
| `directory.backend` | string | Yes | Directory provider type (`sql`, `mongo`, `proxmox`) |
| `directory.options` | object | No | Provider-specific options (connection strings, queries) |
| `auth.backends[]` | array | Yes | Ordered list of auth backends |
| `auth.backends[].type` | string | Yes | Auth provider type (`sql`, `notification`, etc.) |
| `auth.backends[].options` | object | No | Provider-specific auth options |

### Legacy Single-Realm Mode (Backward Compatible)

If `REALM_CONFIG` is **not set**, the gateway operates in legacy mode using flat environment variables:

```bash
AUTH_BACKENDS=sql,notification
DIRECTORY_BACKEND=sql
LDAP_BASE_DN=dc=mieweb,dc=com
SQL_URI=mysql://user:pass@localhost:3306/ldap_db
```

The gateway automatically wraps these into a single realm named `"default"`. No code or client changes are needed.

## Per-User Authentication Override

Individual users can override their realm's default authentication chain via the `auth_backends` database column. This allows fine-grained control without creating additional realms.

### Database Schema

Add to your user table:

```sql
ALTER TABLE users ADD COLUMN auth_backends VARCHAR(255) NULL 
  COMMENT 'Comma-separated auth backend types. NULL = use realm default.';
```

### Auth Provider Registry

The registry is a key-value map of backend type names to provider instances, built automatically at startup. It enables per-user overrides by letting the gateway look up any auth provider by name.

**How the registry is built:**

1. For each realm, every auth backend is registered with **two keys**:
   - **Realm-scoped key** (`realm-name:type`) — always registered, unique per realm
   - **Global key** (`type`) — registered only if no other realm claimed that type first

2. All keys are **normalized to lowercase** for case-insensitive lookups

**Example:** Given this configuration with two realms:

```json
[
  {
    "name": "employees",
    "auth": { "backends": [{ "type": "sql" }, { "type": "notification" }] }
  },
  {
    "name": "service-accounts",
    "auth": { "backends": [{ "type": "sql" }] }
  }
]
```

The resulting registry contains:

| Registry Key | Provider | How Registered |
|-------------|----------|----------------|
| `employees:sql` | SQL provider (employees) | Realm-scoped |
| `employees:notification` | MFA provider (employees) | Realm-scoped |
| `service-accounts:sql` | SQL provider (service-accounts) | Realm-scoped |
| `sql` | SQL provider (employees) | Global fallback (first realm wins) |
| `notification` | MFA provider (employees) | Global fallback |

### How Override Resolution Works

When a user has `auth_backends` set (e.g., `'sql,hardware-token'`), each backend name is resolved through a three-level lookup:

```mermaid
flowchart TD
    START["User has auth_backends = 'sql,mfa'"] --> PARSE["Split: ['sql', 'mfa']"]
    PARSE --> LOOP["For each backend name:"]
    
    LOOP --> STEP1["1. Check realm's own providers\n(matched by type name)"]
    STEP1 -->|"found"| USE["Use this provider"]
    STEP1 -->|"not found"| STEP2
    
    STEP2["2. Check registry:\nrealm-scoped key (realm:type)"]
    STEP2 -->|"found"| USE
    STEP2 -->|"not found"| STEP3
    
    STEP3["3. Check registry:\nglobal key (type only)"]
    STEP3 -->|"found"| WARN["Use provider + log warning"]
    STEP3 -->|"not found"| FAIL["Deny authentication:\nunknown backend"]
    
    USE --> CHAIN["Add to auth chain"]
    WARN --> CHAIN
    CHAIN --> NEXT{"More\nbackends?"}
    NEXT -->|"yes"| LOOP
    NEXT -->|"no"| AUTH["Run auth chain sequentially"]
```

**Why three levels?**
- **Level 1** (realm providers) ensures the user gets the exact provider instance configured for their realm
- **Level 2** (realm-scoped registry) enables dynamic/custom backends registered at startup without duplicating config
- **Level 3** (global registry) is a safety net for shared services, but logs a warning since it may use a provider from a different realm

If `auth_backends` is `NULL` or empty, the realm's default auth chain is used with no registry lookup.

### Examples

```sql
-- Service account: skip MFA, only validate password
UPDATE users SET auth_backends = 'sql' WHERE username = 'ci-deployment-bot';

-- Regular employee: use realm default (sql + mfa)
UPDATE users SET auth_backends = NULL WHERE username = 'apant';

-- Executive: require additional hardware token
UPDATE users SET auth_backends = 'sql,mfa,hardware-token' WHERE username = 'ceo';
```

## Use Cases

### 1. Multi-Domain Organization

Serve users from different acquired companies with complete isolation:

```json
[
  {
    "name": "mieweb",
    "baseDn": "dc=mieweb,dc=com",
    "directory": { "backend": "sql", "options": { "database": "mieweb_users" } },
    "auth": { "backends": [{ "type": "sql" }] }
  },
  {
    "name": "bluehive",
    "baseDn": "dc=bluehive,dc=com",
    "directory": { "backend": "sql", "options": { "database": "bluehive_users" } },
    "auth": { "backends": [{ "type": "sql" }] }
  }
]
```

### 2. Service Account MFA Bypass

Prevent automated tools from triggering MFA notifications:

```json
[
  {
    "name": "employees",
    "baseDn": "dc=company,dc=com",
    "directory": { "backend": "sql", "options": { "table": "users" } },
    "auth": { "backends": [{ "type": "sql" }, { "type": "mfa" }] }
  },
  {
    "name": "service-accounts",
    "baseDn": "dc=company,dc=com",
    "directory": { "backend": "sql", "options": { "table": "service_accounts" } },
    "auth": { "backends": [{ "type": "sql" }] }
  }
]
```

### 3. Gradual MFA Rollout

Deploy MFA to subsets of users before full rollout:

```json
[
  {
    "name": "engineering",
    "baseDn": "dc=company,dc=com",
    "directory": { "backend": "sql", "options": { "department": "Engineering" } },
    "auth": { "backends": [{ "type": "sql" }, { "type": "mfa" }] }
  },
  {
    "name": "other-departments",
    "baseDn": "dc=company,dc=com",
    "directory": { "backend": "sql", "options": { "department": "!Engineering" } },
    "auth": { "backends": [{ "type": "sql" }] }
  }
]
```

### 4. Hybrid Authentication

Mix database users with LDAP federation:

```json
[
  {
    "name": "local-users",
    "baseDn": "dc=company,dc=com",
    "directory": { "backend": "sql" },
    "auth": { "backends": [{ "type": "sql" }] }
  },
  {
    "name": "corporate-ad",
    "baseDn": "dc=company,dc=com",
    "directory": { "backend": "ldap", "options": { "host": "ad.corp.local" } },
    "auth": { "backends": [{ "type": "ldap" }] }
  }
]
```

## Migration Guide

### From Single-Realm to Multi-Realm

**Before (flat environment variables):**
```bash
AUTH_BACKENDS=sql,notification
DIRECTORY_BACKEND=sql
LDAP_BASE_DN=dc=mieweb,dc=com
SQL_URI=mysql://localhost/ldap_db
```

**After (multi-realm config):**

1. Create `realms.json`:
```json
[
  {
    "name": "default",
    "baseDn": "dc=mieweb,dc=com",
    "directory": {
      "backend": "sql",
      "options": {
        "sqlUri": "mysql://localhost/ldap_db"
      }
    },
    "auth": {
      "backends": [
        { "type": "sql", "options": { "sqlUri": "mysql://localhost/ldap_db" } },
        { "type": "notification" }
      ]
    }
  }
]
```

2. Set the environment variable:
```bash
REALM_CONFIG=/path/to/realms.json
```

3. Restart the gateway. Behavior is identical — zero downtime.

### Adding New Realms

Append to the realms array and restart. No changes to existing realm configurations are needed.

## Verifying Your Configuration

After deploying a new realm configuration:

**1. Check startup logs for realm initialization:**
```
Initializing multi-realm mode with 2 realm(s)
Realm 'mieweb-employees': baseDN=dc=mieweb,dc=com, directory=sql, auth=[sql, notification]
Realm 'service-accounts': baseDN=dc=mieweb,dc=com, directory=sql, auth=[sql]
```

**2. Test search against each baseDN:**
```bash
ldapsearch -x -H ldaps://localhost:636 -b "dc=mieweb,dc=com" "(uid=testuser)"
```

**3. Test authentication (bind):**
```bash
ldapwhoami -x -H ldaps://localhost:636 \
  -D "uid=testuser,ou=users,dc=mieweb,dc=com" -w password
```

**4. Verify realm isolation** (different baseDN should not return users from another realm):
```bash
ldapsearch -x -H ldaps://localhost:636 -b "dc=bluehive,dc=com" "(uid=mieweb-user)"
# Should return 0 results
```

## Troubleshooting

### User not found during authentication

- **Check realm order** in `realms.json` — first realm with a matching user wins
- **Verify baseDN** matches what the client is sending (case-insensitive)
- **Check directory backend connectivity** — database connection errors are logged

### User authenticates against wrong realm

- Realms sharing a baseDN are checked in config order; move the intended realm earlier in the array
- Check server logs for `"User found in multiple realms"` warnings

### Per-user `auth_backends` override not working

- Verify the backend type name matches exactly (lookups are case-insensitive)
- Check logs for `"Unknown auth backend"` errors — the backend must be registered in the realm or global registry
- Ensure the `auth_backends` column value is comma-separated with no extra whitespace

### MFA still triggering for service accounts

- Confirm the service account is in a realm without the `notification` backend, **OR** set `auth_backends = 'sql'` on the user record
- Verify the user is being found in the correct realm (check logs for realm name)

## Security Considerations

- **Unknown backends fail loudly**: Per-user `auth_backends` referencing an unknown backend throws an error and denies authentication. There is no silent fallback.
- **Data isolation**: Different baseDNs provide complete directory isolation. Realms on different baseDNs never share search results.
- **Auth chain integrity**: All providers in the chain must succeed (sequential AND logic). A single failure rejects the bind.

## Further Reading

- [Example realm configuration](../server/realms.example.json)
- [Custom backend template](../server/backends/template.js)
- [Multi-realm planning document](../Multi-realm.md)
