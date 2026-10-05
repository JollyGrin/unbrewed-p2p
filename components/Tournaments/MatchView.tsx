/**
 * `/tournaments?t=<slug>&m=<matchId>` — the match page (#1218, mockup v2 tab 6).
 *
 * Players, matchup, deadline, the games list and a state card for the six
 * states in lib/tournaments/matchPage. "I'm ready" / "Join now" get a ticket
 * from the api and go to `/pro/game` with it (lib/tournaments/usePlayMatch).
 * A Discord join link lands here, so a fresh ticket is minted on that tap.
 */
import { Box, Flex, Grid, Text } from "@chakra-ui/react";
import dynamic from "next/dynamic";
import NextLink from "next/link";
import { useState } from "react";

import { GOLD, INK, INK_DEEP, INK_MUTED, PARCHMENT, RULE, TRACK, WASH } from "@/components/Stats/tokens";
import { signInUrl, useAccount } from "@/lib/account/useAccount";
import { catalogEntry } from "@/lib/pro/mapCatalog";
import { getToken } from "@/lib/pro/recentRooms";
import { matchHref } from "@/lib/tournaments/bracket";
import { useMatchDetail, useNow, useTournament } from "@/lib/tournaments/hooks";
import { isOrganizerOf } from "@/lib/tournaments/organizer";
import {
  clock,
  dateTime,
  DEADLINE_PASSED_TEXT,
  deadlineOutcome,
  deadlineParts,
  deadlinePassedRule,
  deadlineReadyCheckText,
  gameLength,
  gameRows,
  heldRoom,
  lastSeen,
  MATCH_STATE_NAME,
  matchPageState,
  matchTitle,
  matchupLine,
  mySide,
  nextMatchTitle,
  playerName,
  readyCheckLine,
  score,
  seatClock,
  shortDate,
  windowSpent,
  type GameRow,
  type MatchPageState,
} from "@/lib/tournaments/matchPage";
import { tournamentPath } from "@/lib/tournaments/share";
import type { Entry, Game, MatchDetail, MatchPlayer, Tournament } from "@/lib/tournaments/types";
import { usePlayMatch, type PlayPhase } from "@/lib/tournaments/usePlayMatch";

import { Avatar } from "./Bracket";
import { MatchOrganizerPanel } from "./OrganizerTools";
import { Btn, Card, Chip, Notice, Page } from "./ui";

const MatchReplay = dynamic(() => import("./MatchReplay").then((m) => m.MatchReplay), { ssr: false });

const POS = "#2F9E68";
const POS_INK = "#22774E";
const DANGER = "#FF6347";
const DANGER_INK = "#B83A26";
const SURFACE = "#3A2140";
const BAND_MUTED = "rgba(250,235,215,0.7)";

const caption = {
  fontFamily: "ArchivoNarrow",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  fontSize: "11px",
  color: INK_MUTED,
};

/**
 * `/pro/game?room=` only when this browser holds a seat token for the room: the
 * game page resumes a tournament room with it (any tab's). Without one, a
 * `?room=` link would send a ticketless JOIN_ROOM (TICKET_REQUIRED), so the
 * player goes through the ready/ticket flow instead.
 */
export const seatHref = (roomId: string | null): string | null =>
  roomId && getToken(roomId) ? `/pro/game?room=${encodeURIComponent(roomId)}` : null;

// ---------------------------------------------------------------------------

export const MatchView = ({ slug, matchId }: { slug: string; matchId: string }) => {
  const { status, account } = useAccount();
  const [detail, reload] = useMatchDetail(slug, matchId);
  const [event, reloadEvent] = useTournament(slug);
  const now = useNow();
  const play = usePlayMatch(slug, matchId, reload);
  const myUserId = status === "signed-in" && account ? account.id : null;
  const crumbs = (here: string) => (
    <>
      <NextLink href="/tournaments">Tournaments</NextLink> / <NextLink href={tournamentPath(slug)}>
        {event.status === "ready" ? event.value.tournament.name : "Tournament"}
      </NextLink> / {here}
    </>
  );

  if (detail.status !== "ready")
    return (
      <Page title="Match" path={matchHref(slug, matchId)} eyebrow={crumbs("Match")} heading="Match">
        {detail.status === "loading" ? (
          <Text opacity={0.7}>Loading the match…</Text>
        ) : detail.status === "not_found" ? (
          <Notice title="Match not found">This match doesn&apos;t exist, or the tournament was removed.</Notice>
        ) : (
          <Notice title="Couldn't load the match">The tournaments server didn&apos;t answer. Try again in a moment.</Notice>
        )}
      </Page>
    );

  return (
    <MatchBody
      d={detail.value}
      t={event.status === "ready" ? event.value.tournament : null}
      myUserId={myUserId}
      signedOut={status === "guest"}
      now={now}
      phase={play.phase}
      onPlay={play.play}
      crumbs={crumbs}
      organizer={
        event.status === "ready" && isOrganizerOf(event.value.tournament, myUserId)
          ? {
              entries: event.value.entries,
              reload: () => {
                reload();
                reloadEvent();
              },
            }
          : undefined
      }
    />
  );
};

