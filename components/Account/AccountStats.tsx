/**
 * The "My record" block on /account (issue #574) — one `GET /me/stats`, laid
 * out as headline tiles, a form strip, and three small tables.
 *
 * Two rules shape the whole file:
 *
 * 1. **Every section hides itself.** The enriched halves of the payload
 *    (streaks, form, matchups, maps, splits) arrived after the first stats
 *    deploy, so a client newer than its API simply won't be sent them. A
 *    missing field is `null` in `AccountStats`, and a `null` section renders
 *    nothing at all — never a header over an empty table, never a crash.
 * 2. **Nothing here is a dashboard.** This is a hobby game's record shelf: warm
 *    parchment, the site's own type, numbers big enough to read at a glance and
 *    small enough not to preen. Zero games and a dead API land on the same one
 *    friendly sentence pointing at /pro.
 */
import { useState } from "react";
import { Box, Button, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";

import { mapLabel } from "@/lib/account/gameHistory";
import {
  AccountStats as AccountStatsData,
  botTierLabel,
  casualGamesNote,
  formatClock,
  hasPlayed,
  headlineRecord,
  headlineWinRate,
  isCasualBot,
  MIN_WIN_RATE_GAMES,
  monthLabel,
  orderedBotSplits,
  percentLabel,
  splitDraws,
  splitLosses,
  recordLabel,
  StatSplit,
  statHeroLabel,
  type FormResult,
} from "@/lib/account/stats";
import { AccountStatsView } from "@/lib/account/useAccountStats";

/** Rows a table shows before it folds the rest behind "show all". */
export const COLLAPSE_AFTER = 8;

const BORDER = "1px solid rgba(72, 40, 79, 0.15)";

// --- headline tiles ----------------------------------------------------------

const Tile = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) => (
  <Box
    data-testid="account-stat-tile"
    bg="rgba(72, 40, 79, 0.06)"
    borderRadius="0.6rem"
    px="0.75rem"
    py="0.6rem"
    minW={0}
  >
    <Text
      fontFamily="ArchivoNarrow"
      fontSize="0.7rem"
      letterSpacing="0.06em"
      textTransform="uppercase"
      opacity={0.65}
      whiteSpace="nowrap"
      overflow="hidden"
      textOverflow="ellipsis"
    >
      {label}
    </Text>
    <Text fontFamily="LeagueGothic" fontSize="1.9rem" lineHeight="1.1">
      {value}
    </Text>
    {sub ? (
      <Text fontSize="0.72rem" opacity={0.6} mt="-0.15rem">
        {sub}
      </Text>
    ) : null}
  </Box>
);

const Tiles = ({ stats }: { stats: AccountStatsData }) => {
  const clock = formatClock(stats.avgDurationSeconds);
  const since = monthLabel(stats.firstGameAt);
  const turns =
    stats.avgTurns !== null ? `${Math.round(stats.avgTurns)} turns avg` : null;
  // The guard is about the sample the percentage is drawn from, which is the
  // COUNTED games — not the games tile, which still counts everything played.
  const counted = headlineRecord(stats).games;

  return (
    <Box
      display="grid"
      gridTemplateColumns="repeat(auto-fit, minmax(7.5rem, 1fr))"
      gap="0.5rem"
      mb="0.9rem"
    >
      <Tile
        label="Games"
        value={String(stats.totalGames)}
        sub={stats.lastGameAt ? `last ${monthLabel(stats.lastGameAt)}` : null}
      />
      <Tile
        label="Win rate"
        value={headlineWinRate(stats)}
        sub={
          counted < MIN_WIN_RATE_GAMES
            ? `after ${MIN_WIN_RATE_GAMES} games`
            : null
        }
      />
      <Tile label="W–L–D" value={recordLabel(stats)} sub="win–loss–draw" />
      {stats.streaks ? (
        <Tile
          label="Win streak"
          value={String(stats.streaks.current)}
          sub={`best ${stats.streaks.best}`}
        />
      ) : null}
      {clock ? <Tile label="Game length" value={clock} sub={turns} /> : null}
      {since ? <Tile label="Playing since" value={since} /> : null}
    </Box>
  );
};

/**
 * The one line that explains a W–L–D smaller than the games tile beside it.
 * Absent — not zeroed — whenever there is nothing to explain, which includes
 * every API deployed before the per-tier split existed.
 */
const CasualNote = ({ stats }: { stats: AccountStatsData }) => {
  const note = casualGamesNote(stats);
  if (!note) return null;
  return (
    <Text
      data-testid="account-stat-casual-note"
      fontSize="0.72rem"
      opacity={0.6}
      mt="-0.6rem"
      mb="0.9rem"
    >
      {note}
    </Text>
  );
};

