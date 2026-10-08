/**
 * Everything that makes /pro/game a tournament game, kept out of the casual
 * game page.
 *
 * `TournamentGate` wraps the live game. Before the game mounts it decides
 * whether this load is a tournament game (`useTournamentRoom`), owns the ticket
 * a match page sent (single use: it leaves the URL at once), and renders every
 * screen that needs no game socket: the board a ticket names that this client
 * can't open, a reload in the middle of a launch, a tournament room this browser
 * has no seat for, and the short hold while the api is asked about a `?room=`
 * link. It hands the game at most one prop: `GateTournament`, or nothing at all
 * for a casual game.
 *
 * `useTournamentGame` is the game's side of it: the one hook the live game
 * calls, for what needs the socket — launching the ticket, the screens that
 * answer an engine frame (ticket errors, a released or replaced seat), and the
 * tournament bits of the waiting room, the table and the end screen. For a
 * casual game it does nothing that shows.
 */
import { Box, Flex, Text } from "@chakra-ui/react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { MutableRefObject, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { LazyScreenFallback } from "@/components/Pro/LazyScreenFallback";
import { RoomClosedScreen, type MatchNotice } from "@/components/Pro/MatchDecidedBanner";
import { BackToMatchButton, gameEndNote, LostGameMatchNote, opponentNameOf, TournamentGameStrip, useTaggedGameEndReason } from "@/components/Pro/TournamentGameNotes";
import { useAccount } from "@/lib/account/useAccount";
import { catalogEntry } from "@/lib/pro/mapCatalog";
import type { ProFormatId } from "@/lib/pro/multiplayerPlaytest";
import type { PlayerView } from "@/lib/pro/protocol";
import { getToken } from "@/lib/pro/recentRooms";
import {
  dropTicketFragment,
  forgetPendingPick,
  forgetTournamentRoom,
  parseTicketQuery,
  pendingPick,
  rememberPendingPick,
  rememberTournamentRoom,
  samePagePath,
  takeTicketFragment,
  ticketBoard,
  TICKET_ERROR_CODES,
  tournamentRoomOf,
  wasSeatedIn,
  withoutTicketQuery,
  type TicketLaunch,
  type TournamentRoom,
} from "@/lib/pro/tournamentTicket";
import type { UseProSocketReturn } from "@/lib/pro/useProSocket";
import { useTournamentRoom } from "@/lib/pro/useTournamentRoom";

// Rare tournament screens, loaded on demand so their match helpers stay out of the first load.
const SeatReplacedScreen = dynamic(() => import("@/components/Pro/SeatReplacedScreen").then((m) => m.SeatReplacedScreen), {
  ssr: false,
  loading: LazyScreenFallback,
});
const TicketErrorScreen = dynamic(() => import("@/components/Pro/TicketErrorScreen").then((m) => m.TicketErrorScreen), {
  ssr: false,
  loading: LazyScreenFallback,
});

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** What the gate tells the live game about a tournament game. Casual games get nothing. */
export interface GateTournament {
  /** `ticket`: the match page sent a ticket. `tagged`: a remembered or looked-up tournament room. */
  kind: "ticket" | "tagged";
  /** The match the page's room belongs to. */
  ref: TournamentRoom;
  /** The ticket this page load arrived with, held in memory (it left the URL at once), or null. */
  launch: TicketLaunch | null;
}

/** Whether a room is one this browser knows as a tournament room (useProSocket's gate). */
export const isTournamentRoom = (roomId: string): boolean => tournamentRoomOf(roomId) !== null;

const Holding = ({ testId, children }: { testId: string; children: ReactNode }) => (
  <Flex direction="column" alignItems="center" gap="0.75rem" pt="6rem" px="1rem" textAlign="center" data-testid={testId}>
    <Text fontFamily="LeagueGothic" fontSize="2.5rem" letterSpacing="0.05em">
      {children}
    </Text>
  </Flex>
);

/**
 * The ticket of this page load: `#ticket=` (read once, it leaves the address
 * bar on the first client render) or an old `?ticket=` link, beside its
 * `?tour=…&match=…`. Held from the first render it appears in: the URL loses it
 * right after.
 */
