/**
 * The parchment sections of the `/stats?u=` dashboard (issue #937,
 * Player.dc.html): Table time, Recent form, Roster, Match grid, Who they play,
 * Badge case and Games. Each takes the normalised player and renders NOTHING
 * when its data is absent (today's prod api sends none of the new fields), so
 * the page composes them without a single conditional of its own.
 *
 * Every rule that is more than a field read lives in lib/stats/playerDashboard.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button } from "@chakra-ui/react";
import NextLink from "next/link";
import { FaPlay } from "react-icons/fa";

import { AccountBadgeCase } from "@/components/Account/AccountBadges";
import {
  AccountGame,
  formatDuration,
  gameOutcome,
  GameOutcome,
  heroLabel,
  mapLabel,
  OUTCOME_LABEL,
  pilotLabel,
  relativeDate,
} from "@/lib/account/gameHistory";
import { localReplayHref, localReplayIdForGame } from "@/lib/account/replayLink";
import { casualGamesNote, winPercent } from "@/lib/account/stats";
import type { GameHistoryView } from "@/lib/account/useGameHistory";
import { listReplays, type ReplayIndexEntry } from "@/lib/pro/replayStore";
import { heroRank } from "@/lib/stats/heroRank";
import { playerMatchupLookup } from "@/lib/stats/matchGrid";
import {
  badgeChase,
  calendarFooter,
  calendarSummary,
  calendarWeeks,
  GAMES_INITIAL_SHOWN,
  generalistToGo,
  mainHero,
  matchGridAxes,
  nemesis,
  opponentBars,
  revealMoreGames,
  rosterEntries,
} from "@/lib/stats/playerDashboard";
import { heroDisplayName, ROSTER_SIZE } from "@/lib/stats/roster";
import type { StatsPlayer } from "@/lib/stats/types";

import { DashCard } from "./DashCard";
import { FormChips } from "./FormChips";
import { HeroRankLegend, HeroRankRing } from "./HeroRankRing";
import { HeroToken } from "./HeroToken";
import { MatchGrid } from "./MatchGrid";
import { ProgressBar } from "./ProgressBar";
import {
  BAND_INK,
  BAND_MUTED,
  captionStyle,
  GOLD,
  INK,
  INK_DEEP,
  INK_MUTED,
  INK_SOFT,
  KIND_COLOR,
  PARCHMENT,
  RULE,
  WASH,
} from "./tokens";

const Caption = ({ children, mt }: { children: React.ReactNode; mt?: string }) => (
  <Box {...captionStyle} color={INK_MUTED} mt={mt}>
    {children}
  </Box>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <Box fontSize="13px" lineHeight={1.5} color={INK_SOFT}>
    {children}
  </Box>
);

// --- Table time --------------------------------------------------------------

const CAL_CELL = "22px";
const LEGEND_STEPS = ["rgba(72,40,79,0.07)", "rgba(72,40,79,0.3)", "rgba(72,40,79,0.55)", "rgba(72,40,79,0.9)"];
const DAY_NAMES = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

export const TableTime = ({ player, now }: { player: StatsPlayer; now?: number }) => {
  const calendar = player.calendar;
  const weeks = useMemo(() => (calendar ? calendarWeeks(calendar, now) : []), [calendar, now]);
  const footer = calendar ? calendarFooter(calendarSummary(calendar)) : null;
  const scroller = useRef<HTMLDivElement>(null);
  // On a phone the grid pans inside its card; start on the recent end.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks.length]);
  if (!calendar) return null;

  return (
    <DashCard title="Table time" action={<Box fontSize="13px" color={INK_MUTED}>Games per day, last 26 weeks</Box>}>
      <Box ref={scroller} overflowX="auto" maxW="100%" pb="4px" data-testid="table-time">
        <Box display="flex" gap="8px" w="max-content">
          <Box
            display="flex"
            flexDirection="column"
            gap="4px"
            fontSize="11px"
            color={INK_MUTED}
            w="24px"
            aria-hidden
            position="sticky"
            left={0}
            zIndex={1}
            bg={PARCHMENT}
          >
            {DAY_NAMES.map((d, i) => (
              <Box key={i} h={CAL_CELL} display="flex" alignItems="center">
                {d}
              </Box>
            ))}
          </Box>
          <Box display="flex" gap="4px" role="grid" aria-label="Games per day, last 26 weeks">
            {weeks.map((days) => (
              <Box key={days[0].date} display="flex" flexDirection="column" gap="4px" role="row">
                {days.map((d) => (
                  <Box
                    key={d.date}
                    role="gridcell"
                    aria-label={d.tip || undefined}
                    title={d.tip || undefined}
                    data-games={d.future ? undefined : d.games}
                    w={CAL_CELL}
                    h={CAL_CELL}
                    borderRadius="4px"
                    bg={d.bg}
                  />
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Box display="flex" flexWrap="wrap" gap="8px 16px" justifyContent="space-between" alignItems="center">
        <Box fontSize="13px" color={INK_SOFT} data-testid="table-time-footer">
          {footer ?? "No games in the last 26 weeks."}
        </Box>
        <Box display="flex" gap="4px" alignItems="center" fontSize="12px" color={INK_MUTED} aria-hidden>
          <span>0</span>
          {LEGEND_STEPS.map((bg) => (
            <Box key={bg} as="span" w="14px" h="14px" borderRadius="3px" bg={bg} />
          ))}
          <span>10+</span>
        </Box>
      </Box>
    </DashCard>
  );
};

// --- Recent form -------------------------------------------------------------

const BigNumber = ({ value, label, faded }: { value: number; label: string; faded?: boolean }) => (
  <Box>
    <Box fontFamily="LeagueGothic" fontSize={{ base: "52px", md: "64px" }} lineHeight={1} color={faded ? "rgba(72,40,79,0.6)" : INK}>
      {value}
    </Box>
    <Box fontSize="13px" color={INK_SOFT}>
      {label}
    </Box>
  </Box>
);

export const RecentForm = ({ player }: { player: StatsPlayer }) => {
  const { recentForm, streaks } = player.stats;
  const note = casualGamesNote(player.stats);
  if (!recentForm && !streaks && !note) return null;
  return (
    <DashCard title="Recent form">
      {recentForm && recentForm.length > 0 ? (
        // Two rows of five: the card is narrower than ten 32px chips at 1280.
        <Box maxW="184px">
          <FormChips results={recentForm} size={32} />
        </Box>
      ) : recentForm ? (
        <Note>No finished games yet.</Note>
      ) : null}
      {streaks ? (
        <Box display="flex" gap="24px" mt="auto">
          <BigNumber value={streaks.current} label={streaks.current === 1 ? "win in a row" : "wins in a row"} />
          <BigNumber value={streaks.best} label="best streak" faded />
        </Box>
      ) : null}
      {note ? (
        <Box fontSize="13px" lineHeight={1.5} color={INK_SOFT} borderTop={RULE} pt="12px">
          {note}.
        </Box>
      ) : null}
    </DashCard>
  );
};

// --- Roster ------------------------------------------------------------------

const heroHref = (heroId: string) => `/heroes?h=${encodeURIComponent(heroId)}`;

const MainHeroCard = ({ player, crownWins }: { player: StatsPlayer; crownWins: number | null }) => {
  const main = mainHero(player.stats);
  if (!main) return null;
  const name = heroDisplayName(main.heroId, main.heroName);
  const rank = heroRank(main.games);
  const stat = (value: string, label: string) => (
    <Box>
      <Box fontFamily="LeagueGothic" fontSize="36px" lineHeight={1}>
        {value}
      </Box>
      <Box fontSize="12px" color={BAND_MUTED}>
        {label}
      </Box>
    </Box>
  );
  return (
    <Box
      as={NextLink}
      href={heroHref(main.heroId)}
      data-testid="main-hero"
      textDecoration="none"
      w={{ base: "100%", xl: "300px" }}
      flexShrink={0}
      boxSizing="border-box"
      borderRadius="12px"
      bg={INK_DEEP}
      color={BAND_INK}
      p="24px"
      display="flex"
      flexDirection="column"
      gap="12px"
      _hover={{ color: BAND_INK, boxShadow: "0 0 0 2px #E0A82E" }}
    >
      <Box {...captionStyle} letterSpacing="0.08em" color={GOLD}>
        Main hero
      </Box>
      <HeroToken heroId={main.heroId} heroName={main.heroName} size={120} ring={{ color: rank?.ring ?? GOLD, width: 4 }} decorative />
      <Box fontFamily="LeagueGothic" fontSize="52px" lineHeight={0.95}>
        {name}
      </Box>
      <Box display="flex" gap="20px" flexWrap="wrap">
        {stat(String(main.games), main.games === 1 ? "game" : "games")}
        {stat(main.winPercent === null ? "—" : `${main.winPercent}%`, "wins")}
        {rank ? stat(rank.name, "hero rank") : null}
      </Box>
      {crownWins !== null ? (
        <Box fontSize="13px" lineHeight={1.45} color="rgba(250,235,215,0.78)" mt="auto" data-testid="main-hero-crown">
          Holds the {name} crown with {crownWins} {crownWins === 1 ? "win" : "wins"}.
        </Box>
      ) : null}
    </Box>
  );
};

export const Roster = ({ player, crownWins }: { player: StatsPlayer; crownWins: number | null }) => {
  const { entries, played } = rosterEntries(player.stats);
  const toGo = generalistToGo(player.badges.badges, player.badgeProgress);
  return (
    <DashCard
      title="Roster"
      subtitle="Every Pro hero. Play one to light it up, keep playing to raise its rank."
      gap="24px"
      action={
        <Box display="flex" flexDirection="column" gap="6px" w={{ base: "100%", md: "300px" }}>
          <Box display="flex" justifyContent="space-between" gap="8px" fontSize="13px" fontWeight={700}>
            <span data-testid="roster-played">
              {played} of {ROSTER_SIZE} played
            </span>
            {toGo ? (
              <Box as="span" color={INK_MUTED} fontWeight={400} data-testid="roster-generalist">
                {toGo}
              </Box>
            ) : null}
          </Box>
          <ProgressBar value={played / ROSTER_SIZE} label={`${played} of ${ROSTER_SIZE} heroes played`} height={8} color={INK} />
        </Box>
      }
    >
      <Box display="flex" flexDirection={{ base: "column", xl: "row" }} gap="28px" alignItems="stretch">
        <MainHeroCard player={player} crownWins={crownWins} />
        <Box
          as="ul"
          listStyleType="none"
          m={0}
          p={0}
          flexGrow={1}
          display="grid"
          gridTemplateColumns={{ base: "repeat(3, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))", xl: "repeat(7, minmax(0, 1fr))" }}
          gap="16px 12px"
          data-testid="roster-grid"
        >
          {entries.map((hero) => (
            <Box as="li" key={hero.heroId} minW={0}>
              <Box
                as={NextLink}
                href={heroHref(hero.heroId)}
                display="block"
                textDecoration="none"
                borderRadius="8px"
                _hover={{ bg: WASH }}
                aria-label={hero.games > 0 ? `${hero.name}, ${hero.games} ${hero.games === 1 ? "game" : "games"}` : `${hero.name}, not played`}
              >
                <HeroRankRing heroId={hero.heroId} heroName={hero.name} games={hero.games} size={72} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      <Box borderTop={RULE} pt="16px">
        <HeroRankLegend />
      </Box>
    </DashCard>
  );
};

// --- Match grid --------------------------------------------------------------

export const PlayerMatchGrid = ({ player }: { player: StatsPlayer }) => {
  const cells = player.byHeroOpponentHero;
  const axes = useMemo(() => (cells ? matchGridAxes(cells) : null), [cells]);
  const lookup = useMemo(() => playerMatchupLookup(cells ?? []), [cells]);
  if (!cells || !axes) return null;
  const worst = nemesis(cells);
  return (
    <DashCard
      title="Match grid"
      subtitle="Heroes played down the side, heroes faced across the top. Win rate, with games underneath."
      gap="18px"
    >
      {axes.rows.length === 0 || axes.cols.length === 0 ? (
        <Note>No duels on record yet.</Note>
      ) : (
        <>
          <MatchGrid
            rows={axes.rows}
            cols={axes.cols}
            lookup={lookup}
            mode="winRate"
            variant="player"
            caption={`${player.username}'s heroes against the heroes faced, win rate`}
          />
          <Box display="flex" flexWrap="wrap" gap="8px 12px" alignItems="center" fontSize="12px" color={INK_SOFT}>
            <span>More losses</span>
            <Box
              w={{ base: "120px", md: "200px" }}
              h="10px"
              borderRadius="3px"
              bg="linear-gradient(90deg, rgba(255,99,71,0.75), rgba(72,40,79,0.08) 50%, rgba(47,158,104,0.75))"
            />
            <span>More wins</span>
            <Box as="span" ml={{ base: 0, md: "auto" }}>
              · means under 3 games
            </Box>
          </Box>
        </>
      )}
      {worst ? (
        <Box p="14px 16px" borderRadius="10px" bg={WASH} fontSize="14px" lineHeight={1.45} data-testid="nemesis">
          <Box as="span" fontWeight={700}>
            Nemesis: {worst.opponentName}.
          </Box>{" "}
          {worst.line}
        </Box>
      ) : null}
    </DashCard>
  );
};

// --- Who they play -----------------------------------------------------------

const SeatTile = ({ label, games, wins }: { label: string; games: number; wins: number }) => {
  const percent = winPercent({ games, wins });
  return (
    <Box p="14px" borderRadius="10px" bg={WASH}>
      <Box fontFamily="LeagueGothic" fontSize="40px" lineHeight={1}>
        {percent === null ? "—" : `${percent}%`}
      </Box>
      <Box fontSize="13px" color={INK_SOFT}>
        {label} · {games} {games === 1 ? "game" : "games"}
      </Box>
    </Box>
  );
};

export const WhoTheyPlay = ({ player }: { player: StatsPlayer }) => {
  const bars = opponentBars(player.stats);
  const seat = player.stats.firstPlayer;
  const seatPlayed = seat ? seat.first.games + seat.second.games > 0 : false;
  if (!bars && !seatPlayed) return null;
  return (
    <DashCard title="Who they play" gap="18px">
      {bars ? (
        <Box display="flex" flexDirection="column" gap="14px" data-testid="opponent-bars">
          {bars.map((bar) => (
            <Box key={bar.key} display="flex" flexDirection="column" gap="5px">
              <Box display="flex" justifyContent="space-between" gap="8px" fontSize="14px">
                <Box as="span" fontWeight={700}>
                  {bar.label}
                </Box>
                <Box as="span" color={INK_SOFT} textAlign="right">
                  {bar.games} {bar.games === 1 ? "game" : "games"} · {bar.detail}
                </Box>
              </Box>
              <ProgressBar value={bar.share} label={`${bar.label}: ${Math.round(bar.share * 100)}% of games`} height={10} color={KIND_COLOR[bar.kind]} />
            </Box>
          ))}
        </Box>
      ) : null}
      {seat && seatPlayed ? (
        <Box borderTop={bars ? RULE : undefined} pt={bars ? "16px" : 0} display="flex" flexDirection="column" gap="10px">
          <Caption>Seat</Caption>
          <Box display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="12px">
            <SeatTile label="going first" games={seat.first.games} wins={seat.first.wins} />
            <SeatTile label="going second" games={seat.second.games} wins={seat.second.wins} />
          </Box>
        </Box>
      ) : null}
    </DashCard>
  );
};

// --- Badge case --------------------------------------------------------------

const LockIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export const BadgeCase = ({ player }: { player: StatsPlayer }) => {
  const badges = player.badges.badges;
  if (badges.length === 0) return null;
  const unlocked = badges.filter((b) => b.unlocked);
  const chase = badgeChase(badges, player.badgeProgress);
  return (
    <DashCard
      title="Badge case"
      action={
        <Box fontSize="13px" color={INK_MUTED}>
          {unlocked.length} of {badges.length} unlocked
        </Box>
      }
    >
      {chase.length > 0 ? (
        <>
          <Caption>Within reach</Caption>
          {chase.map((b) => (
            <Box key={b.id} display="flex" gap="14px" alignItems="center" p="14px" borderRadius="10px" bg={WASH} data-testid="badge-chase">
              <Box w="48px" h="48px" borderRadius="50%" boxSizing="border-box" border="2px solid rgba(72,40,79,0.3)" flexShrink={0} display="flex" alignItems="center" justifyContent="center">
                <LockIcon />
              </Box>
              <Box flexGrow={1} display="flex" flexDirection="column" gap="5px" minW={0}>
                <Box display="flex" justifyContent="space-between" gap="8px" fontSize="14px">
                  <Box as="span" fontWeight={700}>
                    {b.name}
                  </Box>
                  <Box as="span" color={INK_SOFT} whiteSpace="nowrap">
                    {b.current} of {b.target}
                  </Box>
                </Box>
                <ProgressBar value={b.fraction} label={`${b.name}: ${b.current} of ${b.target}`} />
                <Box fontSize="12px" color={INK_SOFT}>
                  {b.blurb}
                </Box>
              </Box>
            </Box>
          ))}
        </>
      ) : null}
      {chase.length > 0 ? <Caption mt="4px">All badges</Caption> : null}
      {/* The same case /account draws (#948): every badge with its glyph and
          blurb, locked ones greyed with their progress, worn ones marked with
          their slot. Read-only here — wearing is /account's job. */}
      <AccountBadgeCase
        embedded
        readOnly
        name={player.username}
        // Five across at desktop like the old /stats case; the full-width card
        // would otherwise fit eight thin tiles.
        gridColumns={{ base: "repeat(auto-fill, minmax(7.5rem, 1fr))", lg: "repeat(5, minmax(0, 1fr))" }}
        state={{ status: "ready", badges, selected: player.badges.selected, busy: false, notice: null }}
      />
    </DashCard>
  );
};

