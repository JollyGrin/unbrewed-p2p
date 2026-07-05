/** @type {import('next').NextConfig} */

const { execSync } = require("child_process");
const pkg = require("./package.json");

const pathPrefix = process.env.NODE_ENV === "production" ? "" : "";

// Commit hash for in-game bug reports (issue #87). CI passes github.sha via
// NEXT_PUBLIC_COMMIT_SHA; locally we read `git`; "dev" when neither is available.
const commitSha =
  process.env.NEXT_PUBLIC_COMMIT_SHA ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD").toString().trim();
    } catch {
      return "dev";
    }
  })();

console.log("Environment:", process.env.NODE_ENV);
const nextConfig = {
  assetPrefix: pathPrefix,
  env: {
    pathPrefix,
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
  },
  reactStrictMode: true,
};

module.exports = nextConfig;
