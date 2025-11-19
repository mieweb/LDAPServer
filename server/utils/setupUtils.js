const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const os = require('os');

function getHostnameWithDomain() {
  try {
    // Try to get FQDN from hostname command
    const hostname = execSync('hostname -f', { encoding: 'utf8', timeout: 5000 }).trim();
    if (hostname && hostname.includes('.')) {
      return hostname;
    }
  } catch (error) {
    // Fallback methods
  }

  try {
    // Try to get search domain from resolv.conf
    const resolvConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const searchMatch = resolvConf.match(/^search\s+(.+)$/m);
    const domainMatch = resolvConf.match(/^domain\s+(.+)$/m);
    
    const hostname = os.hostname();
    const domain = searchMatch?.[1]?.split(' ')[0] || domainMatch?.[1];
    
    if (domain) {
      return `${hostname}.${domain}`;
    }
  } catch (error) {
    // Ignore errors reading resolv.conf
  }

  // Final fallback
  return os.hostname();
}

function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function askQuestion(rl, question, defaultValue = '') {
  return new Promise((resolve) => {
    const prompt = defaultValue 
      ? `${question} [${defaultValue}]: `
      : `${question}: `;
    
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function runInteractiveSetup() {
  console.log('\n🔧 LDAP Server Configuration Setup');
  console.log('=====================================\n');
  console.log('Let\'s configure your LDAP server with the essential settings.\n');

  const rl = createReadlineInterface();
  const config = {};

  try {
    // Get hostname with domain detection
    const detectedHostname = getHostnameWithDomain();
    
    // Only ask for hostname if we couldn't detect a proper FQDN
    if (detectedHostname === os.hostname() || !detectedHostname.includes('.')) {
      config.LDAP_COMMON_NAME = await askQuestion(rl, 'Enter server hostname (FQDN recommended)', detectedHostname);
    } else {
      config.LDAP_COMMON_NAME = await askQuestion(rl, 'Server hostname', detectedHostname);
    }

    // Generate and confirm base DN from hostname
    const defaultBaseDn = config.LDAP_COMMON_NAME === 'localhost' 
      ? 'dc=localhost'
      : config.LDAP_COMMON_NAME.split('.').map(part => `dc=${part}`).join(',');
    
    config.LDAP_BASE_DN = await askQuestion(rl, 'LDAP Base DN', defaultBaseDn);

    // Authentication backend - simplified choice
    console.log('\nAuthentication backends:');
    console.log('  sql     - Use MySQL database for authentication');
    console.log('  mongodb - Use MongoDB database for authentication');
    console.log('  ldap    - Delegate authentication to another LDAP server');
    console.log('  proxmox - Use Proxmox VE authentication');
    config.AUTH_BACKEND = await askQuestion(rl, 'Authentication backend (sql/mongodb/ldap/proxmox)', 'sql');

    // Directory backend - simplified choice
    console.log('\nDirectory backends:');
    console.log('  sql     - Use MySQL database for user/group directory');
    console.log('  mongodb - Use MongoDB database for user/group directory');
    console.log('  proxmox - Use Proxmox VE user configuration');
    config.DIRECTORY_BACKEND = await askQuestion(rl, 'Directory backend (sql/mongodb/proxmox)', 'sql');

    // Only ask for additional config if needed
    if (config.AUTH_BACKEND === 'ldap') {
      console.log('\n🔗 LDAP Authentication Configuration:');
      config.LDAP_SERVER_URL = await askQuestion(rl, 'LDAP Server URL', 'ldap://localhost:389');
      config.LDAP_BIND_DN = await askQuestion(rl, 'LDAP Bind DN (for authentication)');
      config.LDAP_BIND_PASSWORD = await askQuestion(rl, 'LDAP Bind Password');
      config.LDAP_USER_BASE_DN = await askQuestion(rl, 'LDAP User Base DN', config.LDAP_BASE_DN);
    }

    if (config.DIRECTORY_BACKEND === 'proxmox') {
      console.log('\n🖥️  Proxmox Configuration:');
      config.PROXMOX_USER_CFG = await askQuestion(rl, 'Proxmox user.cfg path', '/etc/pve/user.cfg');
    }

    // Set sensible defaults for other options
    config.LDAP_PORT = '636';
    config.LDAP_UNENCRYPTED = 'false';
    config.ENABLE_NOTIFICATION = 'false';
    config.LOG_LEVEL = 'info';

    // Ask for database config if using mysql or mongodb backend
    if (config.AUTH_BACKEND === 'sql' || config.DIRECTORY_BACKEND === 'sql') {
      console.log('\n📊 MySQL Database Configuration:');
      config.SQL_URI = await askQuestion(rl, 'SQL connection URI', 'sqlite://ldap_user_db.sqlite');
      config.SQL_QUERY_ALL_USERS = await askQuestion(rl, 'SQL query to get all users', 'SELECT * FROM users');
      config.SQL_QUERY_ALL_GROUPS = await askQuestion(rl, 'SQL query to get all groups', 'SELECT * FROM groups');
      config.SQL_QUERY_ONE_USER = await askQuestion(rl, 'SQL query to find one user by username', 'SELECT * FROM users WHERE username = ?');
      config.SQL_QUERY_GROUPS_BY_MEMBER = await askQuestion(rl, 'SQL query to find groups by member username', 'SELECT g.* FROM groups g JOIN user_groups ug ON g.id = ug.group_id JOIN users u ON ug.user_id = u.id WHERE u.username = ?');
    } else if (config.AUTH_BACKEND === 'mongodb' || config.DIRECTORY_BACKEND === 'mongodb') {
      console.log('\n📊 MongoDB Configuration:');
      config.MONGO_URI = await askQuestion(rl, 'MongoDB URI', 'mongodb://localhost:27017/ldap_user_db');
      config.MONGO_DATABASE = await askQuestion(rl, 'MongoDB database name', 'ldap_user_db');
    }

  } finally {
    rl.close();
  }

  return config;
}

function generateEnvFile(config) {
  const envPath = path.join(process.cwd(), '.env');
  
  let envContent = '# LDAP Server Configuration\n';
  envContent += '# Generated by interactive setup\n\n';
  
  envContent += '# Server Configuration\n';
  envContent += `LDAP_COMMON_NAME=${config.LDAP_COMMON_NAME}\n`;
  envContent += `LDAP_BASE_DN=${config.LDAP_BASE_DN}\n`;
  envContent += `PORT=${config.LDAP_PORT}\n`;
  envContent += `LDAP_UNENCRYPTED=${config.LDAP_UNENCRYPTED}\n\n`;
  
  envContent += '# Authentication and Directory\n';
  envContent += `AUTH_BACKENDS=${config.AUTH_BACKEND}\n`;
  envContent += `DIRECTORY_BACKEND=${config.DIRECTORY_BACKEND}\n\n`;
  
  if (config.AUTH_BACKEND === 'sql' || config.DIRECTORY_BACKEND === 'sql') {
    envContent += '# SQL Database Configuration\n';
    envContent += `SQL_URI=${config.SQL_URI}\n`;
    envContent += `SQL_QUERY_ALL_USERS=${config.SQL_QUERY_ALL_USERS}\n`;
    envContent += `SQL_QUERY_ALL_GROUPS=${config.SQL_QUERY_ALL_GROUPS}\n`;
    envContent += `SQL_QUERY_ONE_USER=${config.SQL_QUERY_ONE_USER}\n`;
    envContent += `SQL_QUERY_GROUPS_BY_MEMBER=${config.SQL_QUERY_GROUPS_BY_MEMBER}\n\n`;
  }
  
  if (config.AUTH_BACKEND === 'mongodb' || config.DIRECTORY_BACKEND === 'mongodb') {
    envContent += '# MongoDB Configuration\n';
    envContent += `MONGO_URI=${config.MONGO_URI}\n`;
    envContent += `MONGO_DATABASE=${config.MONGO_DATABASE}\n\n`;
  }
  
  if (config.LDAP_SERVER_URL) {
    envContent += '# LDAP Backend Configuration\n';
    envContent += `LDAP_SERVER_URL=${config.LDAP_SERVER_URL}\n`;
    envContent += `LDAP_BIND_DN=${config.LDAP_BIND_DN}\n`;
    envContent += `LDAP_BIND_PASSWORD=${config.LDAP_BIND_PASSWORD}\n`;
    envContent += `LDAP_USER_BASE_DN=${config.LDAP_USER_BASE_DN}\n\n`;
  }
  
  if (config.PROXMOX_USER_CFG) {
    envContent += '# Proxmox Configuration\n';
    envContent += `PROXMOX_USER_CFG=${config.PROXMOX_USER_CFG}\n\n`;
  }
  
  envContent += '# Default Settings\n';
  envContent += `ENABLE_NOTIFICATION=${config.ENABLE_NOTIFICATION}\n`;
  envContent += `LOG_LEVEL=${config.LOG_LEVEL}\n`;
  envContent += '\n# Additional options can be added manually:\n';
  envContent += '# LDAP_CERT_PATH=/path/to/cert.pem\n';
  envContent += '# LDAP_KEY_PATH=/path/to/key.pem\n';
  envContent += '# NOTIFICATION_URL=http://example.com/webhook\n';
  envContent += '# PROXMOX_SHADOW_CFG=/etc/pve/priv/shadow.cfg\n';
  
  fs.writeFileSync(envPath, envContent);
  console.log(`\n✅ Configuration saved to ${envPath}`);
  console.log('🚀 Starting LDAP server...\n');
}

async function checkAndSetupEnvironment(forceReconfig = false) {
  const envPath = path.join(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath) || forceReconfig) {
    if (forceReconfig && fs.existsSync(envPath)) {
      console.log('\n🔄 Reconfiguring LDAP server...');
    } else {
      console.log('No .env file found.');
    }
    
    const config = await runInteractiveSetup();
    generateEnvFile(config);
    return true; // Indicates setup was run
  }
  
  return false; // No setup needed
}

module.exports = {
  checkAndSetupEnvironment,
  getHostnameWithDomain
};
