const ldap = require('ldapjs');

/**
 * Error normalization utilities for LDAP Gateway Core
 * Maps internal errors to proper LDAP error responses
 */

/**
 * Normalize authentication errors to LDAP errors
 * @param {Error} error - Internal error
 * @returns {Error} LDAP error
 */
function normalizeAuthError(error) {
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return new ldap.UnavailableError('Authentication service unavailable');
  }
  
  if (error.code === 'ETIMEDOUT') {
    return new ldap.TimeLimitExceededError('Authentication timeout');
  }
  
  if (error.message && error.message.toLowerCase().includes('invalid credentials')) {
    return new ldap.InvalidCredentialsError('Invalid credentials');
  }
  
  if (error.message && error.message.toLowerCase().includes('access denied')) {
    return new ldap.InsufficientAccessRightsError('Access denied');
  }
  
  // Default to operations error for unhandled cases
  return new ldap.OperationsError('Authentication error');
}

/**
 * Normalize directory search errors to LDAP errors
 * @param {Error} error - Internal error
 * @returns {Error} LDAP error
 */
function normalizeSearchError(error) {
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return new ldap.UnavailableError('Directory service unavailable');
  }
  
  if (error.code === 'ETIMEDOUT') {
    return new ldap.TimeLimitExceededError('Directory search timeout');
  }
  
  if (error.message && error.message.toLowerCase().includes('not found')) {
    return new ldap.NoSuchObjectError('Object not found');
  }
  
  if (error.message && error.message.toLowerCase().includes('permission')) {
    return new ldap.InsufficientAccessRightsError('Insufficient access rights');
  }
  
  // Default to operations error for unhandled cases
  return new ldap.OperationsError('Directory search error');
}

/**
 * Normalize server startup errors to LDAP errors
 * @param {Error} error - Internal error
 * @returns {Error} LDAP error
 */
function normalizeServerError(error) {
  if (error.code === 'EADDRINUSE') {
    return new ldap.UnavailableError(`Port ${error.port} is already in use`);
  }
  
  if (error.code === 'EACCES') {
    return new ldap.InsufficientAccessRightsError(`Permission denied to bind to port ${error.port}`);
  }
  
  if (error.code === 'ENOENT') {
    return new ldap.UnavailableError('Required files not found');
  }
  
  // Default to operations error for unhandled cases
  return new ldap.OperationsError('Server startup error');
}

/**
 * Create a standardized error response object
 * @param {Error} error - LDAP error
 * @param {Object} context - Additional context information
 * @returns {Object} Error response object
 */
function createErrorResponse(error, context = {}) {
  return {
    code: error.code || 1, // Default to operations error code
    name: error.name || 'OperationsError',
    message: error.message || 'An error occurred',
    context: context,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  normalizeAuthError,
  normalizeSearchError,
  normalizeServerError,
  createErrorResponse
};