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
    end
    
    subgraph "LDAP Gateway"
        GW["BaseDN Router\n1 baseDN = 1 Realm"]
    end
    
    subgraph "Realm Layer"
        R1["Realm: mieweb\ndc=mieweb,dc=com"]
        R2["Realm: bluehive\ndc=bluehive,dc=com"]
        
        R1 --> DIR1["SQL Directory\nusers table"]
        R1 --> AUTH1["Auth: SQL + MFA"]
        
        R2 --> DIR2["SQL Directory\nbluehive_users"]
        R2 --> AUTH2["Auth: SQL"]
    end
    
    C1 -->|"bind/search"| GW
    C2 -->|"bind/search"| GW
    
    GW -->|"dc=mieweb,dc=com"| R1
    GW -->|"dc=bluehive,dc=com"| R2
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
| `baseDn` | LDAP subtree root (unique per realm) | `"dc=mieweb,dc=com"` |
| `default` | Mark as default for SSSD discovery (max one) | `true` or omitted |
| `directory` | Backend for user/group lookups | SQL, MongoDB, Proxmox |
| `auth.backends` | Ordered list of authentication providers | SQL, Notification (MFA) |

**Each baseDN maps to exactly one realm (1:1).** The gateway rejects configurations where two realms share the same baseDN at startup. This eliminates cross-realm ambiguity in bind and search operations.

> **Default realm:** Only one realm may be marked `"default": true`. If no realm is explicitly marked, the first realm in the configuration array is used as the default for SSSD discovery (`defaultNamingContext`).

### Routing Behavior

| Operation | Behavior |
|-----------|----------|
| **Bind (auth)** | ldapjs routes by DN suffix to the single realm owning that baseDN |
| **Search** | Queries the single realm's directory provider directly |
| **RootDSE** | Returns all baseDNs in `namingContexts`, plus `defaultNamingContext` for the default realm |

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

When a client binds (authenticates), the gateway routes by baseDN to the single owning realm, looks up the user, and runs the authentication chain:

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as LDAP Gateway
    participant Realm as Realm: mieweb
    participant Auth as Auth Chain

    Client->>Gateway: BIND uid=apant,dc=mieweb,dc=com

    Gateway->>Gateway: Route by baseDN → realm 'mieweb'

    Gateway->>Realm: findUser('apant')
    Realm-->>Gateway: Found (auth_backends: null)

    Gateway->>Gateway: Resolve auth chain

    alt auth_backends is null
        Note over Gateway: Use realm default: [SQL, MFA]
    else auth_backends = 'sql'
        Note over Gateway: Per-user override: [SQL only]
    end

    Gateway->>Auth: SQL password check
    Auth-->>Gateway: Pass
    Gateway->>Auth: MFA notification
    Auth-->>Gateway: Approved

    Gateway-->>Client: BIND SUCCESS (realm: mieweb)
