# Multi-Realm LDAP Gateway Architecture

## Overview

The LDAP Gateway supports **multi-realm architecture**, enabling a single gateway instance to serve multiple directory backends, each with its own baseDN and authentication chain. This allows organizations to:

- Serve users from multiple domains (e.g., `dc=mieweb,dc=com`, `dc=bluehive,dc=com`)
- Apply different authentication requirements per user population (e.g., MFA for employees, password-only for service accounts)
- Isolate directory data across organizational boundaries
- Maintain backward compatibility with single-realm deployments

## Architecture Components

```mermaid
flowchart TB
    subgraph "Client Layer"
        C1["SSSD Client<br/>dc=mieweb,dc=com"]
        C2["SSSD Client<br/>dc=bluehive,dc=com"]
        C3["Service Account<br/>dc=mieweb,dc=com"]
    end
    
    subgraph "LDAP Gateway - Routing Layer"
        GW["LdapEngine<br/>realmsByBaseDn Map"]
        GW -->|"baseDN routing"| ROUTE["O(1) lookup:<br/>lowercased baseDN → realms[]"]
    end
    
    subgraph "Realm Layer"
        R1["Realm: mieweb<br/>dc=mieweb,dc=com"]
        R2["Realm: bluehive<br/>dc=bluehive,dc=com"]
        R3["Realm: service-accounts<br/>dc=mieweb,dc=com"]
        
        R1 --> DIR1["SQLDirectory<br/>users table"]
        R1 --> AUTH1["[SQL, MFA]"]
        
        R2 --> DIR2["SQLDirectory<br/>bluehive_users"]
        R2 --> AUTH2["[SQL]"]
        
        R3 --> DIR3["SQLDirectory<br/>service_accounts"]
        R3 --> AUTH3["[SQL only]"]
    end
    
    C1 -->|"bind/search"| GW
    C2 -->|"bind/search"| GW
    C3 -->|"bind/search"| GW
    
    ROUTE --> R1
    ROUTE --> R2
    ROUTE --> R3
```

### Core Concepts

#### Realm

A **realm** is an isolated authentication/directory domain consisting of:
- **Name**: Unique identifier (e.g., `"mieweb-employees"`)
- **BaseDN**: LDAP subtree root (e.g., `"dc=mieweb,dc=com"`)
- **Directory Provider**: Backend for user/group lookups (SQL, MongoDB, Proxmox, etc.)
- **Auth Providers**: Chain of authentication backends (SQL, LDAP, MFA, etc.)

Multiple realms can share the same baseDN (e.g., employees and service accounts both under `dc=mieweb,dc=com`).

#### BaseDN Routing

The gateway routes LDAP operations by baseDN:
- **Different baseDNs** serve **different subtrees** (completely isolated)
- **Same baseDN** results are **merged** from multiple realms (deduplication applied)
- Routing uses a lowercased baseDN index for O(1) lookups

#### Authentication Chain

Each realm defines a sequential authentication chain:
```javascript
authProviders: [SQLAuth, MFAAuth] // Both must succeed
```

