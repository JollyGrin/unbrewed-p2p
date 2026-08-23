/**
 * "Match found" cue (issue #689) — the decision half, as a pure reducer.
 *
 * A player who opens a room (Quick Match or an invite link) tabs away while
 * they wait. When the seat fills and the game begins, this is what decides
 * that THIS client earned a chime + a tab-title shout, and that it earns
 * exactly one.
 *
 * The whole thing keys off a single observation: did this client ever SEE
 * itself sitting in a room that still had an empty seat? That is the waiting
 * host, and only the waiting host. Someone joining a duel never sees it (their
 * ROOM_JOINED already reports both seats, and the first STATE lands right
 * behind it); a refresh into a live room never sees it (STATE arrives with the
 * room full); a bot room never sees it (the bot seat is materialized at
 * create). `hasBot` is belt-and-braces on that last one.
 *
 * The dwell window is the backstop for the servers that leave `seats` off
 * ROOM_JOINED — the client then briefly renders a 1-of-2 room for the JOINER
 * too. A real wait is seconds-to-minutes long; that phantom one is milliseconds,
 * so a waiting state has to hold for `WAITING_DWELL_MS` before it can ring.
 */

/** How long a pre-game "seat still empty" state must hold before it can cue.
 *  Long enough to outlive a joiner's/reconnect's phantom waiting frame, short
 *  enough that a real wait always qualifies (nobody has tabbed away in 1.2s). */
export const WAITING_DWELL_MS = 1_200;

/** The cue to play. `start` is the game-begins moment — the loud one, at most
 *  once per room. `fill` is a seat landing in a not-yet-full multi-seat room
 *  (2v2/ffa): a soft acknowledgement, and there can be several. */
export type LobbyCue = "fill" | "start";

/** Everything the decision needs, read off the socket state each render. */
export interface LobbyCueSignals {
  /** we hold an acked seat in a room (ROOM_CREATED/ROOM_JOINED landed) */
  seated: boolean;
  /** seats currently filled (roster/seat list length) */
  seatsFilled: number;
  /** seats this format needs before the game starts */
  requiredPlayers: number;
  /** the game has begun — the first STATE for this room arrived */
  started: boolean;
  /** a bot occupies (or is planned for) a seat: the game starts at create, so
   *  there is no wait and never a cue */
  hasBot: boolean;
  /** epoch ms */
  now: number;
}

export interface LobbyCueState {
  /** when the waiting state was first observed; null = never (yet) */
  waitingSince: number | null;
  /** seats filled at the last waiting observation — a rise is a soft cue */
  lastSeatsFilled: number;
  /** the strong cue has fired, or been ruled out, for this room */
  done: boolean;
}

export const initialLobbyCueState = (): LobbyCueState => ({
  waitingSince: null,
  lastSeatsFilled: 0,
  done: false,
});

/** True while this client is the one sitting in a room with a seat to spare. */
const isWaiting = (s: LobbyCueSignals): boolean =>
  s.seated && !s.started && s.requiredPlayers > 1 && s.seatsFilled < s.requiredPlayers;

/**
 * Fold one observation into the cue state. Returns the next state and the cue
 * to play right now (null = stay quiet). Pure: same inputs, same outputs, no
 * clock of its own — the caller passes `now`.
 */
export function advanceLobbyCue(
  prev: LobbyCueState,
  signals: LobbyCueSignals,
): { state: LobbyCueState; cue: LobbyCue | null } {
  if (prev.done) return { state: prev, cue: null };
  // A bot room starts the instant it is created. Retire the state so a later
  // (impossible, but cheap to rule out) transition can't ring.
  if (signals.hasBot) return { state: { ...prev, done: true }, cue: null };

  if (isWaiting(signals)) {
    if (prev.waitingSince === null) {
      return {
        state: { ...prev, waitingSince: signals.now, lastSeatsFilled: signals.seatsFilled },
        cue: null,
      };
    }
    const dwelled = signals.now - prev.waitingSince >= WAITING_DWELL_MS;
    // A seat landed in a room that still isn't full (2v2/ffa) — soft cue. The
    // duel never gets here: its second seat fills the room, which is the start
    // moment below, so a duel rings exactly once.
    const filled = signals.seatsFilled > prev.lastSeatsFilled;
    return {
      state: { ...prev, lastSeatsFilled: signals.seatsFilled },
      cue: filled && dwelled ? "fill" : null,
    };
  }

  if (signals.started) {
    const waited =
      prev.waitingSince !== null && signals.now - prev.waitingSince >= WAITING_DWELL_MS;
    // Either way this room is settled: a joiner/reconnect/instant start never
    // rings, and a real wait rings once.
    return { state: { ...prev, done: true }, cue: waited ? "start" : null };
  }

  // Seated in a full room that hasn't started yet, or not seated at all —
  // nothing to say, and the waiting clock (if any) is deliberately kept so the
  // start beat below can still see that we waited.
  return { state: prev, cue: null };
}

/** Tab title while the cue is showing — deliberately unmissable in a tab strip. */
export const MATCH_FOUND_TITLE = "⚔ Opponent joined — game starting!";
/** Tab title for the soft (seat filled, room not full) cue. */
export const seatFilledTitle = (seatsFilled: number, requiredPlayers: number): string =>
  `⚔ ${seatsFilled}/${requiredPlayers} seats — waiting…`;
/** Quiet title while the waiting tab sits in the background. */
export const WAITING_TITLE = "⏳ Waiting for an opponent…";
