// __tests__/authenticateWithLDAP.test.js
const ldap = require("ldapjs");
const { authenticateWithLDAP } = require("./server");

jest.mock("ldapjs");

describe("authenticateWithLDAP", () => {
  const mockReq = {
    connection: { remoteAddress: "127.0.0.1" },
  };

  it("should return true for successful LDAP bind", async () => {
    const bindMock = jest.fn((dn, pw, cb) => cb(null));
    const unbindMock = jest.fn();

    ldap.createClient.mockReturnValue({
      bind: bindMock,
      unbind: unbindMock,
      on: jest.fn()
    });

    const result = await authenticateWithLDAP("testuser", "testpass", mockReq);
    expect(result).toBe(true);
    expect(bindMock).toHaveBeenCalled();
    expect(unbindMock).toHaveBeenCalled();
  });

  it("should return false for failed bind", async () => {
    const bindMock = jest.fn((dn, pw, cb) => cb(new Error("Invalid credentials")));
    ldap.createClient.mockReturnValue({
      bind: bindMock,
      unbind: jest.fn(),
      on: jest.fn()
    });

    const result = await authenticateWithLDAP("baduser", "badpass", mockReq);
    expect(result).toBe(false);
  });
});