// --- recent form -------------------------------------------------------------

const FORM_STYLE: Record<FormResult, { bg: string; color: string }> = {
  W: { bg: "brand.positive", color: "#F3FAF5" },
  L: { bg: "brand.danger", color: "#2A0F0A" },
  D: { bg: "rgba(72, 40, 79, 0.35)", color: "brand.parchment" },
};

const FORM_WORD: Record<FormResult, string> = {
  W: "win",
  L: "loss",
  D: "draw",
};

/**
 * The last ten results, newest first. Colour carries the mood and the letter
 * carries the meaning, so it survives a colour-blind reader and a screen reader
 * both — the strip as a whole is one labelled group, not ten unlabelled dots.
 */
const RecentForm = ({ form }: { form: FormResult[] }) => (
  <Box mb="0.9rem">
    <Text
      fontFamily="ArchivoNarrow"
      fontSize="0.7rem"
      letterSpacing="0.06em"
      textTransform="uppercase"
      opacity={0.65}
      mb="0.3rem"
    >
      Recent form
    </Text>
    <Flex
      data-testid="account-stat-form"
      gap="0.28rem"
      aria-label={`Last ${form.length} games, newest first: ${form
        .map((result) => FORM_WORD[result])
        .join(", ")}`}
      flexWrap="wrap"
    >
      {form.map((result, index) => (
        <Flex
          // Position is the identity here: the same letter repeats, and the
          // strip is replaced wholesale rather than reordered.
          key={`${index}-${result}`}
          {...FORM_STYLE[result]}
          aria-hidden
          boxSize="1.35rem"
          borderRadius="0.3rem"
          align="center"
          justify="center"
          fontFamily="SpaceGrotesk"
          fontWeight={700}
          fontSize="0.7rem"
        >
          {result}
        </Flex>
      ))}
    </Flex>
  </Box>
);

// --- tables ------------------------------------------------------------------

export interface StatRow extends StatSplit {
  key: string;
  label: string;
}

