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
import { useEffect, useState } from "react";

import { GOLD, INK, INK_DEEP, INK_MUTED, PARCHMENT, RULE, TRACK, WASH } from "@/components/Stats/tokens";
import { signInUrl, useAccount } from "@/lib/account/useAccount";
import { catalogEntry } from "@/lib/pro/mapCatalog";
import { getToken } from "@/lib/pro/recentRooms";
import { noticedReseatCooldown } from "@/lib/tournaments/api";
import { LATE_GAME_NOTE, hasLateGame, isCancelledMatch, scoredGame, matchHref } from "@/lib/tournaments/bracket";
import { useMatchDetail, useNow, useTournament } from "@/lib/tournaments/hooks";
import { isOrganizerOf } from "@/lib/tournaments/organizer";
import {
  activeReseatCooldown,
  clock,
  dateTime,
  DEADLINE_PASSED_ORGANIZER_TEXT,
  DEADLINE_PASSED_SPECTATOR_TEXT,
  DEADLINE_PASSED_TEXT,
  decidedByRuleLine,
  decisionLine,
  deadlineHolder,
  deadlineHoldUntil,
  deadlineOutcome,
  deadlineParts,
  deadlinePassed,
  deadlinePassedOrganizerRule,
  deadlinePassedRule,
  deadlineReadyCheckText,
  endReasonText,
  gameLength,
  gameLooksStalled,
  gameRows,
  currentChecks,
  heldRoom,
  lastSeen,
  matchPageState,
  matchTitle,
  matchupLine,
  mySide,
  nextMatchTitle,
  organizerCutoff,
  overriddenGame,
  playerName,
  readyCheckLine,
  reseatCooldownText,
  RULE_1_LINE,
  score,
  seatClock,
  seatLeft,
  seatLeftSpoken,
  shortDate,
  stalledGameText,
  windowSpent,
  type GameRow,
  type MatchPageState,
} from "@/lib/tournaments/matchPage";
import { tournamentPath } from "@/lib/tournaments/share";
import type { Entry, Game, MatchDetail, MatchPlayer, Tournament } from "@/lib/tournaments/types";
import { backTo, SeatHeldNote } from "./SeatHeldNote";
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

/** A press that failed on the network (not a timeout: that one may have gone through) and is old enough to drop once the api answers again. */
export const STALE_ERROR_MS = 5_000;
export const staleNetworkError = (p: Extract<PlayPhase, { kind: "error" }>, now: number): boolean =>
  p.reason === "unavailable" && p.code !== "timeout" && p.code !== "tournaments_disabled" && now - (p.at ?? 0) >= STALE_ERROR_MS;

// ---------------------------------------------------------------------------

