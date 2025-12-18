# End-to-End Tests

This **end-to-end test** validates the LDAP Gateway from a real client perspective.

## What This Tests

This test brings up a complete system:
- **LDAP Gateway server** over LDAPS (port 636) using SQL backend with a test database
- **SSSD-enabled SSH client** (port 2222) on Debian, configured to use the LDAP gateway

It validates full authentication flow:
- Password login succeeds for `testuser` with password `password`
- UID and GID are correctly retrieved (uidNumber=10100, gidNumber=20100)
- Group names `developers` and `devops` are present
- `getent passwd testuser` returns correct home directory and shell
- SSH authentication works end-to-end

## Test Classification

- **Unit tests** (`test/unit/`): Fast, isolated tests with mocked dependencies
- **Integration tests** (`test/integration/`): Test LDAP Gateway with real backends (MySQL, MongoDB, Proxmox)
- **E2E tests** (`test/e2e/`): Full system tests with real clients (SSSD, ldapsearch, SSH) ← **You are here**

## How to run

```bash
cd server/test/e2e
./run-sssd-integration.sh
```

On success, the script prints "All assertions passed." and tears down the stack.

## Notes
- Base DN: `dc=test,dc=base`
- SQL DSN: `mysql://testuser:testpass@sql:3306/testdb`
- The test data is initialized by `sql/init.sql`.
- SSH port: `2222` (localhost).