// ---------------------------------------------------------------------------

/** The page for one loaded match. Pure over its props — tests render it from fixtures. */
export const MatchBody = ({
  d,
  t,
  myUserId,
  signedOut,
  now,
  phase,
  onPlay,
  crumbs,
  organizer,
}: {
  d: MatchDetail;
  /** The full tournament (size, organizer, latest possible final), once loaded. */
  t: Tournament | null;
  myUserId: string | null;
  signedOut: boolean;
  now: number;
  phase: PlayPhase;
  onPlay: () => void;
  crumbs?: (here: string) => React.ReactNode;
  /** Only passed for the tournament's organizer (MatchView gates it): set matchup / override (#1219). */
  organizer?: { entries: Entry[]; reload: () => void };
}) => {
  const [watching, setWatching] = useState<Game | null>(null);
  const m = d.match;
  const state = matchPageState(d, myUserId, now);
  const side = mySide(d, myUserId);
  const size = t?.size ?? 2 ** Math.max(m.round, 1);
  const title = matchTitle(m.round, m.position, size, m.stage);
  const group = m.stage === "group";
  const roundRobin = group || m.stage === "final";
  const next = nextMatchTitle(d, size);
  const opp = side === "a" ? d.players.b : side === "b" ? d.players.a : null;
  const oppName = playerName(opp);
  const room = heldRoom(d, now);
  const winner = m.winner === m.slotA ? d.players.a : m.winner === m.slotB ? d.players.b : null;
  const mu = matchupLine(m.matchup);
  const myHero = side === "a" ? mu.heroA : side === "b" ? mu.heroB : null;
  const rows = gameRows(d);
  const liveGame = m.games.find((g) => g.startedAt && !g.finishedAt) ?? null;
  const replayGame = [...m.games].reverse().find((g) => g.replayAvailable) ?? null;
  const unverified = rows.some((r) => r.state === "unverified");

  return (
    <Page
      title={title}
      path={matchHref(d.tournament.slug, m.id)}
      eyebrow={crumbs?.(title)}
      heading={title}
      lede={
        <>
          One game decides it
          {m.opensAt ? ` · window opened ${dateTime(m.opensAt)}` : ""}
          {m.deadlineAt ? ` · closes ${dateTime(m.deadlineAt)}` : ""}
        </>
      }
    >
      <Grid
        templateColumns={{ base: "minmax(0,1fr)", lg: "minmax(0,1fr) 340px" }}
        gap={{ base: "16px", md: "24px" }}
        alignItems="start"
        data-testid="match-page"
        data-state={state}
      >
        <Card overflow="hidden" p={0}>
          <Banner state={state} d={d} title={title} next={next} group={group} oppName={oppName} side={side} now={now} unverified={unverified} winnerName={playerName(winner)} />
          <Versus d={d} state={state} side={side} now={now} />
          {side && (
            <PlayBox
              state={state}
              phase={phase}
              onPlay={onPlay}
              oppName={oppName}
              myHero={myHero}
              mapName={mu.map}
              heroesLocked={mu.heroesLocked}
              seatHeld={room ? seatClock(room.expiresAt, now) : null}
              roomId={room?.roomId ?? liveGame?.roomId ?? null}
              code={title}
            />
          )}
          {!side && signedOut && (state === "waiting" || state === "opponent_ready") && m.slotA && m.slotB && (
            <Flex mx={{ base: "12px", md: "32px" }} mb="8px" p="16px" borderRadius="12px" bg={WASH} gap="12px" align="center" justify="space-between" flexWrap="wrap">
              <Text fontSize="14px">Playing this match? Sign in to press Play.</Text>
              <Btn variant="discord" href={signInUrl(matchHref(d.tournament.slug, m.id))}>Sign in with Discord</Btn>
            </Flex>
          )}
          <MatchupPanel d={d} t={t} side={side} />
          <GamesList d={d} rows={rows} state={state} onReplay={setWatching} />
          {state === "in_play" && (
            <Text fontSize="12px" color={INK_MUTED} textAlign="center" px="16px" pb="24px">
              Watching live is coming later. The replay appears here when the game ends.
            </Text>
          )}
          {state === "decided" && replayGame && (
            <Flex justify="center" pb="28px">
              <Btn variant="ink" onClick={() => setWatching(replayGame)}>Watch the replay</Btn>
            </Flex>
          )}
        </Card>

        <Flex flexDir="column" gap="16px">
          {organizer && (
            <MatchOrganizerPanel slug={d.tournament.slug} match={m} entries={organizer.entries} reload={organizer.reload} />
          )}
          <DeadlineCard d={d} t={t} state={state} now={now} />
          {/* C5 (#1236): a match decided by a result has no deadline left to explain; a rule-decided one marks which rule applied. */}
          {state !== "decided" && <RulesCard d={d} state={state} group={group} />}
          <ReadyChecksCard d={d} myUserId={myUserId} />
          {next && (
            <Card p="18px">
              <Text fontWeight={700} fontSize="15px" mb="8px">Winner goes to</Text>
              <Flex gap="8px" align="center" fontSize="14px" flexWrap="wrap">
                <Chip tone="gold">{next}</Chip>
                {t?.latestPossibleFinal && <Text color={INK_MUTED}>Final latest {shortDate(t.latestPossibleFinal)}</Text>}
              </Flex>
            </Card>
          )}
        </Flex>
      </Grid>

      <StickyPlay
        state={state}
        side={side}
        phase={phase}
        onPlay={onPlay}
        seatHeld={room ? seatClock(room.expiresAt, now) : null}
        roomId={room?.roomId ?? liveGame?.roomId ?? null}
        bracketHref={tournamentPath(d.tournament.slug)}
        standings={roundRobin}
        onReplay={replayGame ? () => setWatching(replayGame) : null}
      />
      {watching && (
        <MatchReplay slug={d.tournament.slug} matchId={m.id} game={watching} onExit={() => setWatching(null)} />
      )}
    </Page>
  );
};

