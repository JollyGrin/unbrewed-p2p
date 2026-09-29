import { ChangelogPage } from "@/components/Changelog/ChangelogPage";

/**
 * `/changelog` — the permanent home of every update (unbrewed-p2p-983). A
 * FIXED route, like `/leaderboard`: the static export emits a real
 * `changelog.html`.
 */
export default function Changelog() {
  return <ChangelogPage />;
}
