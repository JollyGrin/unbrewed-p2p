// jest.config.mjs
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Runs before the test framework is installed: jsdom globals that libraries
  // read at import time (see jest.setup.js) must exist by then.
  setupFiles: ["<rootDir>/jest.setup.js"],

  testEnvironment: "jest-environment-jsdom",

  // Several agents share a 4-core / 16 GB VPS and run suites at the same time.
  // Jest's default (cores - 1 workers, ~1.5 GB each here) let two concurrent
  // runs max out CPU and RAM. Half the cores leaves room for a second run;
  // the idle-memory limit recycles workers that bloat across test files.
  // Override per run with --maxWorkers if needed.
  maxWorkers: "50%",
  workerIdleMemoryLimit: "1GB",
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