export const MatchView = ({ slug, matchId }: { slug: string; matchId: string }) => {
  const { status, account } = useAccount();
  const [detail, reload] = useMatchDetail(slug, matchId);
  const [event, reloadEvent] = useTournament(slug);
  const now = useNow();
  const play = usePlayMatch(slug, matchId, reload);
  const myUserId = status === "signed-in" && account ? account.id : null;
  // "Couldn't reach the server" goes once the api answers a later poll (journeys S3). The poll
  // that a failed press triggers itself doesn't count: the message stays up for a few seconds.
  const loaded = detail.status === "ready" ? detail.value : null;
  const { phase: playPhase, dismiss } = play;
  useEffect(() => {
    if (loaded && playPhase.kind === "error" && staleNetworkError(playPhase, Date.now())) dismiss();
  }, [loaded, playPhase, dismiss]);
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
          <>
            <Notice title="Couldn't load the match">The tournaments server didn&apos;t answer. Retrying automatically…</Notice>
            <Flex mt="16px" gap="10px" flexWrap="wrap">
              <Btn variant="gold" onClick={reload} data-testid="match-retry">Try again</Btn>
              <Btn href={tournamentPath(slug)} variant="ghost">Back to the tournament</Btn>
            </Flex>
          </>
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
      onRetry={play.retry}
      onBack={play.backToRoom}
      noticedCooldown={noticedReseatCooldown(matchId)}
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
  onRetry,
  onBack,
  noticedCooldown = null,
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
  /** "Check again" on the seat-held card: re-read the match. */
  onRetry?: () => void;
  /** "Back to your room": go back with a fresh join ticket (p2p #1250). */
  onBack?: (roomId: string) => void;
  /** A `409 reseat_cooldown`'s end time this tab already met (api #126). */
  noticedCooldown?: string | null;
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
  const decisionText = decisionLine(d);
  const cancelled = state === "cancelled" || d.tournament.status === "cancelled" || !!m.cancelled;
  const lateNote = (state === "decided" || state === "decided_by_rule") && score(d).a + score(d).b === 0 && hasLateGame(m);
  const unverified = rows.some((r) => r.state === "unverified");
  // Play needs both seats filled: a pending match's "I'm ready" could only 409.
  const seated = !!(m.slotA && m.slotB);
  const playable = !!side && seated;
  const roomId = room?.roomId ?? liveGame?.roomId ?? null;
  // This browser holds a seat in the live room: offer the way back even when the
  // session expired and the page no longer knows which side we are (S5).
  const seatLink = state === "in_play" ? seatHref(roomId) : null;
  const cooldown = activeReseatCooldown(m, noticedCooldown, now);
  // Play stays open after the deadline until the organizer decides (UX B1);
  // only rule 1 about to apply leaves nothing to press.
  const lateOpen = state === "deadline_passed" && deadlineOutcome(d, now).kind === "organizer";
  // The other player of a pre-deadline hold that outlived the deadline: they can still join it.
  const holder = state === "deadline_hold" ? deadlineHolder(d, now) : null;
  const holderName = playerName(holder === m.slotA ? d.players.a : holder === m.slotB ? d.players.b : null);
  const holdUntil = state === "deadline_hold" ? clock(deadlineHoldUntil(d, holder, now)) : "";
  // Discord pings are promised only when the api says the bot is live (UX S4).
  const discord = (t?.notifications ?? d.tournament.notifications) === "discord";
  const past = deadlinePassed(m.deadlineAt, now);
  const href = matchHref(d.tournament.slug, m.id);

  return (
    <Page
      title={title}
      path={matchHref(d.tournament.slug, m.id)}
      eyebrow={crumbs?.(title)}
      heading={title}
      lede={
        <>
          One game decides it
          {m.opensAt ? ` · opened ${dateTime(m.opensAt)}` : ""}
          {cancelled ? " · Cancelled" : m.deadlineAt ? ` · ${past ? "closed" : "closes"} ${dateTime(m.deadlineAt)}` : ""}
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
          <Banner state={state} d={d} title={title} next={next} group={group} oppName={oppName} side={side} now={now} unverified={unverified} winnerName={playerName(winner)} isOrganizer={!!organizer} discord={discord} />
          {decisionText && (
            <Text px={{ base: "14px", md: "22px" }} py="10px" fontSize="14px" fontWeight={600} bg={WASH} data-testid="decision-note" overflowWrap="anywhere">
              {decisionText}
            </Text>
          )}
          <Versus d={d} state={state} side={side} now={now} />
          {side && (state === "decided" || state === "decided_by_rule") && m.winner && m.winner !== (side === "a" ? m.slotA : m.slotB) && (
            // The eliminated player's "what now?" (UX B5).
            <Flex mx={{ base: "12px", md: "32px" }} mb="8px" p="16px" borderRadius="12px" bg={WASH} gap="10px" align="center" flexWrap="wrap" data-testid="after-loss">
              <Btn variant="ghost" href={tournamentPath(d.tournament.slug)}>{roundRobin ? "See the standings" : "See the bracket"}</Btn>
              {/* A round-robin group loser is still in the event (#1279 review). */}
              {!group && <Btn variant="ghost" href="/tournaments">Find another tournament</Btn>}
            </Flex>
          )}
          {playable && (
            <PlayBox
              state={lateOpen ? "waiting" : state}
              late={lateOpen}
              holderName={holderName}
              holdUntil={holdUntil}
              discord={discord}
              signInHref={href}
              phase={phase}
              onPlay={onPlay}
              onRetry={onRetry}
              onBack={onBack}
              oppName={oppName}
              myHero={myHero}
              mapName={mu.map}
              heroesLocked={mu.heroesLocked}
              seatHeld={room ? { clock: seatClock(room.expiresAt, now), spoken: seatLeftSpoken(room.expiresAt, now) } : null}
              roomId={roomId}
              code={title}
              cooldown={cooldown}
            />
          )}
          {!side && seatLink && (
            <Flex mx={{ base: "12px", md: "32px" }} mb="8px" p="16px" borderRadius="12px" bg={WASH} gap="12px" align="center" justify="space-between" flexWrap="wrap" data-testid="seat-return">
              <Text fontSize="14px">This browser holds a seat in this match&apos;s game.</Text>
              <Btn variant="gold" href={seatLink}>Back to game</Btn>
            </Flex>
          )}
          {!side && signedOut && (state === "waiting" || state === "opponent_ready" || state === "in_play" || state === "deadline_hold" || lateOpen) && seated && (
            <Flex mx={{ base: "12px", md: "32px" }} mb="8px" p="16px" borderRadius="12px" bg={WASH} gap="12px" align="center" justify="space-between" flexWrap="wrap" data-testid="sign-in-prompt">
              <Text fontSize="14px">{state === "in_play" ? "Playing this match? Sign in to get back to your game." : "Playing this match? Sign in to press Play."}</Text>
              <Btn variant="discord" href={signInUrl(href)}>Sign in with Discord</Btn>
            </Flex>
          )}
          {/* Only when it may be true: a game running this long, or one the api marks stalled (F5). */}
          {state === "in_play" && (side || signedOut || seatLink) && gameLooksStalled(d, now) && (
            <Text mx={{ base: "12px", md: "32px" }} mb="8px" px="4px" fontSize="13px" color={INK_MUTED} overflowWrap="anywhere" data-testid="stalled-note">
              {stalledGameText(t?.organizer.username ?? null)}
            </Text>
          )}
          <MatchupPanel d={d} t={t} side={side} onReplay={replayGame ? () => setWatching(replayGame) : null} />
          {state !== "cancelled" && <GamesList d={d} rows={rows} state={state} onReplay={setWatching} />}
          {lateNote && (
            <Text px={{ base: "14px", md: "22px" }} pb="16px" fontSize="13px" color={INK_MUTED} overflowWrap="anywhere" data-testid="late-game-note">
              {LATE_GAME_NOTE}
            </Text>
          )}
          {state === "in_play" && (
            <Text fontSize="12px" color={INK_MUTED} textAlign="center" px="16px" pb="24px">
              Watching live is coming later. The replay appears here when the game ends.
            </Text>
          )}
        </Card>

        <Flex flexDir="column" gap="16px">
          {organizer && state !== "cancelled" && (
            <MatchOrganizerPanel slug={d.tournament.slug} match={m} entries={organizer.entries} reload={organizer.reload} deadlinePassed={state === "deadline_passed" || deadlinePassed(m.deadlineAt, now)} />
          )}
          <DeadlineCard d={d} t={t} state={state} now={now} />
          {/* D6: no deadline left to explain once decided. A rule-decided match keeps one line naming the rule. */}
          {state === "decided_by_rule" ? (
            <Text fontSize="13px" fontWeight={600} px="4px" data-testid="decided-by-rule">{decidedByRuleLine(d)}</Text>
          ) : (
            state !== "decided" && state !== "cancelled" && <RulesCard d={d} state={state} group={group} />
          )}
          <ReadyChecksCard d={d} myUserId={myUserId} hideReady={cancelled} now={now} />
          {next && state !== "cancelled" && (
            <Card p="18px">
              <Text fontWeight={700} fontSize="15px" mb="8px">Winner goes to</Text>
              <Flex gap="8px" align="center" fontSize="14px" flexWrap="wrap">
                <Chip tone="gold">{next}</Chip>
                {t?.latestPossibleFinal && !cancelled && <Text color={INK_MUTED}>Final latest {shortDate(t.latestPossibleFinal)}</Text>}
              </Flex>
            </Card>
          )}
        </Flex>
      </Grid>

      <StickyPlay
        state={lateOpen ? "waiting" : state}
        side={playable ? side : null}
        phase={phase}
        onPlay={onPlay}
        onRetry={onRetry}
        onBack={onBack}
        seatHeld={room ? seatClock(room.expiresAt, now) : null}
        roomId={roomId}
        cooldown={cooldown}
        bracketHref={tournamentPath(d.tournament.slug)}
        standings={roundRobin}
        onReplay={replayGame ? () => setWatching(replayGame) : null}
      />
      {watching && (
        <MatchReplay slug={d.tournament.slug} matchId={m.id} game={watching} detail={side ? undefined : d} onExit={() => setWatching(null)} />
      )}
    </Page>
  );
};

// ---------------------------------------------------------------------------

const BANNER_LOOK: Record<MatchPageState, { bg: string; color: string }> = {
  waiting: { bg: WASH, color: INK },
  opponent_ready: { bg: GOLD, color: INK_DEEP },
  you_ready: { bg: INK_DEEP, color: PARCHMENT },
  // White on tomato fails AA (UX S12): the darker danger ink passes (≈4.9:1).
  in_play: { bg: DANGER_INK, color: "white" },
  deadline_passed: { bg: SURFACE, color: PARCHMENT },
  deadline_hold: { bg: SURFACE, color: PARCHMENT },
  decided: { bg: POS, color: "white" },
  decided_by_rule: { bg: SURFACE, color: PARCHMENT },
  cancelled: { bg: SURFACE, color: PARCHMENT },
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
  isOrganizer,
  discord,
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
  /** The viewer is the tournament's organizer. */
  isOrganizer: boolean;
  /** The Discord bot pings this tournament's players (api A5 `notifications`). */
  discord: boolean;
}) => {
  const m = d.match;
  const room = heldRoom(d, now);
  const mine = side === "a" ? m.slotA : side === "b" ? m.slotB : null;
  const deadline = m.deadlineAt ? dateTime(m.deadlineAt) : "the deadline";
  const [youAdvance, advances] = group ? ["win the match", "wins the match"] : m.stage === "final" || !next ? ["win the tournament", "wins the tournament"] : ["advance", "advances"];
  let text: string;
  let small: string;
  switch (state) {
    case "opponent_ready":
      text = `${oppName} is ready to play. Your seat is held.`;
      small = `Join within ${seatLeft(room?.expiresAt ?? null, now)}`;
      break;
    case "you_ready": {
      // The holder of a pre-deadline hold that outlived the deadline (UX B1).
      const holdingPast = deadlineOutcome(d, now).kind === "hold" && deadlineHolder(d, now) === mine;
      text = holdingPast
        ? `You're waiting in your room until ${clock(room?.expiresAt ?? null)}. If nobody joins, you ${youAdvance}.`
        : discord
          ? `You're ready. We let ${oppName} know on Discord.`
          : `You're ready. ${oppName} can join from this page.`;
      small = `Seat held · ${seatLeft(room?.expiresAt ?? null, now)} left`;
      break;
    }
    case "in_play": {
      const started = m.games.find((g) => g.startedAt && !g.finishedAt)?.startedAt ?? null;
      text = started ? `In play now. Started ${clock(started)}.` : "In play now.";
      small = `${title} · one game`;
      break;
    }
    case "cancelled":
      text = "Cancelled. The organizer cancelled this tournament before this match was decided.";
      small = "No result · nothing more to play";
      break;
    case "deadline_hold": {
      const holder = deadlineHolder(d, now);
      const holderName = playerName(holder === m.slotA ? d.players.a : d.players.b);
      const otherName = playerName(holder === m.slotA ? d.players.b : d.players.a);
      const until = clock(deadlineHoldUntil(d, holder, now));
      text = mine
        ? `${holderName} is waiting in your room${until ? ` until ${until}` : ""}. If you don't join, ${holderName} ${advances}.`
        : `The deadline has passed. ${holderName} pressed Play and is waiting${until ? ` until ${until}` : ""}; if ${otherName} doesn't join, ${holderName} ${advances}.`;
      small = RULE_1_LINE;
      break;
    }
    case "deadline_passed": {
      const out = deadlineOutcome(d, now);
      if (out.kind === "ready_check") {
        text = deadlineReadyCheckText(d, out.winner, mine);
        small = RULE_1_LINE;
      } else {
        const cutoff = organizerCutoff(m.deadlineAt);
        text = isOrganizer ? DEADLINE_PASSED_ORGANIZER_TEXT : mine ? DEADLINE_PASSED_TEXT : DEADLINE_PASSED_SPECTATOR_TEXT;
        small = isOrganizer ? deadlinePassedOrganizerRule(m.stage, cutoff) : deadlinePassedRule(m.stage, cutoff);
      }
      break;
    }
    case "decided":
    case "decided_by_rule": {
      // Speak to the two players (UX B5); a spectator keeps the plain line.
      const lead = state === "decided_by_rule" ? "Decided by the deadline rule. " : "";
      const cancelledEvent = d.tournament.status === "cancelled";
      // No game was won under the deadline rule (#1279 review): never "X won this one".
      if (mine && m.winner && state === "decided_by_rule") {
        const iWon = m.winner === mine;
        text = group
          ? iWon
            ? `${lead}You take the win.`
            : `${lead}${winnerName} takes the win.`
          : m.stage === "final" || !next
            ? iWon
              ? `${lead}You win the tournament. Champion!`
              : `${lead}${winnerName} wins the tournament. You finish runner-up, thanks for playing.`
            : cancelledEvent
              ? iWon
                ? `${lead}You take the match.`
                : `${lead}${winnerName} takes the match.`
              : iWon
                ? `${lead}You advance to the ${next}.`
                : `${lead}${winnerName} advances. You're out of the bracket, thanks for playing.`;
      } else if (mine && m.winner === mine) {
        text = group
          ? `${lead}You won this match.`
          : m.stage === "final" || !next
            ? `${lead}You won the tournament. Champion!`
            : cancelledEvent
              ? `${lead}You won the match.`
              : `${lead}You won. You advance to the ${next}.`;
      } else if (mine && m.winner) {
        text = group
          ? `${lead}${winnerName} won this one.`
          : m.stage === "final" || !next
            ? `${lead}${winnerName} won the final. You finish runner-up, thanks for playing.`
            : cancelledEvent
              ? `${lead}${winnerName} won the match.`
              : `${lead}${winnerName} won this one. You're out of the bracket, thanks for playing.`;
      } else if (state === "decided_by_rule") {
        text = group
          ? `Decided by the deadline rule. ${winnerName} takes the win.`
          : !next || m.stage === "final"
            ? `Decided by the deadline rule. ${winnerName} wins the tournament.`
            : `Decided by the deadline rule. ${winnerName} advances.`;
      } else {
        text = group
          ? `Decided. ${winnerName} wins the match.`
          : !next
            ? `Decided. ${winnerName} wins the tournament.`
            : cancelledEvent
              ? `Decided. ${winnerName} won the match.`
              : `Decided. ${winnerName} advances to the ${next}.`;
      }
      small =
        state === "decided_by_rule"
          ? m.decidedBy === "deadline_ready_check"
            ? RULE_1_LINE
            : "Rule 2 · organizer did not decide in 24h"
          : m.decidedBy === "organizer"
            ? "Decided by the organizer"
            : m.decidedBy === "bye"
              ? "Bye"
              : m.decidedBy === "unverified_confirmed"
                ? "Result confirmed"
                : `${title} · ${shortDate(m.games.at(-1)?.finishedAt ?? null)}`;
      break;
    }
    default: {
      const last = m.games.at(-1);
      const noResult = !!last?.finishedAt && !last.winnerEntry && !last.rejectedAt && !last.recordedAfterDecision;
      if (!m.slotA || !m.slotB) {
        text = "Waiting for both players.";
      } else if (unverified) {
        // api #129: no auto-confirm any more. Only the organizer's confirm makes it count (interactions S1).
        text = "A result is waiting for the organizer. It only counts if they confirm it; until then the match stays open.";
      } else if (room) {
        const ready = room.readyEntryId === m.slotA ? d.players.a : d.players.b;
        text = `${playerName(ready)} is ready and waiting for an opponent.`;
      } else if (noResult) {
        text = side
          ? `Game ${last!.gameIndex + 1} ended with no result. Play again any time before ${deadline}.`
          : `Game ${last!.gameIndex + 1} ended with no result. The match is open again until ${deadline}.`;
      } else {
        text = side
          ? `Your ${title.toLowerCase()} is open. Play any time before ${deadline}.`
          : `${playerName(d.players.a)} and ${playerName(d.players.b)} haven't played yet.${m.deadlineAt ? ` The match closes ${deadline}.` : ""}`;
      }
      small = `${title} · one game`;
    }
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
    >
      {/* The state line is the page's H2 (UX S14) and is announced when it changes (S13); the countdown is not. */}
      <Text as="h2" fontSize="inherit" fontWeight="inherit" m={0} aria-live="polite" data-testid="match-banner-text">{text}</Text>
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
    <Text fontSize={{ base: "15px", md: "22px" }} fontWeight={700} mt="6px" overflowWrap="anywhere" data-testid="side-name">
      {playerName(p)} {you && <Text as="span" color={INK_MUTED} fontWeight={400}>(you)</Text>}
    </Text>
    {hero && (
      <Text as="span" bg={INK} color={PARCHMENT} borderRadius="999px" px={{ base: "8px", md: "12px" }} py={{ base: "3px", md: "4px" }} fontSize={{ base: "11px", md: "13px" }} fontWeight={700}>
        {hero}
      </Text>
    )}
    {line && (
      <Text fontSize="12px" color={INK_MUTED} display="inline-flex" alignItems="center" gap="6px" overflowWrap="anywhere" minW={0}>
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
  const decided = state === "decided" || state === "decided_by_rule" || state === "cancelled";
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
    <Grid templateColumns="minmax(0, 1fr) auto minmax(0, 1fr)" alignItems="center" gap={{ base: "6px", md: "20px" }} px={{ base: "12px", md: "32px" }} pt={{ base: "20px", md: "32px" }} pb={{ base: "16px", md: "28px" }}>
      <Side p={d.players.a} you={side === "a"} hero={mu.heroA} {...la} />
      <Box textAlign="center" data-testid="match-score">
        <Text fontFamily="LeagueGothic" fontSize={{ base: "64px", md: "120px" }} lineHeight="0.85" letterSpacing="0.04em">
          {decided ? (played ? `${s.a}–${s.b}` : "–") : <Text as="em" fontStyle="normal" color="rgba(72,40,79,0.55)">vs</Text>}
        </Text>
        <Text {...caption} fontSize="12px" letterSpacing="0.1em" mt="6px" color={state === "in_play" ? DANGER_INK : INK_MUTED}>
          {state === "in_play" ? "● Live" : decided ? (played ? (state === "cancelled" ? "Score when cancelled" : "Final score") : hasLateGame(m) || m.decidedBy === "organizer" ? "Decided by organizer" : "No game played") : "One game"}
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
  onRetry,
  onBack,
  oppName,
  myHero,
  mapName,
  heroesLocked,
  seatHeld,
  roomId,
  code,
  cooldown,
  late = false,
  holderName = "",
  holdUntil = "",
  discord = false,
  signInHref,
}: {
  state: MatchPageState;
  phase: PlayPhase;
  onPlay: () => void;
  onRetry?: () => void;
  onBack?: (roomId: string) => void;
  oppName: string;
  myHero: string | null;
  mapName: string | null;
  heroesLocked: boolean;
  /** The seat-hold countdown: `M:SS` for the big clock, and the same in words for a screen reader. */
  seatHeld: { clock: string; spoken: string } | null;
  roomId: string | null;
  code: string;
  /** A re-seat cooldown's end (api #126): Play stays disabled until then. */
  cooldown: string | null;
  /** Past the deadline, still playable until the organizer decides (UX B1). */
  late?: boolean;
  /** deadline_hold: who is waiting in the room, and until when. */
  holderName?: string;
  holdUntil?: string;
  /** The Discord bot is live for this tournament (UX S4). */
  discord?: boolean;
  /** Where "Sign in with Discord" returns to after a dead session (UX B3). */
  signInHref: string;
}) => {
  // Rule 1 about to apply (deadline_passed reaches here only then) and decided matches: nothing to press.
  if (state === "decided" || state === "decided_by_rule" || state === "deadline_passed" || state === "cancelled") return null;
  const busy = phase.kind === "busy" || phase.kind === "opening" || !!cooldown;
  const status =
    cooldown ? (
      // Also what a 409 reseat_cooldown becomes, whatever error copy the play hook gave it.
      <Text fontSize="13px" mt="8px" fontWeight={600} role="status" data-testid="reseat-cooldown">
        {reseatCooldownText(cooldown)}
      </Text>
    ) : phase.kind === "opening" ? (
      <Text fontSize="13px" mt="8px" fontWeight={600} data-testid="play-opening">
        Opening {oppName}&apos;s room…
      </Text>
    ) : phase.kind === "seat_held" ? (
      <SeatHeldNote roomId={phase.roomId} onRetry={onRetry} onBack={onBack} />
    ) : phase.kind === "error" ? (
      <>
        <Text fontSize="13px" mt="8px" color={DANGER_INK} fontWeight={600} role="alert" data-testid="play-error">
          {phase.message}
        </Text>
        {phase.reason === "unauthorized" && (
          // A dead session: the way back in, to this same match (UX B3).
          <Box mt="8px">
            <Btn variant="discord" href={signInUrl(signInHref)} data-testid="play-sign-in">Sign in with Discord</Btn>
          </Box>
        )}
      </>
    ) : null;
  const backHref = seatHref(roomId);

  let look: Record<string, unknown> = { bg: WASH };
  let body: React.ReactNode;
  let action: React.ReactNode;
  switch (state) {
    case "opponent_ready":
    case "deadline_hold":
      look = { bg: "rgba(224,168,46,0.18)", boxShadow: `inset 0 0 0 2px ${GOLD}` };
      body = (
        <>
          <Text as="h3" fontSize="17px" fontWeight={700} mb="4px">
            {state === "deadline_hold" ? `${holderName} is waiting in your room${holdUntil ? ` until ${holdUntil}` : ""}` : `${oppName} is waiting in your room`}
          </Text>
          <Text fontSize="13px" color={INK_MUTED}>
            {state === "deadline_hold" ? `The deadline has passed, but you can still join. If you don't, ${holderName} advances. ` : ""}
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
          {/* M:SS reads like a clock time: say "left", and say it in words to a screen reader (UX B2). */}
          <Text fontFamily="LeagueGothic" fontSize="56px" lineHeight="0.85" color={GOLD} sx={{ fontVariantNumeric: "tabular-nums" }} role="timer" aria-label={seatHeld?.spoken} data-testid="seat-clock">
            {seatHeld?.clock}
            <Text as="span" fontSize="24px" color={BAND_MUTED} ml="6px" aria-hidden>left</Text>
          </Text>
          <Text fontSize="13px" color={BAND_MUTED} mt="6px">
            Your seat is held. The game starts in your room as soon as {oppName} joins.
          </Text>
          <Flex gap="6px 18px" flexWrap="wrap" mt="10px" fontSize="12px">
            <Text>✓ Room reserved for {code}</Text>
            {discord && <Text>✓ {oppName} told on Discord</Text>}
            <Text opacity={0.7}>○ Waiting for {oppName}</Text>
          </Flex>
        </>
      );
      action = backHref ? (
        <Btn variant="gold" href={backHref} onClick={backTo(roomId, onBack)}>Back to your room</Btn>
      ) : (
        // Seat held from another tab or device: take it here via a fresh ticket.
        <Btn variant="gold" onClick={onPlay} disabled={busy} data-testid="play-button">Take your seat here</Btn>
      );
      break;
    case "in_play":
      look = { bg: "rgba(255,99,71,0.1)", boxShadow: "inset 0 0 0 1.5px rgba(255,99,71,0.5)" };
      body = (
        <>
          <Text as="h3" fontSize="17px" fontWeight={700} mb="4px">Your game is running</Text>
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
          <Text as="h3" fontSize="17px" fontWeight={700} mb="4px">Ready when you are</Text>
          <Text fontSize="13px" color={INK_MUTED}>
            {late ? "The deadline has passed, but you can still play until the organizer decides. " : ""}
            {discord
              ? `We'll open a private room for this match, hold your seat for 15 minutes, and let ${oppName} know on Discord.`
              : `We'll open a private room for this match and hold your seat for 15 minutes. ${oppName} sees you're ready on this page.`}{" "}
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
  onRetry,
  onBack,
  seatHeld,
  roomId,
  cooldown = null,
  bracketHref,
  standings = false,
  onReplay,
}: {
  standings?: boolean;
  state: MatchPageState;
  side: "a" | "b" | null;
  phase: PlayPhase;
  onPlay: () => void;
  onRetry?: () => void;
  onBack?: (roomId: string) => void;
  seatHeld: string | null;
  roomId: string | null;
  cooldown?: string | null;
  bracketHref: string;
  onReplay: (() => void) | null;
}) => {
  const busy = phase.kind === "busy" || phase.kind === "opening" || !!cooldown;
  const back = seatHref(roomId);
  let btn: React.ReactNode = null;
  if (side && phase.kind === "seat_held") btn = <SeatHeldNote roomId={phase.roomId} onRetry={onRetry} onBack={onBack} />;
  else if (side && state === "waiting") btn = <Btn variant="gold" onClick={onPlay} disabled={busy}>I&apos;m ready to play</Btn>;
  // "· 11:48 left": a countdown, never mistakable for a clock time (UX B2).
  else if (side && (state === "opponent_ready" || state === "deadline_hold")) btn = <Btn variant="gold" onClick={onPlay} disabled={busy}>Join now{seatHeld ? ` · ${seatHeld} left` : ""}</Btn>;
  else if (side && state === "you_ready" && back) btn = <Btn variant="ink" href={back} onClick={backTo(roomId, onBack)}>Back to room · {seatHeld} left</Btn>;
  else if (side && state === "you_ready") btn = <Btn variant="gold" onClick={onPlay} disabled={busy}>Take your seat here · {seatHeld} left</Btn>;
  // A seat token for the room is enough: a lapsed session still gets back in (S5).
  else if (state === "in_play" && back) btn = <Btn variant="gold" href={back}>Back to game</Btn>;
  else if (state === "decided" && onReplay) btn = <Btn variant="ink" onClick={onReplay}>Watch the replay</Btn>;
  else if (state === "decided" || state === "decided_by_rule" || state === "deadline_passed" || state === "deadline_hold" || state === "cancelled") btn = <Btn variant="ghost" href={bracketHref}>{standings ? "See the standings" : "See the bracket"}</Btn>;
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

const MatchupPanel = ({ d, t, side, onReplay }: { d: MatchDetail; t: Tournament | null; side: "a" | "b" | null; onReplay: (() => void) | null }) => {
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
  const played = m.games.some((g) => scoredGame(m, g));
  // D9: a decided match whose record names no heroes or board must not fall back to the "Random board" rule text.
  const decided = m.status === "decided" || !!m.winner;
  const cancelled = isCancelledMatch(m);
  const unrecorded = decided && !isSet;
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
        {hero ?? (unrecorded || cancelled ? "—" : played ? "" : "Player's choice")}
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
        {unrecorded ? (
          <Box data-testid="matchup-unrecorded">
            <Text fontWeight={700}>{played && onReplay ? "Heroes and board: see the replay" : hasLateGame(m) ? LATE_GAME_NOTE : m.games.some((g) => overriddenGame(m, g)) ? "Decided by the organizer (the game's result was overridden)" : "No game was played"}</Text>
            {played && onReplay && (
              <Box as="button" type="button" onClick={onReplay} fontSize="13px" fontWeight={700} textDecoration="underline" data-testid="matchup-replay-link">
                ▶ Watch the replay
              </Box>
            )}
          </Box>
        ) : (
          <Box>
            <Text fontWeight={700}>{mu.map ?? "Random board"}</Text>
            <Text fontSize="13px" color={INK_MUTED}>{cancelled ? "Cancelled" : mu.map ? "Set by the organizer" : "Dealt at random when the room opens"}</Text>
          </Box>
        )}
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
  const open = state !== "decided" && state !== "decided_by_rule" && state !== "cancelled";
  const empty =
    state === "decided_by_rule"
      ? `No game was played before ${dateTime(m.deadlineAt)}.`
      : state === "decided"
        ? "No game was played."
        : "Not played yet";
  return (
    <Box px={{ base: "12px", md: "32px" }} pt={{ base: "18px", md: "22px" }} pb={{ base: "22px", md: "30px" }} data-testid="games-list">
      <Flex justify="space-between" align="baseline" mb="6px">
        <Text as="h3" fontWeight={700}>Games</Text>
        <Text {...caption}>{m.firstTo === 1 ? "One game" : `First to ${m.firstTo}`}</Text>
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
          gn={r.state === "in_play" ? "—" : r.state === "won" ? "✓" : r.state === "rejected" || r.state === "after_decision" || r.state === "overridden" || r.state === "no_result" ? "✕" : String(r.n)}
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
                px="14px"
                minH="44px"
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
          ) : r.state === "after_decision" ? (
            <>{AFTER_DECISION_LABEL}</>
          ) : r.state === "rejected" ? (
            <>Result rejected by the organizer · not counted</>
          ) : r.state === "no_result" ? (
            // Both left, swept or stalled (interactions S1): nothing to confirm, the match plays again.
            <>
              Game {r.n} ended with no result{endReasonText(r.game) ? ` (${endReasonText(r.game)})` : ""}.
              {open ? " Play again." : ""}
            </>
          ) : (
            <>
              <Text as="span" fontWeight={700}>{r.winnerName ?? "Unknown"}</Text> won{endReasonText(r.game) ? ` (${endReasonText(r.game)})` : ""}{r.state === "overridden" ? " (not counted: overridden)" : ""}{r.heroes ? ` · ${r.heroes}` : ""}
              {r.game.source === "untagged" ? " · played outside the match room" : ""}
            </>
          )}
        </GameLine>
      ))}
    </Box>
  );
};

