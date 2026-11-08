/**
 * Pro LOBBY protocol v2 — SOURCE OF TRUTH (issue #1034; v2 wave → accept pairing, issue #1041).
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
 *   (sender → target) per 15 s and 6 per sender per minute. A paired watcher
 *   can neither nudge nor be nudged (`NUDGE_RESULT reason: 'busy'`).
 *
 * ## v2: wave → accept → paired (issue #1041)
 * - A NUDGE opens an INVITATION (sender → target) for NUDGE_REPLY_WINDOW_MS
 *   (60 s). The target answers with NUDGE_REPLY `{ to: <sender id>, accept }`.
 *   No live invitation from `to` ⇒ `NUDGE_REPLY_RESULT reason 'expired'`; `to`
 *   not a watcher ⇒ 'unknown'; either side already paired ⇒ 'busy'. A reply
 *   consumes the invitation (a later wave opens a new one).
 * - Decline: the waver gets NUDGE_DECLINED `{ from }`.
 * - Accept: the server opens a PAIR. The ACCEPTER is `host`, the WAVER `guest`.
 *   Both get PAIRED `{ pairId, role, with }`; both entries carry `paired: true`
 *   in every SNAPSHOT until the pair ends. A watcher is in at most one pair.
 * - The host opens a private room on the GAME socket (CREATE_ROOM with
 *   `quickMatch: true`, never published — it pays the quick-play bonus like any
 *   Quick Match room) and sends PAIR_ROOM `{ pairId, roomId }`. The server relays
 *   PAIR_ROOM to the guest, who JOIN_ROOMs it. Once relayed the pair is HANDED
 *   OFF: either socket closing after that ends it silently (they are taking
 *   seats). A later PAIR_ROOM from the host replaces the room and is relayed again.
 * - PAIR_CANCEL from either side ends the pair; the OTHER side gets PAIR_ENDED
 *   'cancelled'. A socket closing before hand-off ⇒ the other side gets
 *   PAIR_ENDED 'left'. No hand-off within PAIR_TTL_MS (5 min) ⇒ both get
 *   PAIR_ENDED 'expired'. A handed-off pair is forgotten after 2 min.
 * - PAIR_ROOM from the guest, or with an unknown/ended `pairId`, and PAIR_CANCEL
 *   with an unknown `pairId` ⇒ `ERROR BAD_PAIR` (the socket stays open).
 */
import type { LobbyListing } from './protocol';

export const LOBBY_PROTOCOL_VERSION = 2;

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
  /** v2: in a pair (a wave was accepted) — not wave-able. Absent otherwise. */
  paired?: true;
}

export type PairRole = 'host' | 'guest';
export type PairEndReason = 'cancelled' | 'left' | 'expired';

/** The quick-play XP bonus advert. `endsAt` is ISO. */
export interface QuickPlayBonus {
  multiplier: number;
  endsAt: string;
}

export type LobbyClientMsg =
  | {
      v: 2;
      type: 'HELLO';
      state?: LobbyPresenceState;
      heroId?: string;
      displayName?: string;
      badge?: string;
      badges?: string[];
      playerId?: string;
    }
  | { v: 2; type: 'STATE'; state: LobbyPresenceState; heroId?: string }
  | { v: 2; type: 'NUDGE'; to: string }
  | { v: 2; type: 'NUDGE_REPLY'; to: string; accept: boolean }
  | { v: 2; type: 'PAIR_ROOM'; pairId: string; roomId: string }
  | { v: 2; type: 'PAIR_CANCEL'; pairId: string };

export type LobbyErrorCode = 'VERSION' | 'BAD_MESSAGE' | 'RATE_LIMITED' | 'HELLO_FIRST' | 'BAD_PAIR';

export type LobbyServerMsg =
  | {
      v: 2;
      type: 'SNAPSHOT';
      you: string;
      here: number;
      looking: number;
      players: PresenceEntry[];
      lobbies: LobbyListing[];
      tablesInPlay: number;
      bonus?: QuickPlayBonus;
    }
  | { v: 2; type: 'NUDGED'; from: PresenceEntry }
  | { v: 2; type: 'NUDGE_RESULT'; to: string; ok: boolean; reason?: 'unknown' | 'rate_limited' | 'self' | 'busy' }
  | { v: 2; type: 'NUDGE_REPLY_RESULT'; to: string; ok: boolean; reason?: 'unknown' | 'expired' | 'busy' }
  | { v: 2; type: 'NUDGE_DECLINED'; from: PresenceEntry }
  | { v: 2; type: 'PAIRED'; pairId: string; role: PairRole; with: PresenceEntry }
  | { v: 2; type: 'PAIR_ROOM'; pairId: string; roomId: string }
  | { v: 2; type: 'PAIR_ENDED'; pairId: string; reason: PairEndReason }
  | { v: 2; type: 'ERROR'; code: LobbyErrorCode; message: string };
