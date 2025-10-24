class AuthService {
    constructor(authProvider) {
      this.authProvider = authProvider;
    }
  
    async authenticate(username, password, req = null) {
      return this.authProvider.authenticate(username, password, req);
    }
  }
  
  module.exports = AuthService;
  