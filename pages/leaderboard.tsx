import { LeaderboardDashboard } from "@/components/Stats/Leaderboard/LeaderboardDashboard";

/**
 * `/leaderboard` — the community dashboard (#936). A FIXED route, like
 * `/account`: the static export emits a real `leaderboard.html` and no
 * dynamic-route rescue applies; the window rides the query (`?window=all`).
 */
export default function Leaderboard() {
  return <LeaderboardDashboard />;
}
