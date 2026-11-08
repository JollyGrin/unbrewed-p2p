/**
 * Pro LOBBY protocol v1 — SOURCE OF TRUTH (issue #1034).
 *
 * A second, thin websocket the client opens at `/lobby` while it sits on the
 * `/pro/game` hero picker and closes once it takes a seat on the game socket.
 * It carries presence only: who is here, who is looking for a game, the open
 * lobbies, how many tables are in play, the quick-play bonus advert, and a 👋
 * nudge. It is NOT the game protocol: `protocol/protocol.ts` and its
 * `PROTOCOL_VERSION` are independent of this file and do not move with it.
 *
 * ## Sync procedure
 * Any change here bumps LOBBY_PROTOCOL_VERSION. Copy this file VERBATIM to
 * `unbrewed-p2p/lib/pro/lobbyProtocol.ts` and note the sync in both commit
 * bodies. The ONE import (`LobbyListing` from `./protocol`) resolves in both
 * repos because the game protocol already lives beside it at
 * `lib/pro/protocol.ts` on the client.
 *
 * ## Flow
 * - Client sends HELLO first (it may re-send HELLO later to update identity).
 *   Any other frame before HELLO ⇒ `ERROR HELLO_FIRST`; the socket stays open.
 * - HELLO is answered at once with a SNAPSHOT. After that every socket past
 *   HELLO is pushed a SNAPSHOT (coalesced, 250 ms) whenever something it shows
 *   changes, plus a 10 s heartbeat SNAPSHOT.
 * - `you` / `PresenceEntry.id` are per-socket opaque tokens — never the
 *   client's playerId, which stays server-side.
 * - `sinceMs` is ms since that socket's HELLO (same convention as
 *   `LobbyListing.ageMs`).
 * - `here` = sockets past HELLO + listed lobbies (a host waiting in their own
 *   room is "here" but on the game socket); `looking` = listed lobbies;
 *   `players` = sockets past HELLO only, oldest first, capped at 50 (`here`
 *   still counts all); `lobbies` = the same list `LIST_LOBBIES` returns (the
 *   client drops its own room); `tablesInPlay` = started, unfinished games with
 *   at least one human seat; `bonus` absent = no bonus running.
 * - NUDGE `to` is a `PresenceEntry.id` from the last SNAPSHOT. Limits: one per
 *   (sender → target) per 15 s and 6 per sender per minute.
 */
import type { LobbyListing } from './protocol';

export const LOBBY_PROTOCOL_VERSION = 1;

export type LobbyPresenceState = 'picking' | 'idle' | 'searching';

export interface PresenceEntry {
  id: string;
  state: LobbyPresenceState;
  sinceMs: number;
  heroId?: string;
  heroName?: string;
  displayName?: string;
  badge?: string;
  badges?: string[];
}

/** The quick-play XP bonus advert. `endsAt` is ISO. */
export interface QuickPlayBonus {
  multiplier: number;
  endsAt: string;
}

export type LobbyClientMsg =
  | {
      v: 1;
      type: 'HELLO';
      state?: LobbyPresenceState;
      heroId?: string;
      displayName?: string;
      badge?: string;
      badges?: string[];
      playerId?: string;
    }
  | { v: 1; type: 'STATE'; state: LobbyPresenceState; heroId?: string }
  | { v: 1; type: 'NUDGE'; to: string };

export type LobbyErrorCode = 'VERSION' | 'BAD_MESSAGE' | 'RATE_LIMITED' | 'HELLO_FIRST';

export type LobbyServerMsg =
  | {
      v: 1;
      type: 'SNAPSHOT';
      you: string;
      here: number;
      looking: number;
      players: PresenceEntry[];
      lobbies: LobbyListing[];
      tablesInPlay: number;
      bonus?: QuickPlayBonus;
    }
  | { v: 1; type: 'NUDGED'; from: PresenceEntry }
  | { v: 1; type: 'NUDGE_RESULT'; to: string; ok: boolean; reason?: 'unknown' | 'rate_limited' | 'self' }
  | { v: 1; type: 'ERROR'; code: LobbyErrorCode; message: string };
