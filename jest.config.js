module.exports = {
  testEnvironment: "node",
  verbose: true,
  testMatch: ["**/src/**/*.test.js"],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
};
