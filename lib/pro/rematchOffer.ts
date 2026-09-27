/**
 * Rematch offer/confirm — the client's side of the negotiation (p2p #880,
 * engine #607, protocol v35). Pure: useProSocket feeds it what it sends and
 * what the server answers, the winner screen renders whatever phase it is in.
 *
 *   idle ──OFFER──▶ offering ──READY──▶ ready (the page moves to the new room)
 *   idle ◀─OFFERED(from someone else)── incoming ──ACCEPT──▶ accepting ──READY──▶ ready
 *
 * Every other way out lands back on `idle`, carrying a `notice` that says why
 * (declined, cancelled, opponent left, no answer, needs a refresh) — the button
 * comes back beside it.
 *
 * Only a PvP room on an engine that speaks v35 negotiates. Vs AI, and against
 * a v34 engine, the winner screen keeps the one-tap `?rematch=` link instead
 * (lib/pro/rematch.ts).
 */
import type { PlayerId, RematchClosedReason } from "./protocol";

/** Why the last negotiation ended without a room. `refused` = ERROR{REMATCH_UNAVAILABLE}. */
export interface RematchNotice {
  reason: RematchClosedReason | "refused";
  /** the seat that declined / cancelled / left / came back on an old client */
  player?: PlayerId;
  /** the server's own words, for `refused` */
  message?: string;
}

export type RematchOfferState =
  | { phase: "idle"; notice: RematchNotice | null }
  /** our offer is out; waiting for the other player(s) */
  | { phase: "offering" }
  /** another player offered; we have not answered */
  | { phase: "incoming"; from: PlayerId }
  /** we said yes; waiting for the rest of the table / the new room */
  | { phase: "accepting" }
  /** the server built the room; the page is on its way there */
  | { phase: "ready"; roomId: string };

export type RematchOfferEvent =
  // what WE sent
  | { type: "OFFER" }
  | { type: "ACCEPT" }
  | { type: "DECLINE" }
  | { type: "CANCEL" }
  // what the server said
  | { type: "OFFERED"; from: PlayerId; me: PlayerId | null }
  | { type: "READY"; roomId: string; currentRoom: string | null }
  | { type: "CLOSED"; reason: RematchClosedReason; player?: PlayerId }
  | { type: "REFUSED"; message: string };

export const REMATCH_IDLE: RematchOfferState = { phase: "idle", notice: null };

export function rematchOfferReducer(state: RematchOfferState, event: RematchOfferEvent): RematchOfferState {
  // Once the room exists nothing un-builds it: the page is navigating.
  if (state.phase === "ready") return state;
  switch (event.type) {
    case "OFFER":
      return state.phase === "idle" ? { phase: "offering" } : state;
    case "ACCEPT":
      return state.phase === "incoming" ? { phase: "accepting" } : state;
    case "DECLINE":
      return state.phase === "incoming" ? REMATCH_IDLE : state;
    case "CANCEL":
      return state.phase === "offering" ? REMATCH_IDLE : state;
    case "OFFERED":
      // Re-sent to the offerer on reconnect ("your offer is still waiting").
      if (event.me !== null && event.from === event.me) return { phase: "offering" };
      // Crossing offers: ours is already our acceptance — keep waiting for the room.
      if (state.phase === "offering" || state.phase === "accepting") return state;
      return { phase: "incoming", from: event.from };
    case "READY":
      // A READY naming the room this tab already sits in is stale — never
      // "move" into where we are (engine review of #608).
      if (event.currentRoom !== null && event.roomId.toUpperCase() === event.currentRoom.toUpperCase()) return state;
      return { phase: "ready", roomId: event.roomId };
    case "CLOSED":
      // Nothing open on our side — incl. our own decline / cancel echoing back
      // (both already dropped us to idle): nothing to say.
      if (state.phase === "idle") return state;
      return {
        phase: "idle",
        notice: { reason: event.reason, ...(event.player !== undefined ? { player: event.player } : {}) },
      };
    case "REFUSED":
      return { phase: "idle", notice: { reason: "refused", message: event.message } };
  }
}

/** The line the winner screen shows for a notice. `nameOf` turns a seat into a name. */
export function rematchNoticeText(notice: RematchNotice, nameOf: (p: PlayerId) => string): string {
  const who = notice.player !== undefined ? nameOf(notice.player) : "Your opponent";
  switch (notice.reason) {
    case "declined":
      return `${who} declined the rematch`;
    case "cancelled":
      return `${who} withdrew the rematch offer`;
    case "disconnected":
      return `${who} left — no rematch`;
    case "timeout":
      return "No answer — the rematch offer expired";
    case "unavailable":
      return notice.player !== undefined
        ? `${who} needs to refresh to rematch`
        : "Couldn't start the rematch — try again";
    case "refused":
      // The engine refuses an offer when another seat's client is too old to
      // answer it (bound at v34): the fix is on their side.
      return /client/i.test(notice.message ?? "")
        ? "Your opponent needs to refresh to rematch"
        : `Rematch unavailable${notice.message ? ` — ${notice.message}` : ""}`;
  }
}
