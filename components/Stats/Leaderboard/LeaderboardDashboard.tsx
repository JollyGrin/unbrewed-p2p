/**
 * /leaderboard — the community dashboard (issue #936, Main.dc.html; replaces
 * the #590 table).
 *
 * Two public reads, no cookie: `GET /leaderboard?limit=200&window=` (§2c) for
 * the people, `GET /community?window=` (§2a) for everything else. The window
 * — "This month" by default, "All time" — lives in the URL (`?window=all`,
 * shallow-routed) so a view is linkable.
 *
 * Built to degrade: today's prod api sends none of §2's new fields, ignores
 * `window` and 404s `/community`. Then the band keeps its title and toggle,
 * the podium and chase pack render from the all-time board (with a note that
 * monthly standings aren't out yet), and every community card renders
 * nothing — no empty headers.
 *
 * A signed-in viewer's own row is tagged YOU; the account probe is the navbar
 * chip's, already in flight on every page, so it costs this page nothing.
 */
import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Box, Heading } from "@chakra-ui/react";

import { StatsCaveat } from "@/components/Account/StatsCaveat";
import { PageSeo } from "@/components/Helmet/Head";
import { Navbar } from "@/components/Navbar";
import { relativeDate } from "@/lib/account/gameHistory";
import { useAccount } from "@/lib/account/useAccount";
import { useCommunity } from "@/lib/stats/hooks";
import {
  heroesInPlayCount,
  parseWindow,
  playersRankedValue,
  windowQuery,
} from "@/lib/stats/leaderboardDashboard";
import { ROSTER_SIZE } from "@/lib/stats/roster";
import type { StatsWindow } from "@/lib/stats/types";

import { DarkBand } from "../DarkBand";
import { StatTile } from "../StatTile";
import { GOLD, INK, INK_DEEP, PAGE_BG } from "../tokens";
import { GamesPlayedCard, HeroesInPlayCard, MatchGridCard, TableTalkCard } from "./Community";
import { ChasePack, Podium } from "./Players";
import { useDashboardBoard } from "./useDashboardBoard";

const CONTENT_W = "1184px";

const WindowToggle = ({ window, onChange }: { window: StatsWindow; onChange: (w: StatsWindow) => void }) => (
  <Box display="flex" gap="8px" mt="4px" role="group" aria-label="Time window">
    {(
      [
        ["month", "This month"],
        ["all", "All time"],
      ] as const
    ).map(([w, label]) => {
      const on = window === w;
      return (
        <Box
          as="button"
          type="button"
          key={w}
          onClick={() => onChange(w)}
          aria-pressed={on}
          h="44px"
          px="20px"
          borderRadius="22px"
          border={on ? 0 : "1px solid rgba(250,235,215,0.35)"}
          bg={on ? GOLD : "transparent"}
          color={on ? INK_DEEP : "#FAEBD7"}
          fontWeight={on ? 700 : 500}
          fontSize="14px"
          _hover={{ bg: on ? "#EDB83F" : "rgba(250,235,215,0.08)" }}
        >
          {label}
        </Box>
      );
    })}
  </Box>
);

