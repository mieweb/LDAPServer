const { extractCredentials } = require("./utils")

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