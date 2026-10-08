// Render tests that take over ~5 s each in isolation: excluded from `npm test`, run by `npm run test:slow`.
export const slowTests = [
  "components/TablePlace/TablePage.test.tsx",
  "test/pro/tournamentTicket.test.tsx",
  "components/Pro/ProLanding.test.tsx",
  "test/pro/randomStagePick.test.tsx",
  "test/pro/itemsChip.test.tsx",
  "test/pro/lobbySetupRail.test.tsx",
  "scripts/renderFuzz/renderFuzz.test.tsx",
  "test/pro/randomHeroPick.test.tsx",
  "test/sandbox/relaySync.test.tsx",
  "components/Stats/Leaderboard/LeaderboardDashboard.test.tsx",
  "test/pro/mobileLayout.test.tsx",
];

const escape = (path) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** testPathIgnorePatterns / testRegex entries matching exactly the slow files. */
export const slowTestPatterns = slowTests.map((path) => `<rootDir>/${escape(path)}$`);