// ---------------------------------------------------------------------------

const BANNER_LOOK: Record<MatchPageState, { bg: string; color: string }> = {
  waiting: { bg: WASH, color: INK },
  opponent_ready: { bg: GOLD, color: INK_DEEP },
  you_ready: { bg: INK_DEEP, color: PARCHMENT },
  in_play: { bg: DANGER, color: "white" },
  deadline_passed: { bg: SURFACE, color: PARCHMENT },
  decided: { bg: POS, color: "white" },
  decided_by_rule: { bg: SURFACE, color: PARCHMENT },
};

const Banner = ({
  state,
  d,
  title,
  next,
  group,
  oppName,
  side,
  now,
  unverified,
  winnerName,
}: {
  /** Round-robin group match: nobody "advances", the winner takes the match. */
  group: boolean;
  state: MatchPageState;
  d: MatchDetail;
  title: string;
  next: string | null;
  oppName: string;
  side: "a" | "b" | null;
  now: number;
  unverified: boolean;
  winnerName: string;
}) => {
  const m = d.match;
  const room = heldRoom(d, now);
  const deadline = m.deadlineAt ? `${shortDate(m.deadlineAt).split(" ")[0]} ${clock(m.deadlineAt)}` : "the deadline";
  let text: string;
  let small: string;
  switch (state) {
    case "opponent_ready":
      text = `${oppName} is ready to play. Your seat is held.`;
      small = `Join within ${seatClock(room?.expiresAt ?? null, now)}`;
      break;
    case "you_ready":
      text = `You're ready. We let ${oppName} know.`;
      small = `Seat held ${seatClock(room?.expiresAt ?? null, now)}`;
      break;
    case "in_play": {
      const started = m.games.find((g) => g.startedAt && !g.finishedAt)?.startedAt ?? null;
      text = started ? `In play now. Started ${clock(started)}.` : "In play now.";
      small = "Live spectating isn't available yet";
      break;
    }
    case "deadline_passed": {
      const out = deadlineOutcome(d, now);
      if (out.kind === "ready_check") {
        const mine = side === "a" ? m.slotA : side === "b" ? m.slotB : null;
        text = deadlineReadyCheckText(d, out.winner, mine);
        small = "Rule 1 · unanswered ready-check";
      } else {
        text = DEADLINE_PASSED_TEXT;
        small = deadlinePassedRule(m.stage);
      }
      break;
    }
    case "decided":
      text = group
        ? `Decided. ${winnerName} wins the match.`
        : !next
        ? `Decided. ${winnerName} wins the tournament.`
        : `Decided. ${winnerName} advances to the ${next}.`;
      small =
        m.decidedBy === "organizer"
          ? "Decided by the organizer"
          : m.decidedBy === "bye"
            ? "Bye"
            : m.decidedBy === "unverified_confirmed"
              ? "Result confirmed"
              : `${title} · ${shortDate(m.games.at(-1)?.finishedAt ?? null)}`;
      break;
    case "decided_by_rule":
      text = group
        ? `Decided by the deadline rule. ${winnerName} takes the win.`
        : `Decided by the deadline rule. ${winnerName} advances.`;
      small =
        m.decidedBy === "deadline_ready_check"
          ? "Rule 1 · unanswered ready-check"
          : "Rule 2 · no result, higher seed";
      break;
    default:
      if (!m.slotA || !m.slotB) {
        text = "Waiting for both players.";
      } else if (unverified) {
        text = "A result is waiting for confirmation. It confirms itself 24h after it was found unless the organizer rejects it.";
      } else if (room) {
        const ready = room.readyEntryId === m.slotA ? d.players.a : d.players.b;
        text = `${playerName(ready)} is ready and waiting for an opponent.`;
      } else {
        text = side
          ? `Your ${title.toLowerCase()} is open. Play any time before ${deadline}.`
          : `${playerName(d.players.a)} and ${playerName(d.players.b)} haven't played yet.`;
      }
      small = `${title} · one game`;
  }
  const look = BANNER_LOOK[state];
  return (
    <Flex
      align="center"
      gap="14px"
      px={{ base: "14px", md: "22px" }}
      py={{ base: "12px", md: "14px" }}
      fontWeight={600}
      fontSize={{ base: "14px", md: "15px" }}
      flexWrap={{ base: "wrap", md: "nowrap" }}
      bg={look.bg}
      color={look.color}
      data-testid="match-banner"
      title={MATCH_STATE_NAME[state]}
    >
      <Text as="span">{text}</Text>
      <Text as="span" ml={{ base: 0, md: "auto" }} w={{ base: "100%", md: "auto" }} fontWeight={400} fontSize="13px" opacity={0.85} whiteSpace={{ md: "nowrap" }}>
        {small}
      </Text>
    </Flex>
  );
};

