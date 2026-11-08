/**
 * Wave → accept → matched (issue #1556 ↔ engine #1041, lobby protocol v2): the
 * pure state machine behind `/pro/game`'s matched mode.
 *
 * A 👋 the target ACCEPTS pairs the two pickers. The accepter is the `host`, the
 * waver the `guest`. Both pick a fighter and press Go:
 * - host: CREATE_ROOM with `quickMatch: true` (never published), then relay the
 *   new room id over the lobby socket (PAIR_ROOM);
 * - guest: JOIN_ROOM that relayed id — at once if it is already here, else as
 *   soon as it arrives (`ready`).
 * Cancel on either side, or the server ending the pair, clears it for both.
 *
 * The reducer owns the transitions and says what the page must DO as effects;
 * the page owns the sockets and runs them.
 */
import type { PairRole, PresenceEntry } from "./lobbyProtocol";

export interface LobbyPair {
  pairId: string;
  role: PairRole;
  /** the other player, as PAIRED introduced them */
  with: PresenceEntry;
  /** host: the room it created and relayed; guest: the room the host relayed */
  roomId: string | null;
  /** we pressed Go (host: the create went out; guest: waiting for PAIR_ROOM) */
  ready: boolean;
}

export type PairEvent =
  /** the server opened a pair */
  | { type: "paired"; pairId: string; role: PairRole; with: PresenceEntry }
  /** guest: the host's room id, relayed by the server */
  | { type: "room"; pairId: string; roomId: string; seated: boolean }
  /** our Go */
  | { type: "go" }
  /** host: ROOM_CREATED for the room our Go asked for */
  | { type: "created"; roomId: string }
  /** our Cancel */
  | { type: "cancel"; seated: boolean }
  /** PAIR_ENDED from the server */
  | { type: "ended"; pairId: string; seated: boolean }
  /** the pair is gone without a server word (the lobby socket dropped) */
  | { type: "clear"; seated: boolean }
  /** host: our create bounced (ROOM_LIMIT…) before a room existed — Go again */
  | { type: "unready" };

export type PairEffect =
  /** host: open the private quick-match room */
  | { type: "create" }
  /** guest: take the seat in the host's room */
  | { type: "join"; roomId: string }
  /** host: relay our room id to the guest */
  | { type: "pairRoom"; pairId: string; roomId: string }
  /** tell the server the pair is off */
  | { type: "cancelPair"; pairId: string }
  /** we hold a seat on the game socket: leave it (full navigation back to the picker) */
  | { type: "leave" };

export interface PairStep {
  pair: LobbyPair | null;
  effects: PairEffect[];
}

const same = (pair: LobbyPair | null): PairStep => ({ pair, effects: [] });
const ended = (seated: boolean): PairStep => ({ pair: null, effects: seated ? [{ type: "leave" }] : [] });

export const reducePair = (pair: LobbyPair | null, event: PairEvent): PairStep => {
  switch (event.type) {
    case "paired":
      return {
        pair: { pairId: event.pairId, role: event.role, with: event.with, roomId: null, ready: false },
        effects: [],
      };
    case "room": {
      if (!pair || pair.pairId !== event.pairId || pair.role !== "guest") return same(pair);
      const next = { ...pair, roomId: event.roomId };
      // A later PAIR_ROOM replaces the room; one we already sat down in stays ours.
      const join = pair.ready && !event.seated;
      return { pair: next, effects: join ? [{ type: "join", roomId: event.roomId }] : [] };
    }
    case "go": {
      if (!pair || pair.ready) return same(pair);
      const next = { ...pair, ready: true };
      if (pair.role === "host") return { pair: next, effects: [{ type: "create" }] };
      return { pair: next, effects: pair.roomId ? [{ type: "join", roomId: pair.roomId }] : [] };
    }
    case "created": {
      if (!pair || pair.role !== "host" || !pair.ready || pair.roomId === event.roomId) return same(pair);
      return {
        pair: { ...pair, roomId: event.roomId },
        effects: [{ type: "pairRoom", pairId: pair.pairId, roomId: event.roomId }],
      };
    }
    case "cancel": {
      if (!pair) return same(pair);
      const { effects } = ended(event.seated);
      return { pair: null, effects: [{ type: "cancelPair", pairId: pair.pairId }, ...effects] };
    }
    case "ended":
      if (!pair || pair.pairId !== event.pairId) return same(pair);
      return ended(event.seated);
    case "clear":
      if (!pair) return same(pair);
      return ended(event.seated);
    case "unready":
      if (!pair || pair.roomId !== null) return same(pair);
      return { pair: { ...pair, ready: false }, effects: [] };
    default:
      return same(pair);
  }
};

/** The partner's display name, as every matched-mode line prints it. */
export const pairPartnerName = (entry: PresenceEntry | null | undefined): string =>
  entry?.displayName?.trim() || "Anonymous";

/** The partner as the latest SNAPSHOT shows them (hero, badge), else as PAIRED did. */
export const livePartner = (
  pair: LobbyPair,
  players: PresenceEntry[] | null | undefined,
): PresenceEntry => (players ?? []).find((p) => p.id === pair.with.id) ?? pair.with;

/**
 * "Ready" on the partner card: the host is in once its room has been relayed to
 * us. A guest has no "in" before the game starts — its join starts the game.
 */
export const partnerReady = (pair: LobbyPair): boolean => pair.role === "guest" && pair.roomId !== null;

/** Toast copy for PAIR_ENDED. */
export const pairEndedMessage = (reason: "cancelled" | "left" | "expired", name: string): string =>
  reason === "cancelled" ? `${name} cancelled` : reason === "left" ? `${name} left` : "Match request expired";

/** Toast copy for a failed NUDGE_REPLY. */
export const nudgeReplyFailMessage = (
  reason: "unknown" | "expired" | "busy" | undefined,
  name: string,
): string =>
  reason === "expired" ? "That request expired" : reason === "busy" ? `${name} is already matched` : `${name} left`;

/** How long the "wants to play" toast stays up — under the server's 60 s invitation. */
export const NUDGE_TOAST_MS = 30_000;
/** How long our own 👋 waits for an answer before the chip re-enables (the server's window). */
export const NUDGE_REPLY_WINDOW_MS = 60_000;
