# SSSD Integration Test (SQL backend, test base)

This integration test brings up:
- LDAP Gateway server over LDAPS (port 636) using SQL backend with a test database
- SSSD-enabled SSH client (port 2222) on Debian, configured to use the LDAP gateway

It then validates that:
- Password login succeeds for `testuser` with password `password`
- UID and GID are as expected (uidNumber=10100, gidNumber=20100)
- Group names `developers` and `devops` are present
- `getent passwd testuser` returns correct home and shell

## How to run

```bash
cd server/test/integration-sssd
./run-sssd-integration.sh
```

On success, the script prints "All assertions passed." and tears down the stack.

## Notes
- Base DN: `dc=test,dc=base`
- SQL DSN: `mysql://testuser:testpass@sql:3306/testdb`
- The test data is initialized by `sql/init.sql`.
- SSH port: `2222` (localhost).
