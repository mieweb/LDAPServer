# End-to-End Tests

This directory contains end-to-end tests that validate the LDAP Gateway from a **real client perspective**.

## What are E2E Tests?

E2E (End-to-End) tests validate the complete system workflow:
- Real LDAP clients (SSSD, ldapsearch, SSH)
- Full LDAP Gateway server
- Real backend databases (MySQL, MongoDB)
- Actual network communication over LDAPS

These tests ensure the system works correctly in real-world scenarios.

## Available E2E Tests

### SSSD Authentication Test (`sssd/`)
Tests SSSD (System Security Services Daemon) client authentication against the LDAP Gateway.

**What it validates**:
- SSH login with LDAP credentials
- User information retrieval (`getent passwd`)
- Group membership resolution (`getent group`)
- UID/GID number mapping
- Home directory and shell configuration

**Run**: `npm run test:e2e:sssd`

See [`sssd/README.md`](sssd/README.md) for details.

## Future E2E Tests

Potential additional E2E tests to add:

- **ldapsearch**: Direct LDAP queries with ldapsearch client
- **SSH with key auth**: SSH public key authentication via LDAP
- **Multiple backends**: Testing with different backend combinations
- **High availability**: Testing failover and redundancy
- **Performance**: Load testing with multiple concurrent clients

## Running E2E Tests

E2E tests use Docker Compose to create isolated test environments:

```bash
# From project root
cd server/test/e2e/sssd
./run-sssd-integration.sh

# Or using npm scripts
npm run test:e2e:sssd
```

## Creating New E2E Tests

1. Create a new directory under `e2e/` for your test scenario
2. Add `docker-compose.yml` with all required services
3. Create test scripts that validate the workflow
4. Add README documenting what the test validates
5. Add npm script to `server/package.json`

Example structure:
```
e2e/
└── mytest/
    ├── README.md               # Test documentation
    ├── docker-compose.yml      # Service definitions
    ├── run-test.sh            # Test orchestration script
    ├── client/                # Client container config
    └── data/                  # Test data initialization
```

## Tips for E2E Testing

- **Keep tests focused**: Each E2E test should validate one specific workflow
- **Use realistic data**: Test data should mirror production scenarios
- **Clean up properly**: Always tear down Docker containers after tests
- **Make tests reliable**: Avoid flaky tests by adding appropriate waits
- **Document well**: E2E tests should be easy for others to understand and run