// ---------------------------------------------------------------------------

const Side = ({
  p,
  you,
  hero,
  line,
  online,
}: {
  p: MatchPlayer | null;
  you: boolean;
  hero: string | null;
  line: string | null;
  online: boolean;
}) => (
  <Flex flexDir="column" align="center" textAlign="center" gap="8px" minW={0}>
    <Box position="relative" borderRadius="50%" boxShadow={`0 0 0 4px ${PARCHMENT}, 0 0 0 6px rgba(72,40,79,0.15)`}>
      <Box display={{ base: "block", md: "none" }}><Avatar name={playerName(p)} url={p?.avatarUrl || undefined} size={58} tbd={!p} /></Box>
      <Box display={{ base: "none", md: "block" }}><Avatar name={playerName(p)} url={p?.avatarUrl || undefined} size={92} tbd={!p} /></Box>
      {online && (
        <Box position="absolute" bottom="4px" right="4px" w={{ base: "14px", md: "20px" }} h={{ base: "14px", md: "20px" }} borderRadius="50%" bg={POS} border={`4px solid ${PARCHMENT}`} />
      )}
    </Box>
    <Text as="h3" fontSize={{ base: "15px", md: "22px" }} fontWeight={700} mt="6px" overflowWrap="anywhere">
      {playerName(p)} {you && <Text as="span" color={INK_MUTED} fontWeight={400}>(you)</Text>}
    </Text>
    {hero && (
      <Text as="span" bg={INK} color={PARCHMENT} borderRadius="999px" px={{ base: "8px", md: "12px" }} py={{ base: "3px", md: "4px" }} fontSize={{ base: "11px", md: "13px" }} fontWeight={700}>
        {hero}
      </Text>
    )}
    {line && (
      <Text fontSize="12px" color={INK_MUTED} display="inline-flex" alignItems="center" gap="6px">
        <Box as="i" w="8px" h="8px" borderRadius="50%" bg={online ? POS : "rgba(72,40,79,0.55)"} />
        {line}
      </Text>
    )}
  </Flex>
);

const Versus = ({ d, state, side, now }: { d: MatchDetail; state: MatchPageState; side: "a" | "b" | null; now: number }) => {
  const m = d.match;
  const mu = matchupLine(m.matchup);
  const s = score(d);
  const decided = state === "decided" || state === "decided_by_rule";
  const room = heldRoom(d, now);
  const line = (p: MatchPlayer | null, entry: string | null, mine: boolean) => {
    if (!p) return { line: null, online: false };
    if (decided)
      return {
        line: m.winner && m.winner !== entry && !m.stage?.match(/^(group|final)$/) ? `Seed ${p.seed ?? "–"} · eliminated` : `Seed ${p.seed ?? "–"}`,
        online: false,
      };
    if (state === "in_play" || room?.readyEntryId === entry) return { line: "Online now", online: true };
    // Your own last sign-in is just "now": never show it to yourself.
    const seen = mine ? null : lastSeen(p.lastSeenAt, now);
    return { line: seen?.text ?? (p.seed ? `Seed ${p.seed}` : null), online: !!seen?.online };
  };
  const la = line(d.players.a, m.slotA, side === "a");
  const lb = line(d.players.b, m.slotB, side === "b");
  const played = s.a + s.b > 0;
  return (
    <Grid templateColumns="1fr auto 1fr" alignItems="center" gap={{ base: "6px", md: "20px" }} px={{ base: "12px", md: "32px" }} pt={{ base: "20px", md: "32px" }} pb={{ base: "16px", md: "28px" }}>
      <Side p={d.players.a} you={side === "a"} hero={mu.heroA} {...la} />
      <Box textAlign="center" data-testid="match-score">
        <Text fontFamily="LeagueGothic" fontSize={{ base: "64px", md: "120px" }} lineHeight="0.85" letterSpacing="0.04em">
          {decided ? (played ? `${s.a}–${s.b}` : "–") : <Text as="em" fontStyle="normal" color="rgba(72,40,79,0.55)">vs</Text>}
        </Text>
        <Text {...caption} fontSize="12px" letterSpacing="0.1em" mt="6px" color={state === "in_play" ? DANGER_INK : INK_MUTED}>
          {state === "in_play" ? "● Live" : decided ? (played ? "Final score" : "No game played") : "One game"}
        </Text>
      </Box>
      <Side p={d.players.b} you={side === "b"} hero={mu.heroB} {...lb} />
    </Grid>
  );
};

// ---------------------------------------------------------------------------