```

### Search Flow

When a client searches, the query is routed to the single realm owning that baseDN:

```mermaid
sequenceDiagram
    participant Client
    participant Gateway as LDAP Gateway
    participant Realm as Realm: mieweb

    Client->>Gateway: SEARCH base=dc=mieweb,dc=com

    Gateway->>Gateway: Route by baseDN → realm 'mieweb'

    Gateway->>Realm: getAllUsers()
    Realm-->>Gateway: [uid=apant, uid=horner, uid=ldap-reader]

    Gateway-->>Client: 3 entries
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
    "default": true,
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
    "name": "bluehive",
    "baseDn": "dc=bluehive,dc=com",
    "directory": {
      "backend": "sql",
      "options": {
        "sqlUri": "mysql://user:pass@db.bluehive.com:3306/bluehive_prod",
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
            "sqlUri": "mysql://user:pass@db.bluehive.com:3306/bluehive_prod",
            "sqlQueryOneUser": "SELECT * FROM users WHERE username = ?"
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
| `baseDn` | string | Yes | LDAP base DN for this realm (must be unique across all realms) |
| `default` | boolean | No | If `true`, this realm's baseDN is advertised as `defaultNamingContext` in RootDSE (for SSSD discovery). Only one realm may be marked as default. |
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

Individual users can override their realm's default authentication chain via the `auth_backends` database column. This allows fine-grained control — for example, service accounts can skip MFA while employees go through the full chain.

### Database Schema

Add to your user table:

```sql
ALTER TABLE users ADD COLUMN auth_backends VARCHAR(255) NULL 
  COMMENT 'Comma-separated auth backend types. NULL = use realm default.';
```

### How Override Resolution Works

When a user authenticates, the gateway checks the `auth_backends` field on their user record. Resolution is **strictly realm-scoped** — the override can only reference backend types configured in the user's own realm:

```mermaid
flowchart TD
    START["User has auth_backends = 'sql'"] --> PARSE["Split: ['sql']"]
    PARSE --> LOOP["For each backend name:"]
    
    LOOP --> STEP1["Look up in realm.authBackendTypes\n(type name → provider instance)"]
    STEP1 -->|"found"| USE["Use this provider"]
    STEP1 -->|"not found"| FAIL["Deny authentication:\nunknown backend"]
    
    USE --> CHAIN["Add to auth chain"]
    CHAIN --> NEXT{"More\nbackends?"}
    NEXT -->|"yes"| LOOP
    NEXT -->|"no"| AUTH["Run auth chain sequentially"]
```

Each realm maintains an `authBackendTypes` map built at startup from the `auth.backends[].type` values in the realm config. The type names come directly from the backend module exports (e.g., `"sql"`, `"notification"`, `"ldap"`).

**Key security property**: If `auth_backends` references a backend type not configured in the user's realm, authentication is **immediately denied**. There is no cross-realm fallback.

If `auth_backends` is `NULL` or empty, the realm's default auth chain is used.

### Examples

```sql
-- Service account: skip MFA, only validate password
UPDATE users SET auth_backends = 'sql' WHERE username = 'ci-deployment-bot';

-- Regular employee: use realm default (sql + mfa)
UPDATE users SET auth_backends = NULL WHERE username = 'apant';

-- Executive: require additional hardware token
UPDATE users SET auth_backends = 'sql,mfa,hardware-token' WHERE username = 'ceo';
```

> **Note:** Backend names in `auth_backends` must match the `type` values from your `auth.backends` configuration (case-insensitive). For example, if your realm has `{"type": "sql"}` and `{"type": "notification"}`, valid override values are `'sql'`, `'notification'`, or `'sql,notification'`.

## Use Cases

### 1. Multi-Domain Organization

Serve users from different acquired companies with complete isolation:

```json
[
  {
    "name": "mieweb",
    "baseDn": "dc=mieweb,dc=com",
    "default": true,
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

### 2. Service Account MFA Bypass (Per-User Override)

Use the `auth_backends` database column to let service accounts skip MFA within the same realm:

```json
[
  {
    "name": "company",
    "baseDn": "dc=company,dc=com",
    "default": true,
    "directory": { "backend": "sql" },
    "auth": { "backends": [{ "type": "sql" }, { "type": "notification" }] }
  }
]
```

```sql
-- Service account: skip MFA, only validate password
UPDATE users SET auth_backends = 'sql' WHERE username = 'ci-deployment-bot';

-- Regular employee: use realm default (sql + notification MFA)
UPDATE users SET auth_backends = NULL WHERE username = 'apant';
```

### 3. Hybrid Authentication

Mix database users with LDAP federation using separate baseDNs:

```json
[
  {
    "name": "local-users",
    "baseDn": "dc=company,dc=com",
    "default": true,
    "directory": { "backend": "sql" },
    "auth": { "backends": [{ "type": "sql" }] }
  },
  {
    "name": "corporate-ad",
    "baseDn": "dc=corp,dc=company,dc=com",
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
    "default": true,
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

Append to the realms array with a **unique baseDN** and restart. No changes to existing realm configurations are needed.

## Verifying Your Configuration

After deploying a new realm configuration:

**1. Check startup logs for realm initialization:**
```
Initializing multi-realm mode with 2 realm(s)
Realm 'mieweb-employees': baseDN=dc=mieweb,dc=com, directory=sql, auth=[sql, notification] (default)
Realm 'bluehive': baseDN=dc=bluehive,dc=com, directory=sql, auth=[sql]
```

**2. Verify RootDSE discovery (SSSD compatibility):**
```bash
ldapsearch -x -H ldaps://localhost:636 -b "" -s base "(objectClass=*)" namingContexts defaultNamingContext
# Should show all baseDNs in namingContexts and the default realm's baseDN in defaultNamingContext
```

**3. Test search against each baseDN:**
```bash
ldapsearch -x -H ldaps://localhost:636 -b "dc=mieweb,dc=com" "(uid=testuser)"
```

**4. Test authentication (bind):**
```bash
ldapwhoami -x -H ldaps://localhost:636 \
  -D "uid=testuser,ou=users,dc=mieweb,dc=com" -w password
```

**5. Verify realm isolation** (different baseDN should not return users from another realm):
```bash
ldapsearch -x -H ldaps://localhost:636 -b "dc=bluehive,dc=com" "(uid=mieweb-user)"
# Should return 0 results
```

## Troubleshooting

### User not found during authentication

- **Verify baseDN** matches what the client is sending (case-insensitive) — each baseDN routes to exactly one realm
- **Check directory backend connectivity** — database connection errors are logged
- **Ensure the user exists** in the realm's directory backend

### Per-user `auth_backends` override not working

- Verify the backend type name matches a type configured in the user's realm (lookups are case-insensitive)
- Check logs for `"Unknown auth backend"` errors — the backend must be configured in the realm's `auth.backends` array
- Ensure the `auth_backends` column value is comma-separated with no extra whitespace

### MFA still triggering for service accounts

- Set `auth_backends = 'sql'` on the service account's user record to skip the `notification` backend
- Verify the user record actually has the column set (not `NULL`)

### SSSD auto-discovery not working with multiple realms

- SSSD requires a single `defaultNamingContext` in the RootDSE. Mark one realm as `"default": true` in your `realms.json`
- If no realm is marked as default, the first realm is used

### Startup failure: duplicate baseDN

- Each baseDN must be unique across all realms. If you need multiple user populations under one baseDN, use a single realm with per-user `auth_backends` overrides instead

## Security Considerations

- **1:1 baseDN-to-realm**: Each baseDN maps to exactly one realm. There is no ambiguity about which realm handles a request — cross-realm user confusion or authentication bypass is not possible.
- **Strictly realm-scoped auth override**: Per-user `auth_backends` can only reference backend types configured in the user's own realm. Unknown backends immediately deny authentication. There is no cross-realm fallback.
- **Auth chain integrity**: All providers in the chain must succeed (sequential AND logic). A single failure rejects the bind.
- **Data isolation**: Different baseDNs provide complete directory isolation. Searches on one baseDN never return results from another realm.

## Further Reading

- [Example realm configuration](../server/realms.example.json)
- [Custom backend template](../server/backends/template.js)
- [Multi-realm planning document](../Multi-realm.md)
