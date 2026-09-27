/**
 * /stats?u=<username> — any player's profile, read-only, no sign-in (issue #590).
 *
 * A QUERY PARAM, not a dynamic route: the site is statically exported (`next
 * export`), so `/stats/[user]` would need either a build-time list of every
 * account or the 404-rescue dance the share pages do. `/account` already reads
 * everything client-side, and this page does the same — one static `stats.html`
 * that asks the API who `?u=` is once the router hydrates.
 *
 * The body is the stats dashboard (issue #937, components/Stats/PlayerDashboard):
 * a public, read-only view built on the same record helpers /account uses
 * (lib/account/stats), so the two pages never disagree about the numbers.
 * `/account` itself keeps `ProfileView` and links here.
 *
 * Both empty states are deliberately calm, in the tone the guest and offline
 * states on /account already set: a username nobody has claimed is an ordinary
 * outcome of a typed URL, not an error.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { useRouter } from "next/router";

import { PageSeo } from "@/components/Helmet/Head";
import { Navbar } from "@/components/Navbar";
import { AccountShell, Panel } from "@/components/Account/Shell";
import { PlayerDashboard } from "@/components/Stats/PlayerDashboard";
import { PAGE_BG } from "@/components/Stats/tokens";
import { useAccount } from "@/lib/account/useAccount";
import { useStatsPlayer, useStatsPlayerGameHistory } from "@/lib/stats/hooks";

/** `?u=` as a single trimmed username, or null while there isn't one. */
export const usernameFromQuery = (
  raw: string | string[] | undefined,
): string | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

const seoFor = (username: string | null) => ({
  path: username ? `/stats?u=${encodeURIComponent(username)}` : "/stats",
  title: username ? `${username} | Unbrewed` : "Player stats | Unbrewed",
  description: username
    ? `${username}'s Unbrewed record: level, badges and finished Pro games.`
    : "Look up an Unbrewed player's record: level, badges and finished Pro games.",
  // Profiles are public but not worth indexing: they are per-account pages
  // behind a query string, and the leaderboard is the page worth finding.
  noindex: true,
});

const Shell = ({
  username,
  children,
}: {
  username: string | null;
  children: React.ReactNode;
}) => <AccountShell seo={seoFor(username)}>{children}</AccountShell>;

/** The dashboard runs edge to edge: navbar, dark band, then its own columns. */
const WideShell = ({ username, children }: { username: string; children: React.ReactNode }) => (
  <Flex flexDir="column" bg={PAGE_BG} minH="100svh">
    <PageSeo {...seoFor(username)} />
    <Box color="brand.secondary">
      <Navbar />
    </Box>
    {children}
  </Flex>
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

export const PublicProfilePage = () => {
  const router = useRouter();
  // `isReady` is false on the very first client render of a static export, when
  // `query` is still empty — reading `?u=` before then would flash not-found on
  // every load. `undefined` (a router without the flag, as in tests) is treated
  // as ready, since its query is already populated.
  const ready = router?.isReady !== false;
  const username = ready ? usernameFromQuery(router?.query?.u) : null;

  const { status, data: profile } = useStatsPlayer(username);
  // History waits for the profile rather than racing it: a typo'd username
  // should cost one 404, not two, and the list has nowhere to render until the
  // page knows the player exists.
  const history = useStatsPlayerGameHistory(status === "ready" ? username : null);
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
    <WideShell username={profile.username}>
      <PlayerDashboard
        player={profile}
        history={history}
        selfLink={
          isSelf ? (
            <Text
              as={NextLink}
              href="/account"
              data-testid="stats-self-link"
              fontSize="14px"
              color="rgba(250,235,215,0.8)"
              textDecoration="underline"
              _hover={{ opacity: 0.8 }}
            >
              This is you
            </Text>
          ) : null
        }
      />
    </WideShell>
  );
};