const PlayBox = ({
  state,
  phase,
  onPlay,
  oppName,
  myHero,
  mapName,
  heroesLocked,
  seatHeld,
  roomId,
  code,
}: {
  state: MatchPageState;
  phase: PlayPhase;
  onPlay: () => void;
  oppName: string;
  myHero: string | null;
  mapName: string | null;
  heroesLocked: boolean;
  seatHeld: string | null;
  roomId: string | null;
  code: string;
}) => {
  if (state === "decided" || state === "decided_by_rule" || state === "deadline_passed") return null;
  const busy = phase.kind === "busy" || phase.kind === "opening";
  const status =
    phase.kind === "opening" ? (
      <Text fontSize="13px" mt="8px" fontWeight={600} data-testid="play-opening">
        Opening {oppName}&apos;s room…
      </Text>
    ) : phase.kind === "error" ? (
      <Text fontSize="13px" mt="8px" color={DANGER_INK} fontWeight={600} role="alert" data-testid="play-error">
        {phase.message}
      </Text>
    ) : null;
  const backHref = seatHref(roomId);

  let look: Record<string, unknown> = { bg: WASH };
  let body: React.ReactNode;
  let action: React.ReactNode;
  switch (state) {
    case "opponent_ready":
      look = { bg: "rgba(224,168,46,0.18)", boxShadow: `inset 0 0 0 2px ${GOLD}` };
      body = (
        <>
          <Text as="h4" fontSize="17px" fontWeight={700} mb="4px">{oppName} is waiting in your room</Text>
          <Text fontSize="13px" color={INK_MUTED}>
            Only your account can take the other seat.{" "}
            {myHero ? `You'll load straight in as ${myHero}${mapName ? ` on ${mapName}` : ""}.` : "You'll pick your hero, then the game starts."}
          </Text>
        </>
      );
      action = <Btn variant="gold" minH="54px" fontSize="17px" px="26px" onClick={onPlay} disabled={busy} data-testid="play-button">Join now</Btn>;
      break;
    case "you_ready":
      look = { bg: INK_DEEP, color: PARCHMENT };
      body = (
        <>
          <Text fontFamily="LeagueGothic" fontSize="56px" lineHeight="0.85" color={GOLD} sx={{ fontVariantNumeric: "tabular-nums" }} data-testid="seat-clock">
            {seatHeld}
          </Text>
          <Text fontSize="13px" color={BAND_MUTED} mt="6px">
            Your seat is held. The game starts in your room as soon as {oppName} joins.
          </Text>
          <Flex gap="6px 18px" flexWrap="wrap" mt="10px" fontSize="12px">
            <Text>✓ Room reserved for {code}</Text>
            <Text>✓ {oppName} told</Text>
            <Text opacity={0.7}>○ Waiting for {oppName}</Text>
          </Flex>
        </>
      );
      action = backHref ? (
        <Btn variant="gold" href={backHref}>Back to your room</Btn>
      ) : (
        // Seat held from another tab or device: take it here via a fresh ticket.
        <Btn variant="gold" onClick={onPlay} disabled={busy} data-testid="play-button">Take your seat here</Btn>
      );
      break;
    case "in_play":
      look = { bg: "rgba(255,99,71,0.1)", boxShadow: "inset 0 0 0 1.5px rgba(255,99,71,0.5)" };
      body = (
        <>
          <Text as="h4" fontSize="17px" fontWeight={700} mb="4px">Your game is running</Text>
          <Text fontSize="13px" color={INK_MUTED}>
            {backHref
              ? "Lost the tab? Rejoin the same room. The result and replay land here when the game ends."
              : "It's open in the tab or device you started it on — carry on there. The result and replay land here when the game ends."}
          </Text>
        </>
      );
      action = backHref ? <Btn variant="gold" minH="54px" fontSize="17px" px="26px" href={backHref}>Back to game</Btn> : null;
      break;
    default:
      body = (
        <>
          <Text as="h4" fontSize="17px" fontWeight={700} mb="4px">Ready when you are</Text>
          <Text fontSize="13px" color={INK_MUTED}>
            We&apos;ll open a private room for this match, hold your seat for 15 minutes, and let {oppName} know.{" "}
            {heroesLocked ? "Heroes are set, so there's no hero picker." : "You'll pick your hero next."}
          </Text>
        </>
      );
      action = (
        <Btn variant="gold" minH="54px" fontSize="17px" px="26px" onClick={onPlay} disabled={busy} data-testid="play-button">
          I&apos;m ready to play
        </Btn>
      );
  }
  return (
    <Grid
      mx={{ base: "12px", md: "32px" }}
      mb="8px"
      p={{ base: "16px", md: "20px" }}
      borderRadius="12px"
      templateColumns={{ base: "1fr", md: "minmax(0,1fr) auto" }}
      gap="16px"
      alignItems="center"
      data-testid="play-box"
      {...look}
    >
      <Box>
        {body}
        {status}
      </Box>
      {action && <Box display={{ base: "none", md: "block" }}>{action}</Box>}
    </Grid>
  );
};

