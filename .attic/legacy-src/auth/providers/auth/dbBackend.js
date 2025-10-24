const AuthProvider = require('./authProviderInterface');

class DBBackend extends AuthProvider {
  constructor(dbService) {
    super();
    this.db = dbService;
  }

  async authenticate(username, password) {
    const user = await this.db.findUserByUsername(username);

    if (!user) return false;
    // Compare password securely, assume bcrypt or similar
    return user.password === password; // TODO: Hash comparison
  }
}

module.exports = DBBackend;
