import { PublicProfilePage } from "@/components/Account/PublicProfilePage";

/**
 * `/stats?u=<username>` — a public, read-only profile.
 *
 * A QUERY PARAM rather than `/stats/[user]`: the site is statically exported,
 * so a dynamic segment would need every username at build time. This emits one
 * plain `stats.html` that reads `?u=` on the client, the same way `/account`
 * already fetches everything after hydration.
 */
export default function Stats() {
  return <PublicProfilePage />;
}