/** Phone: the state's one action, pinned to the bottom of the screen. */
const StickyPlay = ({
  state,
  side,
  phase,
  onPlay,
  seatHeld,
  roomId,
  bracketHref,
  standings = false,
  onReplay,
}: {
  standings?: boolean;
  state: MatchPageState;
  side: "a" | "b" | null;
  phase: PlayPhase;
  onPlay: () => void;
  seatHeld: string | null;
  roomId: string | null;
  bracketHref: string;
  onReplay: (() => void) | null;
}) => {
  const busy = phase.kind === "busy" || phase.kind === "opening";
  const back = seatHref(roomId);
  let btn: React.ReactNode = null;
  if (side && state === "waiting") btn = <Btn variant="gold" onClick={onPlay} disabled={busy}>I&apos;m ready to play</Btn>;
  else if (side && state === "opponent_ready") btn = <Btn variant="gold" onClick={onPlay} disabled={busy}>Join now{seatHeld ? ` · ${seatHeld}` : ""}</Btn>;
  else if (side && state === "you_ready" && back) btn = <Btn variant="ink" href={back}>Seat held {seatHeld} · Back to room</Btn>;
  else if (side && state === "you_ready") btn = <Btn variant="gold" onClick={onPlay} disabled={busy}>Take your seat here · {seatHeld}</Btn>;
  else if (side && state === "in_play" && back) btn = <Btn variant="gold" href={back}>Back to game</Btn>;
  else if (state === "decided" && onReplay) btn = <Btn variant="ink" onClick={onReplay}>Watch the replay</Btn>;
  else if (state === "decided" || state === "decided_by_rule" || state === "deadline_passed") btn = <Btn variant="ghost" href={bracketHref}>{standings ? "See the standings" : "See the bracket"}</Btn>;
  if (!btn) return null;
  return (
    <Flex
      display={{ base: "flex", md: "none" }}
      position="sticky"
      bottom={0}
      zIndex={5}
      mx="-16px"
      mt="16px"
      px="12px"
      pt="10px"
      pb="calc(10px + env(safe-area-inset-bottom))"
      bg={PARCHMENT}
      boxShadow="0 -6px 18px rgba(20,8,24,.18)"
      sx={{ "& > *": { flex: 1, minHeight: "50px" } }}
      data-testid="sticky-play"
    >
      {btn}
    </Flex>
  );
};

// ---------------------------------------------------------------------------