Individual users can override the realm's default chain via the `auth_backends` database column (Phase 3 feature).

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
  },
  {
    "name": "bluehive",
    "baseDn": "dc=bluehive,dc=com",
    "directory": {
      "backend": "sql",
      "options": {
        "sqlUri": "mysql://user:pass@db.bluehive.com:3306/hr_system"
      }
    },
    "auth": {
      "backends": [
        {
          "type": "sql",
          "options": {
            "sqlUri": "mysql://user:pass@db.bluehive.com:3306/hr_system"
          }
        }
      ]
    }
  }
]
```

### Legacy Single-Realm Mode (Backward Compatible)

If `REALM_CONFIG` is **not set**, the gateway operates in legacy mode using flat environment variables:

```bash
AUTH_BACKENDS=sql,notification
DIRECTORY_BACKEND=sql
LDAP_BASE_DN=dc=mieweb,dc=com
SQL_URI=mysql://user:pass@localhost:3306/ldap_db
# ... other SQL/auth-specific env vars
```

The gateway automatically wraps these into a single realm named `"default"`.

## Operational Flows

### Startup Sequence

```mermaid
flowchart TD
    START["Server Startup"] --> CONFIG["ConfigurationLoader.loadConfig()"]
    
    CONFIG --> CHECK{"REALM_CONFIG<br/>set?"}
    
    CHECK -->|"Yes"| LOAD["Load & validate realm config"]
    CHECK -->|"No"| LEGACY["Load flat env vars"]
    
    LOAD --> MULTI["Multi-realm mode"]
    LEGACY --> WRAP["Auto-wrap into single 'default' realm"]
    
    MULTI --> INSTANTIATE["Instantiate providers per realm"]
    WRAP --> INSTANTIATE
    
    INSTANTIATE --> REGISTRY["Build authProviderRegistry"]
    REGISTRY --> ENGINE["Create LdapEngine with realms[]"]
    
    ENGINE --> INIT["_initRealms():<br/>Build realmsByBaseDn routing map"]
    INIT --> HANDLERS["Register LDAP handlers per baseDN"]
    
    HANDLERS --> LISTEN["Server listening on port"]
```

### Authentication Flow

When a client attempts to bind (authenticate):

```mermaid
sequenceDiagram
    participant Client
    participant Engine as LdapEngine
    participant Routing as realmsByBaseDn
    participant R1 as Realm: employees
    participant R2 as Realm: service-accounts
    participant Auth as Auth Chain

    Client->>Engine: BIND uid=ldap-reader,dc=mieweb,dc=com

    Engine->>Engine: Extract baseDN: dc=mieweb,dc=com
    Engine->>Routing: Get realms for 'dc=mieweb,dc=com'
    Routing-->>Engine: [employees, service-accounts]

    Note over Engine: _authenticateAcrossRealms()

    Engine->>R1: findUser('ldap-reader')
    R1-->>Engine: null (not found)

    Engine->>R2: findUser('ldap-reader')
    R2-->>Engine: { username: 'ldap-reader', auth_backends: null }

    Note over Engine: First match wins!<br/>User found in 'service-accounts'

    Engine->>Engine: _resolveAuthChain(realm, user)

    alt user.auth_backends is null/empty
        Engine->>Engine: Use realm default: [SQL]
    else user.auth_backends = 'sql,hardware-token'
        Engine->>Engine: Resolve override from registry
    end

    Engine->>Auth: Sequential auth: SQL.authenticate()
    Auth-->>Engine: true

    Note over Engine: No MFA notification!

    Engine-->>Client: BIND SUCCESS (realm='service-accounts')
```

**Key Points:**
1. **BaseDN Routing**: O(1) lookup determines which realms to check
2. **First-Match Wins**: Realms are checked in config order; first `findUser()` hit wins
3. **Auth Chain Resolution**: Uses realm default or per-user override
4. **Sequential Authentication**: All providers in chain must succeed

### Search Flow

When a client searches for directory entries:

```mermaid
sequenceDiagram
    participant Client
    participant Engine as LdapEngine
    participant Handler as Search Handler
    participant R1 as Realm: employees
    participant R2 as Realm: service-accounts
    participant Dedupe as Deduplication

    Client->>Engine: SEARCH base=dc=mieweb,dc=com<br/>filter=(objectClass=posixAccount)

    Engine->>Handler: Route to handler for 'dc=mieweb,dc=com'
    Handler->>Handler: Lookup realms: [employees, service-accounts]

    Note over Handler: _handleMultiRealmSearch()<br/>Parallel query

    par Query realms in parallel
        Handler->>R1: _handleRealmSearch()
        R1->>R1: getAllUsers()
        R1-->>Handler: [uid=apant, uid=horner]
        
        Handler->>R2: _handleRealmSearch()
        R2->>R2: getAllUsers()
        R2-->>Handler: [uid=ldap-reader, uid=monitoring-bot]
    end

    Handler->>Dedupe: Merge results
    Note over Dedupe: seenDNs Set (lowercased DN keys)<br/>First realm wins for duplicates

    Dedupe-->>Handler: 4 unique entries

    Handler->>Client: Send entries
    Handler->>Client: SearchResultDone
