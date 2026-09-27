/**
 * DEV gallery for the stats dashboard kit (issue #935): every component in
 * components/Stats rendered against the fixtures in lib/stats/fixtures, once
 * at page width and once inside a 375px container, so the page tickets (and
 * the orchestrator) can eyeball them without a backend.
 *
 * The fixtures are read directly and run through the real normalisers, so the
 * gallery renders the same with or without NEXT_PUBLIC_STATS_FIXTURES; the
 * "Client" card at the top shows what the switch-aware hooks answer.
 */
import { ReactNode, useMemo, useState } from "react";
import Head from "next/head";
import { Box, Button, Heading } from "@chakra-ui/react";

import {
  DarkBand,
  DashCard,
  FormChips,
  HeroRankLegend,
  HeroRankRing,
  HeroToken,
  MatchGrid,
  MatchGridLegend,
  ProgressBar,
  SplitBar,
  StackedColumns,
  StatTile,
} from "@/components/Stats";
import { PAGE_BG } from "@/components/Stats/tokens";
import { statsFixturesEnabled } from "@/lib/stats/client";
import {
  FIXTURE_USERNAMES,
  fixtureCommunity,
  fixtureHero,
  fixturePlayer,
} from "@/lib/stats/fixtures";
import { useCommunity, useHeroStats, useStatsLeaderboard, useStatsPlayer } from "@/lib/stats/hooks";
import { heroRankProgress } from "@/lib/stats/heroRank";
import {
  matchupLookup,
  MatchGridMode,
  maxCellGames,
  playerMatchupLookup,
} from "@/lib/stats/matchGrid";
import { normalizeCommunity, normalizeHero, normalizeStatsPlayer } from "@/lib/stats/normalize";
import { PUBLIC_ROSTER, ROSTER_SIZE } from "@/lib/stats/roster";
import type { StatsPlayer } from "@/lib/stats/types";

const Toggle = ({ mode, onChange }: { mode: MatchGridMode; onChange: (m: MatchGridMode) => void }) => (
  <Box display="flex" gap="8px" flexWrap="wrap">
    {(["games", "winRate"] as const).map((m) => (
      <Button
        key={m}
        onClick={() => onChange(m)}
        aria-pressed={mode === m}
        h="44px"
        px="18px"
        borderRadius="22px"
        border="1px solid #48284F"
        bg={mode === m ? "#48284F" : "transparent"}
        color={mode === m ? "#FAEBD7" : "#48284F"}
        _hover={{ bg: mode === m ? "#2C1831" : "rgba(72,40,79,0.08)" }}
        fontSize="14px"
        fontWeight={700}
      >
        {m === "games" ? "Games played" : "Win rate"}
      </Button>
    ))}
  </Box>
);

/** Renders `children` twice: at page width and in a 375px phone frame. */
const Both = ({ title, children }: { title: string; children: () => ReactNode }) => (
  <Box as="section" display="flex" flexDirection="column" gap="12px">
    <Heading as="h2" fontSize="16px" fontFamily="ArchivoNarrow" letterSpacing="0.08em" textTransform="uppercase" color="#48284F">
      {title}
    </Heading>
    <Box display="flex" flexWrap="wrap" gap="24px" alignItems="flex-start">
      <Box flex="1 1 560px" minW={0} data-frame="wide">
        {children()}
      </Box>
      <Box w="375px" maxW="100%" minW={0} outline="1px dashed rgba(72,40,79,0.35)" data-frame="narrow" display={{ base: "none", lg: "block" }}>
        {children()}
      </Box>
    </Box>
  </Box>
);

const ClientStatus = () => {
  const community = useCommunity("month");
  const hero = useHeroStats("the-mandalorian", "month");
  const board = useStatsLeaderboard({ limit: 5, window: "month" });
  const player = useStatsPlayer("lanternjaw");
  const rows: [string, string][] = [
    ["useCommunity('month')", community.status],
    ["useHeroStats('the-mandalorian')", hero.status],
    ["useStatsLeaderboard({ window: 'month' })", board.status],
    ["useStatsPlayer('lanternjaw')", player.status],
  ];
  return (
    <DashCard
      title="Client"
      subtitle={`NEXT_PUBLIC_STATS_FIXTURES is ${statsFixturesEnabled() ? "on — hooks answer from fixtures" : "off — hooks hit the api (unavailable is the quiet 404 state)"}`}
    >
      <Box as="ul" listStyleType="none" fontSize="13px" display="grid" gap="4px">
        {rows.map(([k, v]) => (
          <li key={k}>
            <Box as="code">{k}</Box> → <b data-testid="client-status">{v}</b>
          </li>
        ))}
      </Box>
      <Box fontSize="13px">Fixture players: {FIXTURE_USERNAMES.join(", ")}</Box>
    </DashCard>
  );
};

const gamesOn = (player: StatsPlayer, heroId: string): number =>
  player.stats.byHero.find((h) => h.heroId === heroId)?.games ?? 0;