/** A game that finished after the organizer decided the match: shown, never counted. */
const AFTER_DECISION_LABEL = "Finished after the match was decided (not counted)";

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
    <Box minW={0}>
      <Text color={pending ? INK_MUTED : INK}>{children}</Text>
      {/* Phones get the date / length / id line too, under the result (journeys polish). */}
      {meta && <Text display={{ base: "block", md: "none" }} fontSize="12px" color={INK_MUTED} mt="2px" data-testid="game-meta-phone">{meta}</Text>}
    </Box>
    <Text display={{ base: "none", md: "block" }} fontSize="12px" color={INK_MUTED} textAlign="right" whiteSpace="nowrap">{meta}</Text>
    <Box>{trail}</Box>
  </Grid>
);

// ---------------------------------------------------------------------------

const DeadlineCard = ({ d, t, state, now }: { d: MatchDetail; t: Tournament | null; state: MatchPageState; now: number }) => {
  const m = d.match;
  const parts = deadlineParts(m.deadlineAt, now);
  const decided = state === "decided" || state === "decided_by_rule" || state === "cancelled";
  // An organizer decision is dated by the decision itself, not by the last game (L2-3).
  const finished = (m.decidedBy === "organizer" ? d.decision?.at : null) ?? m.games.at(-1)?.finishedAt ?? null;
  const unit = (n: number, u: string) => (
    <>
      {n}
      <Text as="span" fontSize="24px" color={INK_MUTED} ml="2px" mr="6px">{u}</Text>
    </>
  );
  // Zero units dropped, so the last hour reads "12 m", not "0 d 0 h 12 m" (UX P1).
  const countdown = parts
    ? ([[parts.d, "d"], [parts.h, "h"], [parts.m, "m"]] as const).filter(([n], i, all) => n > 0 || (i === 2 && all.every(([x]) => x === 0)))
    : [];
  return (
    <Card p="22px" data-testid="deadline-card">
      <Text {...caption} mb="6px">Match deadline</Text>
      <Text fontFamily="LeagueGothic" fontSize={decided ? "44px" : "64px"} lineHeight="0.9" sx={{ fontVariantNumeric: "tabular-nums" }} color={state === "decided" ? POS_INK : INK}>
        {state === "cancelled" ? "Cancelled" : state === "decided" ? (m.decidedBy === "organizer" ? "Decided by the organizer" : "Done early") : decided || !parts ? "Closed" : <>{countdown.map(([n, u]) => <span key={u}>{unit(n, u)}</span>)}</>}
      </Text>
      <Flex h="8px" borderRadius="999px" bg={TRACK} overflow="hidden" mt="14px" mb="8px">
        <Box bg={state === "decided" ? POS : decided ? INK : GOLD} w={`${decided ? (state === "decided" ? windowSpent(m.opensAt, m.deadlineAt, Date.parse(finished ?? "") || now) : 100) : windowSpent(m.opensAt, m.deadlineAt, now)}%`} />
      </Flex>
      <Flex justify="space-between" fontSize="12px" color={INK_MUTED} gap="8px">
        <Text>{state === "decided" && finished ? `Decided ${dateTime(finished)}` : `Opened ${shortDate(m.opensAt)}`}</Text>
        <Text textAlign="right">
          {m.deadlineAt
            ? state === "cancelled"
              ? "Cancelled"
              : `${state === "decided" ? "was due " : decided || deadlinePassed(m.deadlineAt, now) ? "Closed " : "Closes "}${dateTime(m.deadlineAt)}`
            : ""}
        </Text>
      </Flex>
      {m.deadlineAt && !decided && (
        <Text fontSize="11px" color={INK_MUTED} textAlign="right" data-testid="local-time-hint">(your local time)</Text>
      )}
      {t?.latestPossibleFinal && t.status !== "cancelled" && (
        <Text fontSize="12px" color={INK_MUTED} mt="12px" pt="10px" borderTop={RULE} data-testid="latest-final">
          Latest possible final: <b>{dateTime(t.latestPossibleFinal)}</b>
        </Text>
      )}
    </Card>
  );
};