```

**Key Points:**
1. **Parallel Queries**: All realms sharing the baseDN are queried simultaneously
2. **Graceful Degradation**: Realm failures don't block results from other realms
3. **DN Deduplication**: First realm's entry wins for duplicate DNs
4. **Subtree Isolation**: Different baseDNs query different realm sets

## Per-User Authentication Override (Phase 3)

Individual users can override their realm's default authentication chain via the `auth_backends` database column.

### Database Schema

Add to your user table:

```sql
ALTER TABLE users ADD COLUMN auth_backends VARCHAR(255) NULL 
  COMMENT 'Comma-separated auth backend types to override realm default. NULL = use realm default.';
```

### Resolution Priority

When authenticating a user, the auth chain is resolved with three-level precedence:

```mermaid
flowchart TD
    START["User found in realm"] --> CHECK{"user.auth_backends<br/>set?"}
    
    CHECK -->|"NULL/empty"| DEFAULT["Return realm.authProviders"]
    
    CHECK -->|"'sql,mfa'"| PARSE["Split by comma: ['sql', 'mfa']"]
    PARSE --> RESOLVE["For each backend name:"]
    
    RESOLVE --> STEP1["1. Check realm's own auth providers"]
    STEP1 -->|"found"| USE1["Use realm provider"]
    STEP1 -->|"not found"| STEP2
    
    STEP2["2. Check registry: 'realm:type' key"]
    STEP2 -->|"found"| USE2["Use scoped provider"]
    STEP2 -->|"not found"| STEP3
    
    STEP3["3. Check registry: 'type' key (global)"]
    STEP3 -->|"found"| USE3["Use global provider + warn"]
    STEP3 -->|"not found"| ERROR["Throw error: Unknown backend"]
    
    USE1 --> BUILD["Build override chain"]
    USE2 --> BUILD
    USE3 --> BUILD
    BUILD --> RETURN["Return custom chain"]
    
    DEFAULT --> DONE["Authenticate"]
    RETURN --> DONE
    ERROR --> FAIL["Authentication fails"]
```

### Example Usage

**Scenario: Bypass MFA for CI/CD service account**

```sql
-- Service account that needs to skip MFA for automation
UPDATE users SET auth_backends = 'sql' WHERE username = 'ci-deployment-bot';

-- Regular employee (NULL = use realm default: sql,mfa)
UPDATE users SET auth_backends = NULL WHERE username = 'apant';