export default function StatsKitPage() {
  const [communityMode, setCommunityMode] = useState<MatchGridMode>("games");
  const data = useMemo(() => {
    const community = normalizeCommunity(fixtureCommunity("month"), "month");
    const hero = normalizeHero(fixtureHero("the-mandalorian", "month"), "the-mandalorian", "month");
    const player = normalizeStatsPlayer(fixturePlayer("lanternjaw")) as StatsPlayer;
    const rookie = normalizeStatsPlayer(fixturePlayer("newleaf")) as StatsPlayer;
    return { community, hero, player, rookie };
  }, []);
  const { community, hero, player, rookie } = data;

  const gridHeroes = (community.heroes ?? []).slice(0, 10).map((h) => ({ heroId: h.heroId, heroName: h.heroName }));
  const lookup = matchupLookup(community.matchups ?? []);
  const maxGames = maxCellGames(gridHeroes.map((h) => h.heroId), gridHeroes.map((h) => h.heroId), lookup);

  const pairs = player.byHeroOpponentHero ?? [];
  const playerLookup = playerMatchupLookup(pairs);
  const mine = [...new Set(pairs.map((p) => p.heroId).filter((h): h is string => !!h))].slice(0, 5);
  const theirs = [...new Set(pairs.map((p) => p.opponentHeroId).filter((h): h is string => !!h))].slice(0, 8);
  const rookiePairs = rookie.byHeroOpponentHero ?? [];

  const played = PUBLIC_ROSTER.filter((h) => gamesOn(player, h.heroId) > 0).length;
  const mando = heroRankProgress(gamesOn(player, "the-mandalorian"));

  return (
    <>
      <Head>
        <title>Stats kit (dev)</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Box bg={PAGE_BG} minH="100vh" color="#48284F" fontFamily="SpaceGrotesk" overflowX="hidden">
        <DarkBand variant="hero">
          <Box fontFamily="ArchivoNarrow" fontSize="14px" letterSpacing="0.12em" textTransform="uppercase" color="#E0A82E">
            Dev · stats kit
          </Box>
          <Heading as="h1" m={0} fontFamily="LeagueGothic" fontWeight={400} fontSize={{ base: "64px", md: "120px" }} lineHeight={0.9}>
            Stats kit
          </Heading>
          <Box display="grid" gridTemplateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" }} gap="12px" maxW="640px">
            <StatTile valueFirst valueSize={48} label="Games this month" value={(community.totals?.games ?? 0).toLocaleString("en-US")} />
            <StatTile valueFirst valueSize={48} label="Players ranked" value={community.playersRanked ?? "—"} />
            <StatTile
              valueFirst
              valueSize={48}
              label="Heroes in play"
              value={
                <>
                  {community.heroes?.length ?? 0}
                  <Box as="span" fontSize="26px" color="rgba(250,235,215,0.6)">
                    {" "}
                    / {ROSTER_SIZE}
                  </Box>
                </>
              }
            />
          </Box>
          <Box display="grid" gridTemplateColumns={{ base: "repeat(2, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" }} gap="12px">
            <StatTile label="Games" value={player.stats.totalGames} sub="last played today" />
            <StatTile label="Win rate" value="66%" sub={`${player.stats.wins} wins`} />
            <StatTile label="Record" value={`${player.stats.wins}–${player.stats.losses}`} sub="no draws" />
            <StatTile label="Win streak" value={player.stats.streaks?.current ?? 0} sub={`best ${player.stats.streaks?.best ?? 0}`} />
            <StatTile label="Game length" value="14:20" sub="11 turns on average" />
            <StatTile label="Playing since" value="Mar '26" sub="26 weeks at the table" />
          </Box>
          <Box maxW="520px" display="flex" flexDirection="column" gap="6px">
            <Box display="flex" justifyContent="space-between" fontFamily="ArchivoNarrow" fontSize="13px" letterSpacing="0.06em" textTransform="uppercase">
              <span>Level {player.stats.level}</span>
              <Box as="span" color="rgba(250,235,215,0.72)">520 XP to level 16</Box>
            </Box>
            <ProgressBar value={0.68} label="Progress to level 16" height={10} color="#E0A82E" onDark />
          </Box>
        </DarkBand>

        <Box p={{ base: "24px 16px 40px", md: "40px 48px 56px" }} display="flex" flexDirection="column" gap="40px">
          <ClientStatus />

          <Both title="HeroToken">
            {() => (
              <DashCard title="Hero tokens" subtitle="36 / 40 / 64 / 72 / 120 / 200, then the fallbacks">
                <Box display="flex" flexWrap="wrap" gap="12px" alignItems="flex-end">
                  {([36, 40, 64, 72, 120, 200] as const).map((s) => (
                    <HeroToken key={s} heroId="the-mandalorian" size={s} />
                  ))}
                </Box>
                <Box display="flex" flexWrap="wrap" gap="16px" alignItems="center" fontSize="12px">
                  <HeroToken heroId="nancy-drew" size={72} />
                  <span>Nancy Drew: no token</span>
                  <HeroToken heroId="specter-knight" size={72} />
                  <span>Specter Knight: stub token</span>
                  <HeroToken heroId="some-new-hero" heroName="Some New Hero" size={72} />
                  <span>unknown id</span>
                  <HeroToken heroId="boba-fett" size={64} ring={{ color: "#E0A82E", width: 3 }} shadow />
                  <span>ring + shadow</span>
                </Box>
              </DashCard>
            )}
          </Both>

          <Both title="MatchGrid · community">
            {() => (
              <DashCard
                title="Match grid"
                subtitle={
                  communityMode === "games"
                    ? "How often each pair of heroes has met. Darker squares are well-trodden, pale ones are waiting for you."
                    : "How the row hero fares against the column hero. Green favours the row, red the column."
                }
                action={<Toggle mode={communityMode} onChange={setCommunityMode} />}
              >
                <MatchGrid rows={gridHeroes} cols={gridHeroes} lookup={lookup} mode={communityMode} caption="Hero versus hero, this month" />
                <Box maxW="320px">
                  <MatchGridLegend
                    mode={communityMode}
                    maxGames={maxGames}
                    title={communityMode === "games" ? "Games between the pair" : "Row hero win rate"}
                  />
                </Box>
              </DashCard>
            )}
          </Both>

          <Both title="MatchGrid · player">
            {() => (
              <DashCard title="Your match grid" subtitle="Your heroes down the side, who you faced across the top. Win rate, with games underneath.">
                <MatchGrid
                  variant="player"
                  rows={mine.map((heroId) => ({ heroId }))}
                  cols={theirs.map((heroId) => ({ heroId }))}
                  lookup={playerLookup}
                  mode="winRate"
                  caption="lanternjaw's heroes versus opponents"
                />
                <Box display="flex" gap="12px" alignItems="center" fontSize="12px" color="rgba(72,40,79,0.78)" flexWrap="wrap">
                  <span>You lose</span>
                  <Box w="160px">
                    <MatchGridLegend mode="winRate" low="" high="" />
                  </Box>
                  <span>You win</span>
                  <span>· means not played yet, or fewer than 3 games</span>
                </Box>
                <MatchGrid
                  variant="player"
                  rows={rookiePairs.map((p) => ({ heroId: p.heroId ?? "" })).slice(0, 1)}
                  cols={rookiePairs.map((p) => ({ heroId: p.opponentHeroId ?? "" })).slice(0, 1)}
                  lookup={playerMatchupLookup(rookiePairs)}
                  mode="winRate"
                  caption="newleaf's single game"
                />
              </DashCard>
            )}
          </Both>

          <Both title="StackedColumns + SplitBar">
            {() => (
              <Box display="flex" flexDirection="column" gap="24px">
                <DashCard title="Games played" subtitle="Per week, last 12 weeks, by who was across the table">
                  <StackedColumns weeks={community.weekly ?? []} />
                </DashCard>
                <DashCard title="This month's table talk">
                  {community.totals && <SplitBar counts={community.totals} />}
                </DashCard>
                <DashCard title="Across the table" subtitle="Who The Mandalorian was played against this month.">
                  {hero.byOpponentKind && <SplitBar variant="legend" counts={hero.byOpponentKind} />}
                </DashCard>
              </Box>
            )}
          </Both>

          <Both title="FormChips · StatTile (light) · ProgressBar">
            {() => (
              <DashCard title="Recent form">
                <FormChips results={player.stats.recentForm ?? []} size={32} />
                <FormChips results={["W", "L", "D", "W", "W"]} size={20} />
                <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="12px">
                  <StatTile variant="light" valueFirst valueSize={40} label="going first" value="69%" sub="131 games" />
                  <StatTile variant="light" valueFirst valueSize={40} label="going second" value="64%" sub="128 games" />
                </Box>
                <ProgressBar value={0.8} label="Generalist progress" />
                <ProgressBar value={played / ROSTER_SIZE} label="Roster played" height={8} color="#48284F" />
                <ProgressBar value={mando.rank ? (gamesOn(player, "the-mandalorian") / 100) : 0} label="Hero rank track" height={12} />
              </DashCard>
            )}
          </Both>

          <Both title="HeroRankRing">
            {() => (
              <DashCard
                title="Roster"
                subtitle="Every Pro hero. Play one to light it up, keep playing to raise its rank."
                action={
                  <Box fontSize="13px" fontWeight={700}>
                    {played} of {ROSTER_SIZE} played
                  </Box>
                }
              >
                <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(78px, 1fr))" gap="16px 12px">
                  {[...PUBLIC_ROSTER]
                    .sort((a, b) => gamesOn(player, b.heroId) - gamesOn(player, a.heroId))
                    .map((h) => (
                      <HeroRankRing key={h.heroId} heroId={h.heroId} games={gamesOn(player, h.heroId)} />
                    ))}
                </Box>
                <HeroRankLegend />
              </DashCard>
            )}
          </Both>
        </Box>
      </Box>
    </>
  );
}