const RulesCard = ({ d, state, group = false }: { d: MatchDetail; state: MatchPageState; group?: boolean }) => {
  const hit = state === "decided_by_rule" ? d.match.decidedBy : null;
  const cutoff = organizerCutoff(d.match.deadlineAt);
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
        {li(hit === "deadline_ready_check", <><b>{RULE_1_LINE}.</b> If one player pressed Play before the deadline and the other never joined, the player who was ready {group ? "wins the match" : "advances"}.</>)}
        {li(hit === "deadline_higher_seed", <><b>Rule 2 · otherwise the organizer decides</b> {cutoff ? `by ${dateTime(cutoff)}` : "within 24 hours"}. If they don&apos;t, {rrFinal ? "the player ranked higher in the standings" : "the higher seed"}{higher ? <> (<b>{playerName(higher)}</b>)</> : ""} {group ? "wins the match" : rrFinal ? "wins the tournament" : "advances"}.</>)}
      </Box>
      {/* The decided product rule (UX B1): play stays open after the deadline until the organizer decides. */}
      <Text fontSize="12px" color={INK_MUTED} mt="8px">You can still play after the deadline until the organizer decides. A game that starts before then finishes and counts.</Text>
    </Card>
  );
};

const ReadyChecksCard = ({ d, myUserId, hideReady = false, now }: { d: MatchDetail; myUserId: string | null; hideReady?: boolean; now: number }) => {
  // A cancelled match has nobody "ready now": drop the pending lines (#1248).
  const checks = hideReady ? currentChecks(d).filter((rc) => rc.outcome !== "pending") : currentChecks(d);
  return (
  <Card p="18px" data-testid="ready-checks">
    <Text {...caption} mb="8px">Who pressed Play</Text>
    {checks.length === 0 ? (
      <Text fontSize="13px" color={INK_MUTED}>None yet</Text>
    ) : (
      <Flex as="ul" flexDir="column" gap="6px" listStyleType="none" m={0} p={0}>
        {checks.map((rc) => {
          const l = readyCheckLine(d, rc, myUserId, now);
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
};