const MatchupPanel = ({ d, t, side }: { d: MatchDetail; t: Tournament | null; side: "a" | "b" | null }) => {
  const m = d.match;
  const mu = matchupLine(m.matchup);
  const thumb = m.matchup.map ? catalogEntry(m.matchup.map.id)?.thumbnailUrl : undefined;
  const isSet = !!(mu.map || mu.heroA || mu.heroB);
  const setBy =
    isSet && (m.matchupOverride || t?.settings?.matchupSetBy === "organizer")
      ? `Set by ${t?.organizer.username ?? "the organizer"}`
      : m.matchupRule.mode === "free" || !isSet
        ? "Players choose"
        : "Event rule";
  // Once a game is recorded, only heroes the api names are shown; never "Player's choice".
  const played = m.games.some((g) => g.finishedAt);
  const row = (seat: "A" | "B", p: MatchPlayer | null, hero: string | null, now: boolean) => (
    <Box as="tr" bg={now ? "rgba(224,168,46,0.12)" : undefined}>
      <Box as="td" fontFamily="LeagueGothic" fontSize="24px" color="rgba(72,40,79,0.55)" w={{ base: "40px", md: "56px" }} px={{ base: "10px", md: "16px" }} py="10px" borderTop={RULE}>
        {seat}
      </Box>
      <Box as="td" px={{ base: "10px", md: "16px" }} py="10px" borderTop={RULE}>
        <Flex align="center" gap="8px">
          <Avatar name={playerName(p)} url={p?.avatarUrl || undefined} size={22} tbd={!p} />
          <Text fontSize="14px" overflowWrap="anywhere">{playerName(p)}</Text>
        </Flex>
      </Box>
      <Box as="td" px={{ base: "10px", md: "16px" }} py="10px" borderTop={RULE} fontWeight={hero ? 700 : 400} color={hero ? INK : INK_MUTED} fontSize="14px">
        {hero ?? (played ? "" : "Player's choice")}
      </Box>
    </Box>
  );
  return (
    <Box mx={{ base: "12px", md: "32px" }} mt={{ base: "14px", md: "18px" }} borderRadius="12px" boxShadow="inset 0 0 0 1px rgba(72,40,79,0.15)" overflow="hidden" data-testid="matchup-panel">
      <Flex justify="space-between" align="center" gap="10px" px="16px" py="12px" bg={WASH} flexWrap="wrap">
        <Text fontWeight={700}>Matchup</Text>
        <Chip>{setBy}</Chip>
      </Flex>
      <Flex gap="14px" align="center" px="16px" py="14px" borderBottom={RULE}>
        <Box w="86px" h="56px" borderRadius="8px" flexShrink={0} bg={TRACK} bgImage={thumb ? `url(${thumb})` : undefined} bgSize="cover" bgPos="center" boxShadow="inset 0 0 0 1px rgba(72,40,79,0.15)" />
        <Box>
          <Text fontWeight={700}>{mu.map ?? "Random board"}</Text>
          <Text fontSize="13px" color={INK_MUTED}>{mu.map ? "Set by the organizer" : "Dealt at random when the room opens"}</Text>
        </Box>
      </Flex>
      <Box as="table" w="100%" sx={{ borderCollapse: "collapse" }}>
        <Box as="thead">
          <Box as="tr">
            {["Seat", "Player", "Hero"].map((h) => (
              <Box as="th" key={h} {...caption} textAlign="left" fontWeight={400} px={{ base: "10px", md: "16px" }} pt="10px" pb="6px">
                {h}
              </Box>
            ))}
          </Box>
        </Box>
        <Box as="tbody">
          {row("A", d.players.a, mu.heroA, side === "a")}
          {row("B", d.players.b, mu.heroB, side === "b")}
        </Box>
      </Box>
      {mu.heroesLocked && (
        <Text px="16px" py="10px" fontSize="12px" color={INK_MUTED} borderTop={RULE}>
          🔒 The room only accepts these heroes, so you skip the hero picker.
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------

const GamesList = ({
  d,
  rows,
  state,
  onReplay,
}: {
  d: MatchDetail;
  rows: GameRow[];
  state: MatchPageState;
  onReplay: (g: Game) => void;
}) => {
  const m = d.match;
  const empty =
    state === "decided_by_rule"
      ? `No game was played before ${dateTime(m.deadlineAt)}.`
      : state === "decided"
        ? "No game was played."
        : "Not played yet";
  return (
    <Box px={{ base: "12px", md: "32px" }} pt={{ base: "18px", md: "22px" }} pb={{ base: "22px", md: "30px" }} data-testid="games-list">
      <Flex justify="space-between" align="baseline" mb="6px">
        <Text as="h4" fontWeight={700}>Games</Text>
        <Text {...caption}>First to {m.firstTo}</Text>
      </Flex>
      {rows.length === 0 && (
        <GameLine gn="—" pending>
          {empty}
        </GameLine>
      )}
      {rows.map((r) => (
        <GameLine
          key={r.game.gameIndex}
          // "In play now" shows no game number (settled rule 8).
          gn={r.state === "in_play" ? "—" : r.state === "won" ? "✓" : r.state === "rejected" ? "✕" : String(r.n)}
          pending={r.state === "in_play"}
          meta={
            r.state === "in_play"
              ? `started ${clock(r.game.startedAt)}`
              : [shortDate(r.game.finishedAt), gameLength(r.game), r.game.gameId ? `#${r.game.gameId.slice(-6)}` : null].filter(Boolean).join(" · ")
          }
          trail={
            r.state !== "rejected" && r.game.replayAvailable ? (
              <Box
                as="button"
                type="button"
                onClick={() => onReplay(r.game)}
                bg={INK}
                color={PARCHMENT}
                borderRadius="999px"
                px="11px"
                py="4px"
                fontSize="12px"
                fontWeight={700}
                whiteSpace="nowrap"
                data-testid="replay-chip"
              >
                ▶ Replay
              </Box>
            ) : r.state === "unverified" ? (
              <Chip tone="soon">Awaiting confirmation</Chip>
            ) : null
          }
        >
          {r.state === "in_play" ? (
            <>
              <Text as="span" color={DANGER_INK} fontWeight={700}>● In play now</Text>
              {r.heroes ? ` · ${r.heroes}` : ""}
            </>
          ) : r.state === "rejected" ? (
            <>Result rejected by the organizer · not counted</>
          ) : (
            <>
              <Text as="span" fontWeight={700}>{r.winnerName ?? "Unknown"}</Text> won{r.heroes ? ` · ${r.heroes}` : ""}
              {r.game.source === "untagged" ? " · played outside the match room" : ""}
            </>
          )}
        </GameLine>
      ))}
    </Box>
  );
};

const GameLine = ({
  gn,
  pending,
  meta,
  trail,
  children,
}: {
  gn: string;
  pending?: boolean;
  meta?: string;
  trail?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Grid
    templateColumns={{ base: "36px minmax(0,1fr) auto", md: "60px minmax(0,1fr) auto auto" }}
    gap={{ base: "10px", md: "16px" }}
    alignItems="center"
    py="12px"
    borderTop={RULE}
    fontSize="14px"
    data-testid="game-row"
  >
    <Text fontFamily="LeagueGothic" fontSize="26px" color="rgba(72,40,79,0.55)" lineHeight="1">{gn}</Text>
    <Text color={pending ? INK_MUTED : INK} minW={0}>{children}</Text>
    <Text display={{ base: "none", md: "block" }} fontSize="12px" color={INK_MUTED} textAlign="right" whiteSpace="nowrap">{meta}</Text>
    <Box>{trail}</Box>
  </Grid>
);

// ---------------------------------------------------------------------------

const DeadlineCard = ({ d, t, state, now }: { d: MatchDetail; t: Tournament | null; state: MatchPageState; now: number }) => {
  const m = d.match;
  const parts = deadlineParts(m.deadlineAt, now);
  const decided = state === "decided" || state === "decided_by_rule";
  const finished = m.games.at(-1)?.finishedAt ?? null;
  const unit = (n: number, u: string) => (
    <>
      {n}
      <Text as="span" fontSize="24px" color={INK_MUTED} ml="2px" mr="6px">{u}</Text>
    </>
  );
  return (
    <Card p="22px" data-testid="deadline-card">
      <Text {...caption} mb="6px">Match deadline</Text>
      <Text fontFamily="LeagueGothic" fontSize={decided ? "44px" : "64px"} lineHeight="0.9" sx={{ fontVariantNumeric: "tabular-nums" }} color={state === "decided" ? POS_INK : INK}>
        {state === "decided" ? (m.decidedBy === "organizer" ? "Decided by the organizer" : "Done early") : decided || !parts ? "Closed" : <>{unit(parts.d, "d")}{unit(parts.h, "h")}{unit(parts.m, "m")}</>}
      </Text>
      <Flex h="8px" borderRadius="999px" bg={TRACK} overflow="hidden" mt="14px" mb="8px">
        <Box bg={state === "decided" ? POS : decided ? INK : GOLD} w={`${decided ? (state === "decided" ? windowSpent(m.opensAt, m.deadlineAt, Date.parse(finished ?? "") || now) : 100) : windowSpent(m.opensAt, m.deadlineAt, now)}%`} />
      </Flex>
      <Flex justify="space-between" fontSize="12px" color={INK_MUTED} gap="8px">
        <Text>{state === "decided" && finished ? `Decided ${dateTime(finished)}` : `Opened ${shortDate(m.opensAt)}`}</Text>
        <Text textAlign="right">{m.deadlineAt ? `${(decided && state !== "decided") || state === "deadline_passed" ? "Closed " : ""}${dateTime(m.deadlineAt)}` : ""}</Text>
      </Flex>
      {t?.latestPossibleFinal && (
        <Text fontSize="12px" color={INK_MUTED} mt="12px" pt="10px" borderTop={RULE} data-testid="latest-final">
          Latest possible final: <b>{dateTime(t.latestPossibleFinal)}</b>
        </Text>
      )}
    </Card>
  );
};

const RulesCard = ({ d, state, group = false }: { d: MatchDetail; state: MatchPageState; group?: boolean }) => {
  const hit = state === "decided_by_rule" ? d.match.decidedBy : null;
  const rrFinal = d.match.stage === "final";
  const higher = (() => {
    // A round-robin top-2 final goes to the better standings rank: slot A (#1).
    if (rrFinal) return d.players.a;
    const a = d.players.a;
    const b = d.players.b;
    if (!a?.seed || !b?.seed) return null;
    return a.seed < b.seed ? a : b;
  })();
  const li = (on: boolean, children: React.ReactNode) => (
    <Box as="li" p="10px 12px" borderRadius="8px" fontSize="13px" color={on ? INK : INK_MUTED} bg={on ? "rgba(72,40,79,0.1)" : undefined} boxShadow={on ? `inset 3px 0 0 ${INK}` : undefined} listStylePosition="inside">
      {children}
      {on && <Text as="em" ml="6px" fontWeight={700}>Applied</Text>}
    </Box>
  );
  return (
    <Card p="18px">
      <Text {...caption} mb="8px">If the deadline passes</Text>
      <Box as="ol" m={0} p={0} display="flex" flexDir="column" gap="4px">
        {li(hit === "deadline_ready_check", <><b>Unanswered ready-check.</b> If one player pressed Play and the other never joined, the player who was ready {group ? "wins the match" : "advances"}.</>)}
        {li(hit === "deadline_higher_seed", <><b>Otherwise the organizer decides</b> within 24h. If they don&apos;t, {rrFinal ? "the player ranked higher in the standings" : "the higher seed"}{higher ? <> (<b>{playerName(higher)}</b>)</> : ""} {group ? "wins the match" : rrFinal ? "wins" : "advances"}.</>)}
      </Box>
      <Text fontSize="12px" color={INK_MUTED} mt="8px">A game that started before the deadline finishes and counts.</Text>
    </Card>
  );
};

const ReadyChecksCard = ({ d, myUserId }: { d: MatchDetail; myUserId: string | null }) => (
  <Card p="18px" data-testid="ready-checks">
    <Text {...caption} mb="8px">Ready-checks</Text>
    {d.readyChecks.length === 0 ? (
      <Text fontSize="13px" color={INK_MUTED}>None yet</Text>
    ) : (
      <Flex as="ul" flexDir="column" gap="6px" listStyleType="none" m={0} p={0}>
        {d.readyChecks.map((rc) => {
          const l = readyCheckLine(d, rc, myUserId);
          return (
            <Flex as="li" key={rc.id} align="center" gap="8px" fontSize="13px">
              <Box w="8px" h="8px" borderRadius="50%" flexShrink={0} bg={l.missed ? DANGER : POS} />
              <Text flex="1">{l.text}</Text>
              <Text color={INK_MUTED} fontSize="12px" whiteSpace="nowrap">{l.at}</Text>
            </Flex>
          );
        })}
      </Flex>
    )}
  </Card>
);
