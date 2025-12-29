// Data Loader Utility for Test Data
// 
// Loads test data from centralized test/data/ directory
// Supports JSON, SQL, and text file formats

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

/**
 * Load JSON test data file
 * @param {string} filename - Name of JSON file (e.g., 'common.users.json')
 * @returns {any} Parsed JSON data
 */
function loadJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Test data file not found: ${filepath}`);
  }
  const content = fs.readFileSync(filepath, 'utf8');
  return JSON.parse(content);
}

/**
 * Load SQL test data file
 * @param {string} filename - Name of SQL file (e.g., 'directory.sql.sql')
 * @returns {string} SQL content
 */
function loadSQL(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Test data file not found: ${filepath}`);
  }
  return fs.readFileSync(filepath, 'utf8');
}

/**
 * Load text/config file (e.g., Proxmox .cfg files)
 * @param {string} filename - Name of file
 * @returns {string} File content
 */
function loadText(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Test data file not found: ${filepath}`);
  }
  return fs.readFileSync(filepath, 'utf8');
}

/**
 * Load common users (shared across all backends)
 * @returns {Array} Array of user objects
 */
function loadCommonUsers() {
  return loadJSON('common.users.json');
}

/**
 * Load common groups (shared across all backends)
 * @returns {Array} Array of group objects
 */
function loadCommonGroups() {
  return loadJSON('common.groups.json');
}

/**
 * Load SQL authentication data
 * @returns {string} SQL script content
 */
function loadSQLAuthData() {
  return loadSQL('auth.sql.sql');
}

/**
 * Load SQL directory data
 * @returns {string} SQL script content
 */
function loadSQLDirectoryData() {
  return loadSQL('directory.sql.sql');
}

/**
 * Load MongoDB authentication data
 * @returns {Object} MongoDB data with users array
 */
function loadMongoDBAuthData() {
  return loadJSON('auth.mongodb.json');
}

/**
 * Load MongoDB directory data
 * @returns {Object} MongoDB data with users and groups arrays
 */
function loadMongoDBDirectoryData() {
  return loadJSON('directory.mongodb.json');
}

/**
 * Load Proxmox user.cfg data
 * @returns {string} User configuration content
 */
function loadProxmoxUserData() {
  return loadText('directory.proxmox.user.cfg');
}

/**
 * Load Proxmox shadow.cfg data
 * @returns {string} Shadow configuration content
 */
function loadProxmoxShadowData() {
  return loadText('auth.proxmox.shadow.cfg');
}

/**
 * Load SQLite directory data
 * @returns {string} SQL script content
 */
function loadSQLiteDirectoryData() {
  return loadSQL('directory.sqlite.sql');
}

/**
 * Get test data for specific backend and purpose
 * @param {string} backend - Backend type ('sql', 'mongodb', 'proxmox', 'sqlite')
 * @param {string} purpose - Purpose ('auth', 'directory')
 * @returns {any} Test data in appropriate format
 */
function getTestData(backend, purpose) {
  const loaderMap = {
    'sql.auth': loadSQLAuthData,
    'sql.directory': loadSQLDirectoryData,
    'mongodb.auth': loadMongoDBAuthData,
    'mongodb.directory': loadMongoDBDirectoryData,
    'proxmox.auth': loadProxmoxShadowData,
    'proxmox.directory': loadProxmoxUserData,
    'sqlite.directory': loadSQLiteDirectoryData,
  };

  const key = `${backend}.${purpose}`;
  const loader = loaderMap[key];
  
  if (!loader) {
    throw new Error(`No test data loader for backend: ${backend}, purpose: ${purpose}`);
  }

  return loader();
}

/**
 * List all available test data files
 * @returns {Array<string>} Array of filenames
 */
function listDataFiles() {
  return fs.readdirSync(DATA_DIR);
}

module.exports = {
  loadJSON,
  loadSQL,
  loadText,
  loadCommonUsers,
  loadCommonGroups,
  loadSQLAuthData,
  loadSQLDirectoryData,
  loadMongoDBAuthData,
  loadMongoDBDirectoryData,
  loadProxmoxUserData,
  loadProxmoxShadowData,
  loadSQLiteDirectoryData,
  getTestData,
  listDataFiles,
  DATA_DIR
};
