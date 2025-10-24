const fs = require('fs');
const path = require('path');

console.log('Building LDAP Gateway Server...');

// Create dist directory
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Create a simple launcher script
const launcherScript = `#!/usr/bin/env node

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
`;

// Copy all necessary files to dist
const filesToCopy = [
  'index.js',
  'serverMain.js',
  'providers.js',
  'package.json',
  '.env.example'
];

const directoriesToCopy = [
  'auth',
  'cert', 
  'config',
  'constants',
  'db',
  'handlers',
  'services',
  'utils',
  'logs',
  'node_modules'
];

// Copy files
for (const file of filesToCopy) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(distDir, file));
    console.log(`Copied: ${file}`);
  }
}

// Copy directories
function copyDirectoryRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const items = fs.readdirSync(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const dir of directoriesToCopy) {
  if (fs.existsSync(dir)) {
    copyDirectoryRecursive(dir, path.join(distDir, dir));
    console.log(`Copied directory: ${dir}`);
  }
}

// Write the launcher script
const launcherPath = path.join(distDir, 'ldap-gateway');
fs.writeFileSync(launcherPath, launcherScript);

// Make launcher executable on Unix systems
if (process.platform !== 'win32') {
  fs.chmodSync(launcherPath, '755');
}

// Create a README for the distribution
const readmeContent = `# LDAP Gateway Server

This is a bundled distribution of the LDAP Gateway Server.

## Quick Start

1. Copy .env.example to .env and configure your settings
2. Run the server:
   - Linux/macOS: ./ldap-gateway
   - Windows: node ldap-gateway

## Configuration

See .env.example for all available configuration options.

## Documentation

For full documentation, visit: https://github.com/mieweb/LDAPServer
`;

fs.writeFileSync(path.join(distDir, 'README.md'), readmeContent);

console.log('Build complete!');
console.log(`Distribution created in: ${distDir}`);
console.log('');
console.log('To test the build:');
console.log(`  cd ${distDir}`);
console.log('  cp .env.example .env');
console.log('  # Edit .env with your configuration');
console.log('  ./ldap-gateway');