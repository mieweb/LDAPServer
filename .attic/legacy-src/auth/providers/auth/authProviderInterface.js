class AuthProvider {
    async authenticate(username, password, req) {
      throw new Error('authenticate must be implemented');
    }
  }
  
  module.exports = AuthProvider;
  