const Quiet = ({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) => (
  <Box fontSize="15px" lineHeight={1.5} color={onDark ? "rgba(250,235,215,0.78)" : INK} data-testid="leaderboard-quiet">
    {children}
  </Box>
);

const Dashboard = ({ window, onWindow }: { window: StatsWindow; onWindow: (w: StatsWindow) => void }) => {
  const { status, board, shownWindow } = useDashboardBoard(window);
  const community = useCommunity(window).data;
  const { account } = useAccount();
  const me = account?.username.toLowerCase() ?? null;

  const players = board?.players ?? [];
  const ranked = playersRankedValue(community, board);
  const inPlay = heroesInPlayCount(community?.heroes ?? null);
  const fellBack = status === "ready" && shownWindow !== window;
  const updated = board?.generatedAt ? relativeDate(board.generatedAt) : "";

  const tiles: { label: string; value: ReactNode }[] = [];
  if (community?.totals) {
    tiles.push({
      label: window === "month" ? "Games this month" : "Games all time",
      value: community.totals.games.toLocaleString("en-US"),
    });
  }
  if (ranked !== null) tiles.push({ label: "Players ranked", value: ranked.toLocaleString("en-US") });
  if (inPlay !== null) {
    tiles.push({
      label: "Heroes in play",
      value: (
        <>
          {inPlay}
          <Box as="span" fontSize={{ base: "20px", md: "26px" }} color="rgba(250,235,215,0.6)">
            {" "}
            / {ROSTER_SIZE}
          </Box>
        </>
      ),
    });
  }

  const hasSideCards = !!community && (!!community.totals || (community.weekly?.length ?? 0) > 0);

  return (
    <>
      <DarkBand variant="hero">
        <Box
          w="100%"
          maxW={CONTENT_W}
          mx="auto"
          display="flex"
          flexDirection={{ base: "column", lg: "row" }}
          gap={{ base: "24px", lg: "48px" }}
          alignItems="stretch"
        >
          <Box w={{ base: "100%", lg: "440px" }} flexShrink={0} display="flex" flexDirection="column" gap={{ base: "14px", md: "20px" }}>
            <Box fontFamily="ArchivoNarrow" fontSize="14px" letterSpacing="0.12em" textTransform="uppercase" color={GOLD}>
              Unbrewed Pro
            </Box>
            <Heading
              as="h1"
              m={0}
              fontFamily="LeagueGothic"
              fontWeight={400}
              fontSize={{ base: "72px", md: "120px" }}
              lineHeight={0.9}
              letterSpacing="0.01em"
            >
              Leaderboard
            </Heading>
            <Box fontSize="16px" lineHeight={1.5} color="rgba(250,235,215,0.78)">
              Everyone who has finished a Pro game while signed in. Pick a hero, fill your roster, take a crown.
            </Box>
            <WindowToggle window={window} onChange={onWindow} />
            {tiles.length > 0 && (
              <Box
                display="grid"
                gridTemplateColumns="repeat(3, minmax(0, 1fr))"
                gap={{ base: "8px", md: "12px" }}
                mt={{ base: "4px", lg: "auto" }}
                data-testid="band-tiles"
                // The tiles are ~100–140px wide: let the caption wrap rather
                // than ellipsise "Games this month".
                sx={{ "& [data-testid=stat-tile] > div": { whiteSpace: "normal" } }}
              >
                {tiles.map((t) => (
                  <StatTile key={t.label} valueFirst valueSize={48} label={t.label} value={t.value} />
                ))}
              </Box>
            )}
          </Box>

          <Box flexGrow={1} minW={0} display="flex" flexDirection="column" justifyContent="flex-end" gap="12px">
            {fellBack && (
              <Quiet onDark>Monthly standings aren&apos;t available yet, so this is the all-time board.</Quiet>
            )}
            {status === "loading" && <Quiet onDark>Counting everyone up…</Quiet>}
            {status === "unavailable" && (
              <Quiet onDark>
                The leaderboard is unavailable right now. Everything else on Unbrewed works as usual — try again later.
              </Quiet>
            )}
            {status === "ready" && players.length === 0 && (
              <Quiet onDark>
                {shownWindow === "month"
                  ? "Nobody has finished a Pro game this month yet. Play one while signed in and you'll top the board."
                  : "Nobody is on the board yet. Play a Pro game while signed in and you'll be the first."}
              </Quiet>
            )}
            {players.length > 0 && <Podium players={players} window={shownWindow} me={me} />}
          </Box>
        </Box>
      </DarkBand>

      <Box
        w="100%"
        maxW={`calc(${CONTENT_W} + 96px)`}
        mx="auto"
        p={{ base: "24px 16px 40px", md: "40px 48px 56px" }}
        display="flex"
        flexDirection="column"
        gap={{ base: "20px", md: "32px" }}
        boxSizing="border-box"
      >
        <Box display="flex" flexDirection={{ base: "column", lg: "row" }} gap={{ base: "20px", md: "32px" }} alignItems={{ base: "stretch", lg: "flex-start" }}>
          {players.length > 3 && (
            <Box flex={{ base: "1 1 auto", lg: hasSideCards ? "0 1 724px" : "1 1 auto" }} minW={0}>
              <ChasePack players={players} window={shownWindow} me={me} updated={updated} />
            </Box>
          )}
          {community && hasSideCards && (
            <Box flex="1 1 0" minW={0} display="flex" flexDirection="column" gap={{ base: "20px", md: "32px" }}>
              <GamesPlayedCard community={community} />
              <TableTalkCard community={community} window={window} />
            </Box>
          )}
        </Box>
        {community && <HeroesInPlayCard community={community} window={window} />}
        {community && <MatchGridCard community={community} />}
        <StatsCaveat color={INK} fontSize="13px" />
      </Box>
    </>
  );
};

export const LeaderboardDashboard = () => {
  const router = useRouter();
  const window = parseWindow(router.query.window);
  // The server render (and the first client paint of the static export) has
  // no query yet; mount the dashboard only once both are settled, so the
  // markup hydrates cleanly and a `?window=all` link never fetches the month
  // board first.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const setWindow = (next: StatsWindow) => {
    if (next === window) return;
    void router.replace({ pathname: router.pathname, query: windowQuery(next) }, undefined, {
      shallow: true,
      scroll: false,
    });
  };

  return (
    <Box bg={PAGE_BG} color={INK} fontFamily="SpaceGrotesk" minH="100svh" overflowX="hidden">
      <PageSeo
        path="/leaderboard"
        title="Leaderboard | Unbrewed"
        description="The Unbrewed leaderboard: levels, XP and win counts from finished Pro games."
      />
      <Box bg="brand.highlight" color="brand.secondary">
        <Navbar />
      </Box>
      {mounted && router.isReady ? <Dashboard window={window} onWindow={setWindow} /> : null}
    </Box>
  );
};