// --- Games -------------------------------------------------------------------

const OUTCOME_CHIP: Record<GameOutcome, { bg: string; ink: string }> = {
  win: { bg: "#2F9E68", ink: "#12210F" },
  loss: { bg: "#FF6347", ink: "#2A0F0A" },
  draw: { bg: "#8D8794", ink: "#1E1022" },
};

/** "Human · Sherwood Forest · 12 turns · 15m 02s" */
const gameMeta = (game: AccountGame): string => {
  const pilots = game.opponents.map((o) => pilotLabel(o) ?? "Human");
  return [
    pilots.length ? Array.from(new Set(pilots)).join(", ") : null,
    mapLabel(game.map),
    game.turns !== null ? `${game.turns} turns` : null,
    formatDuration(game.durationSeconds),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
};

const PlayerGameRow = ({ game, replayId }: { game: AccountGame; replayId: string | null }) => {
  const outcome = gameOutcome(game);
  // Roster names over the payload's (telemetry sends e.g. "TRICERATOPS").
  const name = (seat: { heroId: string | null; heroName: string | null }) =>
    seat.heroId ? heroDisplayName(seat.heroId, seat.heroName) : heroLabel(seat);
  const opponents = game.opponents.length ? game.opponents.map(name).join(", ") : "an unknown opponent";
  return (
    <Box
      as="li"
      data-testid="player-game-row"
      display="flex"
      flexWrap={{ base: "wrap", md: "nowrap" }}
      gap="8px 14px"
      alignItems="center"
      minH="64px"
      py="8px"
      borderBottom={RULE}
    >
      <Box w="52px" flexShrink={0} textAlign="center" py="5px" borderRadius="6px" fontSize="12px" fontWeight={700} bg={OUTCOME_CHIP[outcome].bg} color={OUTCOME_CHIP[outcome].ink}>
        {OUTCOME_LABEL[outcome]}
      </Box>
      <Box flex="1 1 0" minW={{ base: "calc(100% - 66px)", md: 0 }} display="flex" flexDirection="column" gap="2px">
        <Box fontSize="15px" fontWeight={700}>
          {name(game.you)} vs {opponents}
        </Box>
        <Box fontSize="12px" color={INK_SOFT}>
          {gameMeta(game)}
        </Box>
      </Box>
      <Box display="flex" alignItems="center" gap="14px" ml={{ base: "66px", md: 0 }} flexShrink={0}>
        {replayId ? (
          <Button
            as={NextLink}
            href={localReplayHref(replayId)}
            h="44px"
            px="16px"
            borderRadius="22px"
            border="1px solid rgba(72,40,79,0.4)"
            bg="transparent"
            color={INK}
            fontWeight={700}
            fontSize="13px"
            leftIcon={<FaPlay size="0.6rem" />}
            _hover={{ bg: WASH }}
          >
            Replay
          </Button>
        ) : null}
        <Box minW="64px" textAlign={{ base: "left", md: "right" }} fontSize="12px" color={INK_SOFT} whiteSpace="nowrap">
          {relativeDate(game.endedAt)}
        </Box>
      </Box>
    </Box>
  );
};

export const PlayerGames = ({ history }: { history: GameHistoryView }) => {
  const { status, games, hasMore, loadingMore, loadMore } = history;
  // localStorage is client-only: rows get a Replay button once the index loads
  // (the same join AccountGames uses — only games THIS browser saved).
  const [replays, setReplays] = useState<ReplayIndexEntry[]>([]);
  useEffect(() => {
    if (status !== "ready" || games.length === 0) return;
    setReplays(listReplays());
  }, [status, games.length]);

  // Issue #944: show GAMES_INITIAL_SHOWN rows, then "Older games" reveals the
  // rest of the loaded page before it fetches another one.
  const [shown, setShown] = useState(GAMES_INITIAL_SHOWN);
  useEffect(() => {
    if (status === "loading") setShown(GAMES_INITIAL_SHOWN);
  }, [status]);
  const wasLoadingMore = useRef(false);
  useEffect(() => {
    if (wasLoadingMore.current && !loadingMore) {
      // A fetch just landed from an "Older games" click: reveal that whole
      // page too, rather than re-applying the 8-row cap to it.
      setShown((current) => revealMoreGames(current, games.length));
    }
    wasLoadingMore.current = loadingMore;
  }, [loadingMore, games.length]);

  const visibleGames = games.slice(0, shown);
  const showOlderGames = shown < games.length || hasMore;
  const onOlderGames = () => {
    if (shown < games.length) setShown(revealMoreGames(shown, games.length));
    else loadMore();
  };

  return (
    <DashCard title="Games" gap="8px">
      {status === "loading" ? <Note>Loading games…</Note> : null}
      {status === "unavailable" || status === "offline" ? (
        <Note>Game history is unavailable right now. Nothing is lost — check back later.</Note>
      ) : null}
      {status === "ready" && games.length === 0 ? <Note>No finished Pro games on record yet.</Note> : null}
      {visibleGames.length > 0 ? (
        <Box as="ul" listStyleType="none" m={0} p={0}>
          {visibleGames.map((game) => (
            <PlayerGameRow key={game.id} game={game} replayId={localReplayIdForGame(game, replays)} />
          ))}
        </Box>
      ) : null}
      {showOlderGames ? (
        <Button
          variant="link"
          alignSelf="flex-start"
          minH="44px"
          color={INK}
          fontWeight={700}
          fontSize="14px"
          textDecoration="underline"
          isLoading={loadingMore}
          loadingText="Loading…"
          onClick={onOlderGames}
        >
          Older games
        </Button>
      ) : null}
    </DashCard>
  );
};