const useTicketLaunch = (): TicketLaunch | null => {
  const router = useRouter();
  const fragment = takeTicketFragment();
  const parsed = parseTicketQuery(fragment ? { ...router.query, ticket: fragment } : router.query);
  const held = useRef<TicketLaunch | null>(null);
  if (parsed && !held.current) held.current = parsed;
  return held.current;
};

export const TournamentGate = ({
  room,
  quickParam,
  children,
}: {
  room: string | null;
  quickParam: boolean;
  children: (tournament: GateTournament | undefined) => ReactNode;
}) => {
  const router = useRouter();
  const account = useAccount();
  const launch = useTicketLaunch();
  const { kind, ref } = useTournamentRoom(room, launch);

  // A ticket whose board this client can't send: nothing to open.
  const boardProblem = useMemo(() => {
    if (!launch || launch.room || !launch.map) return null;
    const board = ticketBoard(launch.map);
    return board.ok ? null : board.message;
  }, [launch]);

  // The ticket is single use: it leaves the URL now, so a refresh RECONNECTs
  // with the seat token instead of spending it again. Before that, the tab
  // remembers the launch (a refresh at the hero picker has no room yet and
  // must not land in the casual lobby) — unless this browser already holds a
  // seat in the ticket's room, which is the way back in.
  const firedRef = useRef(false);
  useEffect(() => {
    if (!launch || firedRef.current) return;
    firedRef.current = true;
    dropTicketFragment();
    router.replace({ pathname: router.pathname, query: withoutTicketQuery(router.query) }, undefined, { shallow: true });
    const at = { slug: launch.slug, matchId: launch.matchId };
    if (launch.room && getToken(launch.room)) {
      rememberTournamentRoom(launch.room, at);
      if (!launch.heroId) return;
    }
    if (!boardProblem) rememberPendingPick(at);
  }, [launch, router, boardProblem]);

  // A refresh mid-launch: no ticket, no room, but this tab was launching a
  // match. Read on mount (client-only) so the static export hydrates cleanly.
  const [pendingLaunch, setPendingLaunch] = useState<TournamentRoom | null>(null);
  useEffect(() => {
    if (!launch && !room && !quickParam) setPendingLaunch(pendingPick());
  }, [launch, room, quickParam]);
  // Leaving the page or signing out ends the remembered launch. A route change
  // to this same page is NOT leaving it: the ticket-strip replace above fires
  // routeChangeStart right after the note is written.
  useEffect(() => {
    const done = (url: string) => {
      if (samePagePath(url, router.basePath, router.pathname)) return;
      forgetPendingPick();
    };
    router.events?.on("routeChangeStart", done);
    return () => router.events?.off("routeChangeStart", done);
  }, [router]);
  const wasSignedInRef = useRef(false);
  useEffect(() => {
    const signedOut = wasSignedInRef.current && account.status !== "signed-in";
    wasSignedInRef.current = account.status === "signed-in";
    if (signedOut) {
      forgetPendingPick();
      setPendingLaunch(null);
    }
  }, [account.status]);

  // Once the game has opened on a known URL, the room screens below are its
  // to make: a seat token it loses later (BAD_TOKEN) is its ticket card, never
  // this gate's "open in another tab".
  const liveRef = useRef(false);
  // A game that mounted before the router was ready (the static export's first
  // render has no query yet) stays mounted — hidden — under any screen below:
  // unmounting it would drop its socket and open a second one after the screen.
  // Decided once, at its first mount, so the tree around it never changes.
  const keepMountedRef = useRef<boolean | null>(null);

  // A ticket in the address (the match page's Play, a dead-room retry) before
  // the router has its query: a neutral frame, never the casual lobby for a
  // moment. Read before the first paint; the server render can't see the hash.
  const [ticketArriving, setTicketArriving] = useState(false);
  useIsoLayoutEffect(() => {
    if (!router.isReady && takeTicketFragment()) setTicketArriving(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const screen = ((): ReactNode => {
    if (ticketArriving && !router.isReady) return <Holding testId="ticket-arriving">OPENING YOUR ROOM…</Holding>;
    if (boardProblem && ref) return <TicketErrorScreen message={boardProblem} at={ref} />;
    // Refreshed at the tournament hero picker: the ticket was single use and no
    // room exists yet — a fresh ticket, never the casual lobby.
    if (!launch && !room && !quickParam && pendingLaunch) {
      return (
        <TicketErrorScreen
          message="Your match game didn't open before the page reloaded. Press Try again to pick your hero again."
          retry
          pendingLaunch
          at={pendingLaunch}
        />
      );
    }
    if (!liveRef.current && room && !launch && !getToken(room)) {
      // A tournament room this browser has no seat token for: a JOIN_ROOM without
      // a ticket would only earn TICKET_REQUIRED, so never show the picker — get
      // a ticket the match page's way (a recorded ready, or a join ticket).
      // "Another tab" only when this browser once held the seat; a player who
      // never sat here (a forwarded link, the api's lookup) just gets their seat.
      if (kind === "tagged" && ref)
        return wasSeatedIn(room) ? (
          <TicketErrorScreen
            message="This tournament game is open in another tab or device. Press Try again to take your seat here."
            retry
            at={ref}
          />
        ) : (
          <TicketErrorScreen message="Get your seat for this match to play here." retry retryLabel="Get my seat" at={ref} />
        );
      // Still asking the api whether this is one of my match rooms: a JOIN into
      // one without a ticket is a dead end. Casual after a short wait, whatever happens.
      if (kind === "lookup") return <Holding testId="room-lookup">OPENING ROOM…</Holding>;
    }
    return null;
  })();
  const game = () => children((kind === "ticket" || kind === "tagged") && ref ? { kind, ref, launch } : undefined);

  if (keepMountedRef.current === null && !screen) keepMountedRef.current = !router.isReady;
  if (keepMountedRef.current) {
    if (!screen && router.isReady) liveRef.current = true;
    return (
      <>
        {screen}
        <Box display={screen ? "none" : "contents"}>{game()}</Box>
      </>
    );
  }
  if (screen) return <>{screen}</>;
  if (router.isReady) liveRef.current = true;
  return <>{game()}</>;
};

/** The live game's state the tournament side reads and drives. */
interface LiveGameBits {
  socket: UseProSocketReturn;
  room: string | null;
  joined: boolean;
  setJoined: (joined: boolean) => void;
  /** Set when this page load resumed a seat instead of picking one. */
  reconnectedRef: MutableRefObject<boolean>;
  setSelectedHeroId: (heroId: string) => void;
  setSelectedMapId: (mapId: string) => void;
  setSelectedFormat: (format: ProFormatId) => void;
  setRolledHero: (rolled: boolean) => void;
}

const matchOf = (launch: TicketLaunch): TournamentRoom => ({ slug: launch.slug, matchId: launch.matchId });

export function useTournamentGame(gate: GateTournament | undefined, live: LiveGameBits) {
  const { socket, room, joined, setJoined, reconnectedRef } = live;
  const { roomId, error, identitySettled, seatReleasedRoom, seatReplaced, takeSeatBack, snapshot, joinRoom, createRoom } = socket;
  const launch = gate?.launch ?? null;

  // After a ticket JOIN the room's board is the ticket's, or unknown.
  const boardUnknownRef = useRef(false);
  const launchTicket = (l: TicketLaunch, heroId: string) => {
    live.setSelectedHeroId(heroId);
    if (l.room) {
      // The joiner sends no board; name the ticket's, or none.
      const entry = l.map?.kind === "catalog" ? catalogEntry(l.map.id) : undefined;
      if (entry) live.setSelectedMapId(entry.id);
      else boardUnknownRef.current = true;
      joinRoom(l.room, heroId, l.ticket);
      setJoined(true);
      return;
    }
    const board = ticketBoard(l.map);
    if (!board.ok) return; // the gate showed this ticket's board card instead of the game
    live.setSelectedFormat("duel");
    live.setSelectedMapId(board.mapId);
    createRoom(heroId, undefined, board.customMap, "duel", [], 0, undefined, undefined, undefined, undefined, l.ticket);
    setJoined(true);
  };

  // A ticket launch owns the seat for this page load. This browser holding a
  // seat token for the ticket's room (a refresh before the URL was cleaned,
  // "Back to your room"): RECONNECT with it first — a seat the engine still
  // holds refuses a ticket JOIN — and fall back to the ticket JOIN if the
  // engine released it. A ticket that sets the hero does that through the
  // launch below; one that doesn't reconnects here.
  const ticketFiredRef = useRef(false);
  useEffect(() => {
    if (!launch || ticketFiredRef.current) return;
    ticketFiredRef.current = true;
    if (launch.room && getToken(launch.room) && !launch.heroId) {
      reconnectedRef.current = true;
      joinRoom(launch.room, "", launch.ticket);
      setJoined(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch, joinRoom]);
  // The seat was released while we were away: back to the same hero picker
  // the first visit saw, ticket still in memory; the pick sends the JOIN.
  useEffect(() => {
    if (!seatReleasedRoom || !launch || launch.room !== seatReleasedRoom) return;
    reconnectedRef.current = false;
    setJoined(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatReleasedRoom, launch]);

  // A ticket that sets the hero launches by itself — but only once the seat
  // identity has settled, or the CREATE_ROOM/JOIN_ROOM goes out with no
  // nameplate, badges or cosmetics. One-shot; a stuck probe gives up after 8s.
  const ticketLaunchedRef = useRef(false);
  const [identityWaitOver, setIdentityWaitOver] = useState(false);
  useEffect(() => {
    if (!launch?.heroId || identitySettled) return;
    const t = setTimeout(() => setIdentityWaitOver(true), 8000);
    return () => clearTimeout(t);
  }, [launch, identitySettled]);
  useEffect(() => {
    if (!launch?.heroId || ticketLaunchedRef.current) return;
    if (!identitySettled && !identityWaitOver) return;
    ticketLaunchedRef.current = true;
    launchTicket(launch, launch.heroId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch, identitySettled, identityWaitOver]);

  // Any engine error ends a remembered launch: a reload then opens the lobby.
  useEffect(() => {
    if (error) forgetPendingPick();
  }, [error]);

  // The engine never says a room is a tournament room, so the tab remembers
  // it: a refresh or the game-over screen still hides Rematch and links back.
  // Seated in an UNTAGGED room (picker, rematch, Quick Match): a stale note for
  // a reused room code must not hide its invite link or Rematch.
  const untaggedSeatRef = useRef(false);
  useEffect(() => {
    if (!roomId) return;
    forgetPendingPick();
    if (launch) rememberTournamentRoom(roomId, matchOf(launch));
    else if (untaggedSeatRef.current) forgetTournamentRoom(roomId);
  }, [roomId, launch]);
  const at: TournamentRoom | null = launch ? matchOf(launch) : untaggedSeatRef.current ? null : tournamentRoomOf(roomId ?? room);
  /** `at`, or the gate's answer for the page's room (a looked-up room this browser couldn't note). */
  const tagged = at ?? (untaggedSeatRef.current ? null : gate?.ref ?? null);
  // Why a tournament game ended, from the api once it's over.
  const endReason = useTaggedGameEndReason(at, roomId, !!snapshot?.view.winner);

  // The room is no longer this player's: moved out of the match (a stale ticket
  // can still seat them in the other finalist's room), or the waiting room's
  // hold ran out. The page then shows only the notice; a moved-out player's
  // socket closes so they stop occupying a room that isn't theirs.
  const [closedNotice, setClosedNotice] = useState<MatchNotice | null>(null);
  const onNotice = (notice: MatchNotice) => {
    if (notice === "removed" || notice === "expired") setClosedNotice(notice);
  };
  const { closeForGood } = socket;
  useEffect(() => {
    if (closedNotice === "removed") closeForGood();
  }, [closedNotice, closeForGood]);
  // The hold's end is our clock's guess: a join ticket issued just before it
  // stays good a little longer and the engine sweeps late, so a game that
  // starts anyway wins over the expiry notice. Being moved out stays final.
  useEffect(() => {
    if (snapshot) setClosedNotice((n) => (n === "expired" ? null : n));
  }, [snapshot]);

  const errorScreen = (() => {
    if (!error) return null;
    // A tournament game refused — the ticket codes, the match's room gone or
    // full, a seat token the engine no longer knows, or anything else — reads as
    // copy with a fresh-ticket retry and a way back: never "create a new room"
    // (an untagged game), never the bare "{code}: {message}" line.
    if (tagged) return <TicketErrorScreen code={error.code} engineMessage={error.message} at={tagged} roomId={launch?.room ?? room ?? roomId} />;
    // A tagged room we can't place (a forwarded link, not your match): the
    // engine's answer still reads as the ticket card, pointing at your tournaments.
    if ((TICKET_ERROR_CODES as readonly string[]).includes(error.code))
      return <TicketErrorScreen code={error.code} engineMessage={error.message} at={null} />;
    return null;
  })();

  return {
    /** The match this room belongs to: the waiting room, the table strip, the end screen. */
    at,
    /** `at`, or a room the api placed: the error screens and the HUD's private room code. */
    tagged,
    /** The ticket launch owns the seat: the page's own `?room=` reconnect stays out of it. */
    ownsSeat: launch !== null,
    /** A tournament room's seat is never another tab's: any stored token resumes it. */
    resumesAnyToken: gate?.kind === "tagged",
    /** After a ticket JOIN without a board this page doesn't know which board it is. */
    boardUnknown: boardUnknownRef.current,
    /** The hero picker of a ticket that leaves the hero open. */
    lobby: launch ? { label: "pick your hero" } : null,
    /** Before the hero picker: a ticket that sets the hero is launched once the seat identity settles. */
    preJoinScreen: !joined && launch?.heroId ? <HoldingScreen /> : null,
    /** The hero picker's pick, when a ticket decides room, board and format. True = handled. */
    pick: (heroId: string, wasRolled: boolean): boolean => {
      if (!launch) {
        untaggedSeatRef.current = true;
        return false;
      }
      live.setRolledHero(wasRolled);
      launchTicket(launch, heroId);
      return true;
    },
    /** This page seated itself in a room of its own making (rematch, Quick Match). */
    seatedUntagged: () => {
      untaggedSeatRef.current = true;
    },
    /**
     * Another tab or device took this seat: this tab stops rather than freezing
     * as a silent zombie, and only takes the seat back when the player says so.
     */
    seatScreen: seatReplaced ? <SeatReplacedScreen roomId={roomId ?? room} at={tagged} onTakeBack={takeSeatBack} /> : null,
    /** Moved out of the match, or the waiting room's hold ran out: the notice alone, no board. */
    closedScreen: closedNotice && at ? <RoomClosedScreen notice={closedNotice} at={at} /> : null,
    /** The waiting room's and the table strip's notice reports here. */
    onNotice,
    errorScreen,
    lostGameAside: tagged ? <LostGameMatchNote at={tagged} /> : null,
    /** The table's strip: the match's decided/hold notice and, in a duel, the opponent's forfeit clock. */
    strip: (view: PlayerView, multiplayerView: boolean) => {
      if (!at) return null;
      const away = view.opponent?.id;
      return <TournamentGameStrip at={at} view={view} awayDeadline={!multiplayerView && away ? socket.seatPresence[away]?.autoForfeitAt ?? null : null} onNotice={onNotice} />;
    },
    /** In Rematch's place on the end screen: the next game is a new ticket from the match page. */
    endAction: at ? <BackToMatchButton at={at} /> : null,
    /** Why a tagged duel ended: the api's endReason, else the engine's own sign (they were still away). */
    endNote: (view: PlayerView, multiplayerView: boolean): string | null =>
      at && !multiplayerView && view.winner
        ? gameEndNote(
            // presence is cleared at game over; the coarse flag keeps "still away"
            endReason ?? (view.winner === view.you && !socket.opponentConnected ? "disconnect" : null),
            view.winner === view.you,
            opponentNameOf(view),
          )
        : null,
  };
}

const HoldingScreen = () => <Holding testId="ticket-loading">LOADING YOUR MATCH…</Holding>;
