const fs = require('fs');
const path = require('path');

console.log('Building LDAP Gateway Server...');

// Create dist directory
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy all necessary files to dist
const filesToCopy = [
  'index.js',
  'serverMain.js',
  'providers.js',
  'package.json',
  '.env.example',
  'README.md',
];

const directoriesToCopy = [
  'backends',
  'cert', 
  'config',
  'db',
  'handlers',
  'services',
  'utils',
  'logs',
  'node_modules',
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

console.log('Build complete!');
console.log(`Distribution created in: ${distDir}`);
console.log('');
console.log('To test the build:');
console.log(`  cd ${distDir}`);
console.log('  cp .env.example .env');
console.log('  # Edit .env with your configuration');
console.log('  ./ldap-gateway');