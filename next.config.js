/** @type {import('next').NextConfig} */

const { execSync } = require("child_process");
const pkg = require("./package.json");
const { generateChangelogIndex } = require("./lib/buildTools/generateChangelogIndex");

// Regenerate lib/changelog/generatedEntries.ts from content/changelog/*.json
// before anything imports it (unbrewed-p2p-982) — see generateChangelogIndex.js.
generateChangelogIndex();

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
  // Emit browser source maps so the deploy workflow can upload them to
  // PostHog Error Tracking (issue #1548). The workflow deletes every .map
  // from ./out before publishing, so source is never served from Pages.
  productionBrowserSourceMaps: true,
};

module.exports = nextConfig;
