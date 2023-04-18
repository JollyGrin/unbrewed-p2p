module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  collectCoverage: true,
  collectCoverageFrom: [
    "**/*.{js,jsx,ts,tsx}",
    "**/*.tsx",
    "!**/*.type.*",
    "!*.config.*",
    "!*.d.ts",
    "!**/node_modules/**",
    "!**/.next/**",
    "!**/_mocks_/**",
    "!**/styles/**",
    "!**/vendor/**",
    "!**/coverage/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["lcov", "text", "html"],
  //   coverageThreshold: {
  //     global: {
  //       statements: 80,
  //       branches: 80,
  //       functions: 80,
  //       lines: 80,
  //     },
  //   },
  // other Jest configuration options...
};
