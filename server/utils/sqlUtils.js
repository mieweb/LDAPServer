const logger = require('./logger');

/**
 * Build Sequelize options with optional SSL configuration
 * Shared between SQL auth and directory providers to avoid duplication.
 * 
 * @param {Object} options - Provider options (sqlSsl overrides env var)
 * @returns {Object} Sequelize constructor options
 */
function buildSequelizeOptions(options = {}) {
  const seqOptions = { logging: msg => logger.debug(msg) };

  const sqlSsl = options.sqlSsl ?? process.env.SQL_SSL;
  // Handle both boolean false and string 'false'/'0' from JSON config or env vars
  if (sqlSsl === false || sqlSsl === 'false' || sqlSsl === '0') {
    seqOptions.dialectOptions = { ssl: false };
  }

  return seqOptions;
}

module.exports = { buildSequelizeOptions };
