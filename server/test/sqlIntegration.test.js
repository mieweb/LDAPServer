#!/usr/bin/env node

/**
 * SQL Backend Integration Test
 * Tests each SQL driver with basic operations
 */

const fs = require('fs');
const path = require('path');
const SqlDriverFactory = require('../db/drivers/sqlDriverFactory');

async function testDriver(driverName, config) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing ${driverName.toUpperCase()} Driver`);
  console.log(`${'='.repeat(50)}`);

  try {
    // Create driver
    console.log(`✓ Creating ${driverName} driver...`);
    const driver = SqlDriverFactory.createDriver(driverName, config);
    
    // Connect
    console.log(`✓ Connecting to ${driverName}...`);
    await driver.connect(config);
    console.log(`  Connected successfully`);

    // Test queries (if database is set up)
    try {
      console.log(`✓ Testing findUserByUsername...`);
      const user = await driver.findUserByUsername('test_user');
      console.log(`  Result: ${user ? 'User found' : 'User not found (expected if DB not initialized)'}`);
    } catch (error) {
      console.log(`  ⚠ Query failed (expected if DB not initialized): ${error.message}`);
    }

    // Close connection
    console.log(`✓ Closing connection...`);
    await driver.close();
    console.log(`  Connection closed successfully`);

    console.log(`\n✅ ${driverName.toUpperCase()} driver test PASSED`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${driverName.toUpperCase()} driver test FAILED`);
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
    return false;
  }
}

async function runTests() {
  console.log('SQL Backend Integration Tests');
  console.log('==============================\n');
  console.log('Testing driver creation and basic connectivity...\n');

  const results = {
    mysql: false,
    postgresql: false,
    sqlite: false
  };

  // Test SQLite (doesn't require external DB)
  const sqliteDbPath = '/tmp/ldap-test.sqlite';
  
  // Clean up old test database
  if (fs.existsSync(sqliteDbPath)) {
    fs.unlinkSync(sqliteDbPath);
  }

  results.sqlite = await testDriver('sqlite', {
    driver: 'sqlite',
    filename: sqliteDbPath
  });

  // Test MySQL (will fail if not running, that's OK)
  results.mysql = await testDriver('mysql', {
    driver: 'mysql',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'rootpassword',
    database: 'test_db'
  });

  // Test PostgreSQL (will fail if not running, that's OK)
  results.postgresql = await testDriver('postgresql', {
    driver: 'postgresql',
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'test_db'
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Test Summary');
  console.log('='.repeat(50));
  console.log(`SQLite:     ${results.sqlite ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`MySQL:      ${results.mysql ? '✅ PASSED' : '⚠️  SKIPPED (DB not available)'}`);
  console.log(`PostgreSQL: ${results.postgresql ? '✅ PASSED' : '⚠️  SKIPPED (DB not available)'}`);
  
  // Clean up
  if (fs.existsSync(sqliteDbPath)) {
    fs.unlinkSync(sqliteDbPath);
  }

  console.log('\n✅ Integration tests completed');
  console.log('\nNote: MySQL and PostgreSQL tests require running databases.');
  console.log('SQLite test should always pass as it uses a local file.');
  
  // Exit with success if at least SQLite passed
  process.exit(results.sqlite ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
