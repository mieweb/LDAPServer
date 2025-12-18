# LDAP Gateway Test Suite

This directory contains the complete test suite for the LDAP Gateway server, organized following the **Testing Pyramid** pattern.

## Test Organization

```
server/test/
├── unit/                    # Fast, isolated unit tests
├── integration/            # Tests with real backends
├── e2e/                    # End-to-end tests with real clients
└── fixtures/               # Shared test data and utilities
```

## Test Types

### 🔹 Unit Tests (`unit/`)

**Purpose**: Fast, isolated tests with no external dependencies

**Characteristics**:
- Use mocked providers and dependencies
- Test individual functions, classes, and modules in isolation
- Run in milliseconds
- Should be the majority of your tests (70-80% of test suite)

**Examples**:
- `utils/` - Test utility functions (ldapUtils, filterUtils, errorUtils)
- `interfaces/` - Test provider base classes
- `LdapEngine.test.js` - Test LDAP engine with mocked providers

**Run**: `npm test` (includes unit tests by default)

---

### 🔸 Integration Tests (`integration/`)

**Purpose**: Test LDAP Gateway integration with real backend services

**Characteristics**:
- Use real database connections (MySQL, MongoDB)
- Use real file systems (Proxmox)
- Test provider implementations with actual backends
- May require Docker containers or external services
- Slower than unit tests (seconds per test)
- Should be ~15-20% of test suite

**Structure**:
```
integration/
├── auth/                   # Authentication provider tests
│   ├── sql.auth.test.js
│   ├── mongodb.auth.test.js
│   └── proxmox.auth.test.js
├── directory/              # Directory provider tests
│   ├── sql.directory.test.js
│   └── mongodb.directory.test.js
├── engine/                 # LDAP engine integration tests
└── security/               # Security and TLS tests
```

**Examples**:
- Testing MySQL auth provider connects and validates credentials
- Testing MongoDB directory provider queries users and groups
- Testing Proxmox file parsing and authentication

**Run**: `npm run test:integration`

---

### 🔺 E2E Tests (`e2e/`)

**Purpose**: Test the complete system from a client's perspective

**Characteristics**:
- Use real LDAP clients (SSSD, ldapsearch, SSH)
- Test full authentication and query workflows
- Require Docker containers with complete system setup
- Slowest tests (may take minutes)
- Should be ~5-10% of test suite
- Validate real-world usage scenarios

**Structure**:
```
e2e/
└── sssd/                   # SSSD client authentication tests
    ├── client/             # SSSD client container config
    ├── tester/             # Test runner container
    ├── sql/                # Test database initialization
    ├── docker-compose.yml  # Full system setup
    └── run-sssd-integration.sh
```

**Examples**:
- SSSD client authenticating users via LDAP Gateway
- SSH authentication using LDAP credentials
- ldapsearch queries returning correct user/group data
- Full workflow: client → LDAP Gateway → MySQL → response

**Run**: `npm run test:e2e:sssd`

---

## Testing Pyramid

```
      /\
     /  \      E2E Tests (5-10%)
    /____\     - Real clients (SSSD, SSH, ldapsearch)
   /      \    - Full system validation
  /________\   
 /          \  Integration Tests (15-20%)
/____________\ - Real backends (MySQL, MongoDB, Proxmox)
              \ - Provider implementations
               \
 ______________ Unit Tests (70-80%)
|              | - Mocked dependencies
|______________| - Fast, isolated tests

```

## Running Tests

```bash
# Run all tests (primarily unit tests)
npm test

# Run unit tests only
npm test -- test/unit

# Run integration tests
npm run test:integration

# Run security tests
npm run test:security

# Run E2E SSSD tests
npm run test:e2e:sssd

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

## Test Environment Variables

Tests use environment variables for configuration:

```bash
# Database connections
SQL_URI=mysql://user:pass@localhost:3306/testdb
MONGODB_URI=mongodb://localhost:27017/testdb

# LDAP configuration
LDAP_BASE_DN=dc=test,dc=base
REQUIRE_AUTH_FOR_SEARCH=false

# Backend selection
AUTH_BACKENDS=sql
DIRECTORY_BACKEND=sql
```

For E2E tests, these are configured in the respective `docker-compose.yml` files.

## Writing New Tests

### Unit Test Example
```javascript
// test/unit/utils/myUtil.test.js
const { myFunction } = require('../../../src/utils/myUtil');

describe('myFunction', () => {
  test('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Integration Test Example
```javascript
// test/integration/auth/mybackend.auth.test.js
const MyAuthProvider = require('../../../src/auth/providers/mybackend.auth');

describe('MyAuthProvider', () => {
  let provider;
  
  beforeAll(async () => {
    provider = new MyAuthProvider(config);
    await provider.initialize();
  });
  
  test('should authenticate valid user', async () => {
    const result = await provider.authenticate('user', 'pass');
    expect(result).toBe(true);
  });
  
  afterAll(async () => {
    await provider.cleanup();
  });
});
```

### E2E Test Guidelines
- Use Docker Compose to set up the complete environment
- Create shell scripts for test orchestration
- Validate from the client's perspective (SSSD, SSH, ldapsearch)
- Clean up containers after tests complete

## Best Practices

1. **Start with unit tests**: Write unit tests first for new features
2. **Mock external dependencies**: Unit tests should never touch databases or files
3. **Integration tests for providers**: Test each backend provider with real connections
4. **E2E tests for critical flows**: Only test the most important user workflows
5. **Keep tests fast**: Optimize for fast feedback cycles
6. **Clean up after tests**: Always clean up resources in `afterAll`/`afterEach`
7. **Use descriptive names**: Test names should clearly describe what they validate
8. **Follow DRY**: Share fixtures and utilities in `test/fixtures/`

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Pushes to main branches
- Manual workflow dispatch

See `.github/workflows/` for CI configuration.

## Troubleshooting

### Tests failing locally
1. Ensure Docker is running (for integration/e2e tests)
2. Check environment variables are set correctly
3. Verify database services are accessible
4. Run `npm install` to ensure dependencies are up to date

### E2E tests timing out
- Increase timeouts in jest.config.js
- Check Docker container logs: `docker-compose logs`
- Verify ports are not already in use

### Database connection errors
- Ensure MySQL/MongoDB containers are running
- Check connection strings in environment variables
- Verify network connectivity to database hosts
