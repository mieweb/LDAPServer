#!/usr/bin/env node
// LDAP Gateway Server
// This is a bundled distribution - for development, use the source files

const path = require('path');
const fs = require('fs');

// Set the working directory to the script location
process.chdir(__dirname);

// Load the main server
try {
  const serverMain = require('./serverMain.js');
  serverMain().catch(error => {
    console.error('Failed to start LDAP Gateway Server:', error);
    process.exit(1);
  });
} catch (error) {
  console.error('Failed to load LDAP Gateway Server:', error);
  process.exit(1);
}