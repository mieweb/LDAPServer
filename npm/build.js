const fs = require('fs');
const path = require('path');

// Simple build script to copy src to dist
const srcDir = path.join(__dirname, 'src');
const distDir = path.join(__dirname, 'dist');

// Create dist directory
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Copy all .js files from src to dist
function copyFiles(src, dest) {
  const items = fs.readdirSync(src);
  
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyFiles(srcPath, destPath);
    } else if (item.endsWith('.js')) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${item}`);
    }
  }
}

console.log('Building @ldap-gateway/core...');
copyFiles(srcDir, distDir);
console.log('Build complete!');