import { LeaderboardPage } from "@/components/Account/LeaderboardPage";

/**
 * `/leaderboard` — the public board. A FIXED route, like `/account`: the static
 * export emits a real `leaderboard.html` and no dynamic-route rescue applies.
 */
export default function Leaderboard() {
  return <LeaderboardPage />;
}
