/**
 * A player's profile, as one component (issue #590).
 *
 * The whole point of this file is that there is exactly one of it. `/account`
 * is a SUPERSET of `/stats?u=<you>`, not a sibling: both render this, and
 * `/account` adds the owner-only extras (badge selection, the Discord perks
 * card, sign-out) around it. Clicking your own row on the leaderboard therefore
 * shows you precisely what everybody else sees, and no section of a profile is
 * implemented twice.
 *
 * Everything arrives as props — the pages own the fetching, because whose data
 * this is changes between them (`/me/*` vs `/players?u=`) and a component that
 * fetched for itself could only ever be one of the two.
 *
 * `owner` is the single mode flag, and it does two things: it makes the badge
 * case interactive, and it puts the copy in the first person. A read-only view
 * also carries the "for fun" caveat — see components/Account/StatsCaveat.
 */
import { Box } from "@chakra-ui/react";

import { AccountBadgeCase } from "@/components/Account/AccountBadges";
import { AccountGames } from "@/components/Account/AccountGames";
import { AccountStatsSection } from "@/components/Account/AccountStats";
import { ProfileHeader } from "@/components/Account/ProfileHeader";
import { StatsCaveat } from "@/components/Account/StatsCaveat";
import { levelProgress } from "@/lib/account/stats";
import { AccountStatsView } from "@/lib/account/useAccountStats";
import { BadgeCaseState } from "@/lib/account/useBadges";
import { GameHistoryView } from "@/lib/account/useGameHistory";

export interface ProfileViewProps {
  username: string;
  avatarUrl: string | null;
  /** The badge case. In owner mode its tiles are wearable. */
  badges: BadgeCaseState;
  stats: AccountStatsView;
  history: GameHistoryView;
  /** True on /account, false on a public profile. */
  owner?: boolean;
  /** The line under the name. */
  subtitle: string;
  /** Owner-only header controls (sign out, and the way to the leaderboard). */
  headerAction?: React.ReactNode;
  /**
   * Owner-only sections, rendered between the badge case and the match history
   * — the Discord perks card today. A public profile passes nothing, which is
   * how "the API must never publish somebody's Discord link state" stays true
   * by construction rather than by a conditional.
   */
  children?: React.ReactNode;
}

export const ProfileView = ({
  username,
  avatarUrl,
  badges,
  stats,
  history,
  owner = false,
  subtitle,
  headerAction,
  children,
}: ProfileViewProps) => (
  <>
    <ProfileHeader
      username={username}
      avatarUrl={avatarUrl}
      // The level bar reads the same payload the record block does, so the page
      // makes one stats request however many things draw from it.
      level={stats.stats ? levelProgress(stats.stats) : null}
      badges={badges}
      subtitle={subtitle}
      action={headerAction}
    />
    <AccountStatsSection view={stats} owner={owner} name={username} />
    <AccountBadgeCase state={badges} readOnly={!owner} name={username} />
    {children}
    <AccountGames history={history} owner={owner} name={username} />
    {owner ? null : (
      <Box mt="0.9rem">
        <StatsCaveat />
      </Box>
    )}
  </>
);