-- Executive requiring hardware token
UPDATE users SET auth_backends = 'sql,mfa,hardware-token' WHERE username = 'ceo';
```

**Auth Provider Registry**

The registry maps backend type names to provider instances:

```javascript
authProviderRegistry = Map {
  // Realm-scoped (preferred)
  'mieweb-employees:sql' => SQLAuthProvider #1,
  'mieweb-employees:mfa' => MFAAuthProvider #1,
  'mieweb-employees:hardware-token' => HardwareTokenAuth #1,
  
  // Type-only fallback (first registered wins)
  'sql' => SQLAuthProvider #1,
  'mfa' => MFAAuthProvider #1,
  'hardware-token' => HardwareTokenAuth #1
}
```

## Use Cases

### 1. Multi-Domain Organization

Serve users from different acquired companies:

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

Different domains → different baseDNs → complete isolation.

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

Same baseDN, different authentication requirements.

### 3. Gradual MFA Rollout

Deploy MFA to subsets of users:

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

2. Update environment:
```bash
REALM_CONFIG=/path/to/realms.json
# Keep other vars for backward compat if needed
```

3. Restart gateway - **zero downtime**, behavior identical.

### Adding New Realms

Simply append to the realms array and restart:

```json
[
  {
    "name": "existing-realm",
    "baseDn": "dc=company,dc=com",
    ...
  },
  {
    "name": "new-realm",
    "baseDn": "dc=partner,dc=com",
    ...
  }
]
```

No changes to existing realm configurations needed.

## Architecture Decisions

### Why BaseDN Routing is Not Authorization

**BaseDN routing = Addressing**, not authorization. It answers "which mailbox?" not "who can access?".

| Responsibility | Layer | Example |
|---------------|-------|---------|
| **Addressing** | Gateway (baseDN routing) | Deliver search to `dc=mieweb,dc=com` realm |
| **Authentication** | Gateway (auth chain) | Verify user's password and MFA |
| **Authorization** | Client (SSSD filters) | `ldap_access_filter = memberOf=cn=employees,...` |

The gateway doesn't enforce "who can log into which server" - that's the client's job via group membership filters.

### Why Registry Uses Three-Level Lookup

1. **Realm's Own Providers** (highest priority) - Zero ambiguity, guaranteed correct
2. **Realm-Scoped Registry** - Enables dynamic backends without config duplication
3. **Global Registry** - Emergency fallback for truly shared services (logs warnings)

This prevents accidental cross-realm provider sharing (e.g., SQL auth hitting wrong database).

### Why First-Match Wins

Following PAM/nsswitch convention: admin controls priority via config order. If user exists in multiple realms sharing a baseDN, first realm in array wins (with warning logged).

### Why Parallel Realm Search

Realms are independent data sources - querying them sequentially would be unnecessarily slow. Parallel queries with graceful degradation (failed realm doesn't block others) maximize performance and reliability.

## Key Files

| File | Purpose |
|------|---------|
| [server/config/configurationLoader.js](../server/config/configurationLoader.js) | Loads and validates realm config |
| [server/serverMain.js](../server/serverMain.js) | Instantiates providers per realm |
| [npm/src/LdapEngine.js](../npm/src/LdapEngine.js) | Core routing and auth logic |
| [server/providers.js](../server/providers.js) | Provider factory |
| [server/backends/](../server/backends/) | Auth/directory provider implementations |
| [server/realms.example.json](../server/realms.example.json) | Example realm configuration |

## Testing

Multi-realm tests are located in:
- [npm/test/unit/LdapEngine.realms.test.js](../npm/test/unit/LdapEngine.realms.test.js) - Unit tests for realm routing
- [server/test/integration/](../server/test/integration/) - Integration tests with real backends

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| BaseDN routing | O(1) | Map lookup with lowercased key |
| User lookup | O(n) realms | Sequential, stops at first match |
| Search query | O(r) realms | Parallel queries where r = realms sharing baseDN |
| Auth chain resolution | O(p) providers | Sequential validation, short-circuits on failure |

## Security Considerations

1. **Unknown backend = fail-loud**: Per-user `auth_backends` referencing unknown backend throws error (no silent fallback)
2. **Cross-realm warnings**: Using global registry fallback logs warnings to detect misconfigurations
3. **Data isolation**: Different baseDNs = complete isolation (different subtrees)
4. **Auth chain integrity**: All providers must succeed (sequential AND logic)

## Support & Resources

- **Multi-Realm Planning Document**: [Multi-realm.md](../Multi-realm.md)
- **Provider Backend Guide**: [server/backends/template.js](../server/backends/template.js)
- **Example Configurations**: [server/realms.example.json](../server/realms.example.json)
- **Issues/Questions**: GitHub Issues

---

**Version**: Phase 1-3 Complete (per PR #143)  
**Last Updated**: 2026-03-15
