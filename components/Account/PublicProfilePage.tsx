/**
 * /stats?u=<username> — any player's profile, read-only, no sign-in (issue #590).
 *
 * A QUERY PARAM, not a dynamic route: the site is statically exported (`next
 * export`), so `/stats/[user]` would need either a build-time list of every
 * account or the 404-rescue dance the share pages do. `/account` already reads
 * everything client-side, and this page does the same — one static `stats.html`
 * that asks the API who `?u=` is once the router hydrates.
 *
 * The body is `ProfileView` with `owner` off: the same header, record, badge
 * case and match history /account renders for you, minus the things only an
 * owner can do. Nothing here is a second implementation of a profile.
 *
 * Both empty states are deliberately calm, in the tone the guest and offline
 * states on /account already set: a username nobody has claimed is an ordinary
 * outcome of a typed URL, not an error.
 */
import { Box, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";

import { ProfileView } from "@/components/Account/ProfileView";
import { AccountShell, Panel } from "@/components/Account/Shell";
import { AccountStatsView } from "@/lib/account/useAccountStats";
import { BadgeCaseState } from "@/lib/account/useBadges";
import { useAccount } from "@/lib/account/useAccount";
import { usePublicGameHistory } from "@/lib/account/useGameHistory";
import { usePublicProfile } from "@/lib/account/usePublicProfile";
import { PublicProfile } from "@/lib/account/publicProfile";

/** `?u=` as a single trimmed username, or null while there isn't one. */
export const usernameFromQuery = (
  raw: string | string[] | undefined,
): string | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

const Shell = ({
  username,
  children,
}: {
  username: string | null;
  children: React.ReactNode;
}) => (
  <AccountShell
    seo={{
      path: username ? `/stats?u=${encodeURIComponent(username)}` : "/stats",
      title: username ? `${username} | Unbrewed` : "Player stats | Unbrewed",
      description: username
        ? `${username}'s Unbrewed record: level, badges and finished Pro games.`
        : "Look up an Unbrewed player's record: level, badges and finished Pro games.",
      // Profiles are public but not worth indexing: they are per-account pages
      // behind a query string, and the leaderboard is the page worth finding.
      noindex: true,
    }}
  >
    {children}
  </AccountShell>
);

const ToLeaderboard = () => (
  <Text
    as={NextLink}
    href="/leaderboard"
    fontSize="0.85rem"
    textDecoration="underline"
    _hover={{ opacity: 0.8 }}
  >
    See the leaderboard
  </Text>
);

/** A one-panel state: a heading, a sentence, and the way onward. */
const Notice = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <Panel maxW="32rem">
    <Text as="h1" fontFamily="LeagueGothic" fontSize="2rem" lineHeight="1.05">
      {title}
    </Text>
    <Text fontSize="0.9rem" opacity={0.8} my="0.6rem">
      {children}
    </Text>
    <ToLeaderboard />
  </Panel>
);

/**
 * The public payload in the shapes the shared sections already speak.
 *
 * A public profile arrives in ONE request, so both are "ready" the moment it
 * lands — there is no per-section loading state to model, and the badge case is
 * never busy because nothing on this page can write.
 */
const asBadgeState = (profile: PublicProfile): BadgeCaseState => ({
  status: "ready",
  badges: profile.badges.badges,
  selected: profile.badges.selected,
  busy: false,
  notice: null,
});

const asStatsView = (profile: PublicProfile): AccountStatsView => ({
  status: "ready",
  stats: profile.stats,
});

export const PublicProfilePage = () => {
  const router = useRouter();
  // `isReady` is false on the very first client render of a static export, when
  // `query` is still empty — reading `?u=` before then would flash not-found on
  // every load. `undefined` (a router without the flag, as in tests) is treated
  // as ready, since its query is already populated.
  const ready = router?.isReady !== false;
  const username = ready ? usernameFromQuery(router?.query?.u) : null;

  const { status, profile } = usePublicProfile(username);
  // History waits for the profile rather than racing it: a typo'd username
  // should cost one 404, not two, and the list has nowhere to render until the
  // page knows the player exists.
  const history = usePublicGameHistory(status === "ready" ? username : null);
  // Only to spot yourself; the probe is the navbar chip's, already in flight.
  const { account } = useAccount();
  const isSelf =
    !!account &&
    !!profile &&
    account.username.toLowerCase() === profile.username.toLowerCase();

  if (ready && !username) {
    return (
      <Shell username={null}>
        <Notice title="Player stats">
          Add a player to the address to see their record — for example{" "}
          <Box as="code">/stats?u=JollyGrin</Box>. The leaderboard links to
          everyone who has finished a Pro game while signed in.
        </Notice>
      </Shell>
    );
  }

  if (status === "loading") {
    return (
      <Shell username={username}>
        <Text fontSize="0.9rem" opacity={0.7}>
          Loading {username ?? "player"}…
        </Text>
      </Shell>
    );
  }

  if (status === "not_found") {
    return (
      <Shell username={username}>
        <Notice title="No player by that name">
          Nobody has signed in to Unbrewed as{" "}
          <Text as="span" fontWeight={600}>
            {username}
          </Text>
          . Names come from Discord, so check the spelling — profiles only exist
          for players who have signed in.
        </Notice>
      </Shell>
    );
  }

  if (status === "unavailable" || !profile) {
    return (
      <Shell username={username}>
        <Notice title="Player stats">
          Player profiles are unavailable right now. Everything else on Unbrewed
          works as usual — try again later.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell username={profile.username}>
      <ProfileView
        username={profile.username}
        avatarUrl={profile.avatarUrl}
        subtitle="Unbrewed player"
        badges={asBadgeState(profile)}
        stats={asStatsView(profile)}
        history={history}
        headerAction={
          isSelf ? (
            <Text
              as={NextLink}
              href="/account"
              data-testid="stats-self-link"
              flexShrink={0}
              fontSize="0.8rem"
              textDecoration="underline"
              _hover={{ opacity: 0.8 }}
            >
              This is you
            </Text>
          ) : null
        }
      />
      <Box mt="0.9rem">
        <ToLeaderboard />
      </Box>
    </Shell>
  );
};
