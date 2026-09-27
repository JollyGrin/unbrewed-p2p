/**
 * Fixtures behind `NEXT_PUBLIC_STATS_FIXTURES=1` (see ../client.ts). Wire
 * shapes, typed against the contract; the client runs them through the same
 * normalisers as a real response.
 */
export { fixtureCommunity, fixtureHero } from "./community";
export {
  FIXTURE_USERNAMES,
  fixtureLeaderboard,
  fixturePlayer,
  fixturePlayerGames,
} from "./players";
