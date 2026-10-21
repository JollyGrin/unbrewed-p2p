import type { CardInstanceId, GameEvent, PlayerId } from "./protocol";

/**
 * The last Keen Hearing reveal, kept for the panel (Superman, ruling R5: the
 * reveal is public to every seat). A SNAPSHOT of the `CARD_REVEALED` events the
 * client received — never read back from live hand state — so it can only ever
 * show what the reveal itself exposed to this seat.
 */
export interface RevealedHand {
  /** The seat that played the scheme (whose NEXT turn start clears the panel). */
  revealer: PlayerId;
  /** The seat whose hand was revealed. */
  owner: PlayerId;
  cards: CardInstanceId[];
  /** Turn number the snapshot was taken on. */
  turn: number;
}

/** `CARD_REVEALED` carries `{player, card}` only — no origin (hand vs deck top vs
 *  combat) — so a hand reveal is recognised by the scheme that makes it. */
const KEEN_HEARING_DEF = "superman/keen-hearing";
const isKeenHearing = (card: CardInstanceId) => card.split("#")[0] === KEEN_HEARING_DEF;

/**
 * Fold one STATE batch's events into the panel. A Keen Hearing reveal replaces
 * whatever was held; the revealer's next `TURN_STARTED` clears it.
 */
export function advanceRevealedHand(
  prev: RevealedHand | null,
  events: GameEvent[],
  turnNumber: number
): RevealedHand | null {
  let panel = prev;
  let revealer: PlayerId | null = null;
  let pending: { owner: PlayerId; cards: CardInstanceId[] } | null = null;
  const flush = () => {
    if (pending && revealer) {
      panel = { revealer, owner: pending.owner, cards: pending.cards, turn: turnNumber };
    }
    pending = null;
  };
  for (const e of events) {
    if (e.type === "SCHEME_PLAYED" && isKeenHearing(e.card)) {
      revealer = e.player;
    } else if (e.type === "CARD_REVEALED" && revealer && e.player !== revealer) {
      if (!pending || pending.owner !== e.player) {
        flush();
        pending = { owner: e.player, cards: [] };
      }
      pending.cards.push(e.card);
    } else if (e.type === "TURN_STARTED") {
      flush();
      if (panel && e.player === panel.revealer) panel = null;
    }
  }
  flush();
  return panel;
}
