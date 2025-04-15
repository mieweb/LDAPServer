const { extractCredentials, getUsernameFromFilter } = require("./utils")

describe("extractCredentials", () => {
    it("should extract the username and password from the request", () => {
        const req = {
            dn: "cn=test,ou=users,dc=mie,dc=com",
            credentials: "password123"
        }

        const result = extractCredentials(req);

        expect(result.username).toBe("test");
        expect(result.password).toBe("password123")
    })

    it("should handle requests with an empty dn correctly", () => {
        const req = {
            dn: "",
            credentials: "noPassword"
        }
        const result = extractCredentials(req);

        expect(result.username).toBeUndefined();
        expect(result.password).toBe("noPassword")

    })

    it("should handle requests with an empty dn correctly", () => {
        const req = {
            dn: "wrongFormat",
            credentials: "password"
        }
        const result = extractCredentials(req);

        expect(result.username).toBeUndefined();
        expect(result.password).toBe("password")

    })
})

describe("getUsernameFromFilter", () => {
    it("should extract uid from simple filter", () => {
      const filter = "(uid=ann)";
      const result = getUsernameFromFilter(filter);
      expect(result).toBe("ann");
    });
  
    it("should extract uid from AND filter", () => {
      const filter = "(&(uid=ann)(objectClass=person))";
      const result = getUsernameFromFilter(filter);
      expect(result).toBe("ann");
    });
  
    it("should extract uid from OR filter", () => {
      const filter = "(|(uid=ann)(uid=john))";
      const result = getUsernameFromFilter(filter);
      expect(result).toBe("ann");
    });
  
    it("should return null for filters without uid", () => {
      const filter = "(objectClass=person)";
      const result = getUsernameFromFilter(filter);
      expect(result).toBeNull();
    });
  
    it("should return null for malformed filters", () => {
      const filter = "uid=ann";
      const result = getUsernameFromFilter(filter);
      expect(result).toBeNull();
    });
  });