const HeadCell = ({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) => (
  <Box
    as="th"
    scope="col"
    textAlign={numeric ? "right" : "left"}
    fontFamily="ArchivoNarrow"
    fontWeight={400}
    fontSize="0.7rem"
    letterSpacing="0.05em"
    textTransform="uppercase"
    opacity={0.6}
    py="0.3rem"
    px={numeric ? "0.5rem" : 0}
    whiteSpace="nowrap"
  >
    {children}
  </Box>
);

const Cell = ({
  children,
  numeric,
}: {
  children: React.ReactNode;
  numeric?: boolean;
}) => (
  <Box
    as="td"
    textAlign={numeric ? "right" : "left"}
    py="0.35rem"
    px={numeric ? "0.5rem" : 0}
    borderTop={BORDER}
    fontSize="0.85rem"
    whiteSpace="nowrap"
  >
    {children}
  </Box>
);

/**
 * A stat table: label, games, wins, win %. Long tables fold to
 * `COLLAPSE_AFTER` rows — a player with forty matchups wants the top of the
 * list on the page and the tail on request, not a scroll bar the length of the
 * account. The whole table lives in its own horizontally scrolling box so a
 * narrow phone scrolls the numbers, never the page.
 */
export const StatTable = ({
  heading,
  note,
  firstColumn,
  rows,
  testId,
  collapsible = true,
}: {
  heading: string;
  note?: string;
  firstColumn: string;
  rows: StatRow[];
  testId: string;
  collapsible?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const foldable = collapsible && rows.length > COLLAPSE_AFTER;
  const shown = foldable && !expanded ? rows.slice(0, COLLAPSE_AFTER) : rows;

  return (
    <Box mb="0.9rem">
      <Text
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="0.95rem"
        mb={note ? 0 : "0.2rem"}
      >
        {heading}
      </Text>
      {note ? (
        <Text fontSize="0.72rem" opacity={0.6} mb="0.2rem">
          {note}
        </Text>
      ) : null}

      <Box overflowX="auto" maxW="100%">
        <Box as="table" w="100%" style={{ borderCollapse: "collapse" }}>
          <Box as="thead">
            <Box as="tr">
              <HeadCell>{firstColumn}</HeadCell>
              <HeadCell numeric>Games</HeadCell>
              <HeadCell numeric>Wins</HeadCell>
              <HeadCell numeric>Win %</HeadCell>
            </Box>
          </Box>
          <Box as="tbody">
            {shown.map((row) => (
              <Box as="tr" key={row.key} data-testid={testId}>
                <Cell>{row.label}</Cell>
                <Cell numeric>{row.games}</Cell>
                <Cell numeric>{row.wins}</Cell>
                <Cell numeric>{percentLabel(row)}</Cell>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {foldable ? (
        <Button
          mt="0.4rem"
          size="xs"
          variant="link"
          color="brand.secondary"
          fontFamily="ArchivoNarrow"
          fontWeight={400}
          textDecoration="underline"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show fewer" : `Show all ${rows.length}`}
        </Button>
      ) : null}
    </Box>
  );
};

// --- splits ------------------------------------------------------------------

/**
 * Why the easy/medium rows carry no record (#592). Stated on the row itself
 * rather than in a footnote: the question it answers ("where did my fifty wins
 * go?") is asked while looking straight at that number.
 */
export const CASUAL_SPLIT_NOTE = "No XP · not counted in your record";

/** The same sentence on somebody else's profile, where it isn't your record. */
export const CASUAL_SPLIT_NOTE_PUBLIC = "No XP · not counted in the record";

/**
 * One "58% · 12 games" pair. Small enough to sit four to a row.
 *
 * A `casual` split is the demoted form: games played, and nothing that looks
 * like a record — no win rate, no W–L. Showing a percentage there would be the
 * whole problem in miniature, a number that reads as achievement next to a line
 * saying it counts for nothing.
 */
const Split = ({
  label,
  split,
  casual = false,
  casualNote = CASUAL_SPLIT_NOTE,
}: {
  label: string;
  split: StatSplit;
  casual?: boolean;
  casualNote?: string;
}) => (
  <Box
    data-testid="account-stat-split"
    data-casual={casual ? "true" : undefined}
    minW="7rem"
    opacity={casual ? 0.6 : 1}
  >
    <Text fontSize="0.78rem" opacity={0.7}>
      {label}
    </Text>
    {casual ? (
      <>
        <Text fontFamily="SpaceGrotesk" fontWeight={400} fontSize="0.9rem">
          {split.games} {split.games === 1 ? "game" : "games"}
        </Text>
        <Text fontSize="0.68rem" opacity={0.85} lineHeight="1.3">
          {casualNote}
        </Text>
      </>
    ) : (
      <>
        <Text fontFamily="SpaceGrotesk" fontWeight={700} fontSize="0.9rem">
          {percentLabel(split)}{" "}
          <Text as="span" fontWeight={400} opacity={0.65} fontSize="0.78rem">
            · {split.games} {split.games === 1 ? "game" : "games"}
          </Text>
        </Text>
        {/* The record behind the percentage. Losses are derived, so a row from
            an API without `draws` reads its undecided games as losses rather
            than as nothing at all. */}
        <Text fontSize="0.68rem" opacity={0.6} lineHeight="1.3">
          {split.wins}–{splitLosses(split)}–{splitDraws(split)} w–l–d
        </Text>
      </>
    )}
  </Box>
);

const SplitGroup = ({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) => (
  <Box flex="1" minW="12rem">
    <Text
      fontFamily="ArchivoNarrow"
      fontSize="0.7rem"
      letterSpacing="0.06em"
      textTransform="uppercase"
      opacity={0.65}
      mb="0.25rem"
    >
      {heading}
    </Text>
    <Flex gap="1rem" flexWrap="wrap">
      {children}
    </Flex>
  </Box>
);

const Splits = ({
  stats,
  owner,
}: {
  stats: AccountStatsData;
  owner: boolean;
}) => {
  const kind = stats.byOpponentKind;
  const seat = stats.firstPlayer;
  // The seat split only says something once both sides exist; telemetry sends
  // zeroed rows for a player who has only ever gone first.
  const seatPlayed = seat ? seat.first.games + seat.second.games > 0 : false;
  if (!kind && !seatPlayed) return null;

  return (
    <Flex gap="1.25rem" flexWrap="wrap" mb="0.9rem">
      {kind ? (
        <SplitGroup heading="Opposition">
          {kind.human && kind.human.games > 0 ? (
            <Split label="vs humans" split={kind.human} />
          ) : null}
          {orderedBotSplits(kind.bots).map((bot) => (
            <Split
              key={bot.difficulty}
              label={`vs ${botTierLabel(bot).toLowerCase()}`}
              split={bot}
              casual={isCasualBot(bot)}
              casualNote={owner ? CASUAL_SPLIT_NOTE : CASUAL_SPLIT_NOTE_PUBLIC}
            />
          ))}
        </SplitGroup>
      ) : null}
      {seat && seatPlayed ? (
        <SplitGroup heading="Seat">
          <Split label="going first" split={seat.first} />
          <Split label="going second" split={seat.second} />
        </SplitGroup>
      ) : null}
    </Flex>
  );
};

// --- the section -------------------------------------------------------------

const Quiet = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="0.88rem" opacity={0.75} py="0.6rem">
    {children}
  </Text>
);

/**
 * Zero games, a 503, and an API that never answered all land here. They are
 * genuinely the same thing from the player's seat — there is no record to show
 * — and only one of them is worth a sentence about what to do next.
 */
const NothingYet = ({ owner }: { owner: boolean }) => {
  // Somebody else's empty shelf is a fact, not an invitation: pointing a
  // visitor at /pro from another player's profile is a nudge aimed at the
  // wrong person.
  if (!owner) return <Quiet>No Pro games on record yet.</Quiet>;
  return (
    <Quiet>
      No Pro games on record yet.{" "}
      <Text
        as={NextLink}
        href="/pro"
        textDecoration="underline"
        fontWeight={600}
        _hover={{ opacity: 0.8 }}
      >
        Play a Pro game
      </Text>{" "}
      while signed in and your record shows up here.
    </Quiet>
  );
};

/**
 * `view` is passed in rather than fetched here (#577): the profile header's
 * level bar reads the same `GET /me/stats`, and one hook call on the page keeps
 * that a single request instead of two mounts racing for the same payload.
 */
export const AccountStatsSection = ({
  view,
  owner = true,
  name,
}: {
  view: AccountStatsView;
  /** False on a public profile: the same tables, copy in the third person. */
  owner?: boolean;
  /** Whose record this is. Only used when `owner` is false. */
  name?: string;
}) => {
  const { status, stats } = view;

  const heroRows: StatRow[] =
    stats?.byHero.map((row) => ({
      key: row.heroId ?? statHeroLabel(row),
      label: statHeroLabel(row),
      games: row.games,
      wins: row.wins,
    })) ?? [];

  const matchupRows: StatRow[] =
    stats?.byOpponentHero?.map((row) => ({
      key: row.heroId ?? statHeroLabel(row),
      label: statHeroLabel(row),
      games: row.games,
      wins: row.wins,
    })) ?? [];

  const mapRows: StatRow[] =
    stats?.byMap?.map((row) => ({
      key: row.map,
      label: mapLabel(row.map),
      games: row.games,
      wins: row.wins,
    })) ?? [];

  return (
    <Box
      as="section"
      aria-labelledby="account-stats-heading"
      bg="brand.parchment"
      borderRadius="0.75rem"
      p="1.1rem"
      boxShadow="0 2px 8px rgba(20, 8, 24, 0.25)"
      mb="1rem"
    >
      <Text
        id="account-stats-heading"
        as="h2"
        fontFamily="SpaceGrotesk"
        fontWeight={700}
        fontSize="1.15rem"
        mb="0.2rem"
      >
        {owner ? "My record" : "Record"}
      </Text>
      <Text fontSize="0.8rem" opacity={0.65} mb="0.7rem">
        Every finished Pro game {owner ? "you" : (name ?? "this player")} played
        while signed in.
      </Text>

      {status === "loading" ? (
        <Quiet>{owner ? "Counting your games…" : "Counting games…"}</Quiet>
      ) : null}

      {status === "unavailable" || (stats && !hasPlayed(stats)) ? (
        <NothingYet owner={owner} />
      ) : null}

      {status === "ready" && stats && hasPlayed(stats) ? (
        <>
          <Tiles stats={stats} />
          <CasualNote stats={stats} />
          {stats.recentForm && stats.recentForm.length > 0 ? (
            <RecentForm form={stats.recentForm} />
          ) : null}
          {heroRows.length > 0 ? (
            <StatTable
              heading={owner ? "My heroes" : "Heroes"}
              firstColumn="Hero"
              rows={heroRows}
              testId="account-stat-hero-row"
            />
          ) : null}
          {matchupRows.length > 0 ? (
            <StatTable
              heading="Matchups"
              note="Counted per opposing hero, so a team game shows up under each of them."
              firstColumn="Opponent"
              rows={matchupRows}
              testId="account-stat-matchup-row"
            />
          ) : null}
          <Splits stats={stats} owner={owner} />
          {mapRows.length > 0 ? (
            <StatTable
              heading="Boards"
              firstColumn="Board"
              rows={mapRows}
              testId="account-stat-map-row"
            />
          ) : null}
        </>
      ) : null}
    </Box>
  );
};
