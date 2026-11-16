import type { CardInstanceId, GameEvent, PlayerId } from "./protocol";

/**
 * The last hand reveal, kept for the panel: Superman's Keen Hearing (ruling R5:
 * the reveal is public to every seat) and, briefly, POMNI's *The Funny One!*
 * (issue #1691 — the fallback view when the in-prompt picker cannot show, e.g.
 * after a reconnect that kept this state). A SNAPSHOT of the `CARD_REVEALED` events the
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
  /** A look taken to decide something right now (*The Funny One!*): cards the
   *  effect shuffles away leave the snapshot, and the turn's end clears it. */
  brief?: boolean;
}

/** Panel plus the bookkeeping that spans batches. In a multi-opponent format
 *  Keen Hearing raises a CHOOSE_OPPONENT prompt, so the `SCHEME_PLAYED` and the
 *  reveal arrive in DIFFERENT batches: `armed` remembers who played it. */
export interface RevealState {
  panel: RevealedHand | null;
  armed: PlayerId | null;
}

export const EMPTY_REVEAL_STATE: RevealState = { panel: null, armed: null };

/** `CARD_REVEALED` carries `{player, card}` only — no origin (hand vs deck top vs
 *  combat) — so a hand reveal is recognised by the scheme that makes it. */
const KEEN_HEARING_DEF = "superman/keen-hearing";
const isKeenHearing = (card: CardInstanceId) => card.split("#")[0] === KEEN_HEARING_DEF;
/** Combat cards whose effect opens with "look at the opponent's hand". They are
 *  not schemes, so they are recognised by their own `EFFECT_RESOLVING` marker. */
const LOOK_AT_HAND_DEFS = new Set(["pomni/the-funny-one"]);
const isLookAtHand = (source: string) => LOOK_AT_HAND_DEFS.has(source.split("#")[0]);

/**
 * Fold one STATE batch's events into the panel. A Keen Hearing reveal replaces
 * whatever was held; the revealer's next `TURN_STARTED` clears it. A look-at-hand
 * reveal (`brief`) must follow its effect marker directly, loses each card the
 * effect shuffles back, and is cleared by the next turn boundary.
 */
export function advanceRevealedHand(prev: RevealState, events: GameEvent[], turnNumber: number): RevealState {
  let panel = prev.panel;
  let revealer: PlayerId | null = prev.armed;
  // Armed by an EARLIER batch (the opponent prompt): the next player action or
  // attack means the reveal never came (empty hand) — stop watching for it.
  const inherited = prev.armed !== null;
  let pending: { owner: PlayerId; cards: CardInstanceId[]; brief: boolean } | null = null;
  // Armed by a look-at-hand effect marker: unlike Keen Hearing there is no prompt
  // between the marker and the reveal, so anything else in between disarms it.
  let look = false;
  // Keen Hearing's reveal is ONE contiguous run of CARD_REVEALED after the play;
  // the first other event after it starts closes it, so a later unrelated reveal
  // (deck top, combat) in the same batch is not folded into the "hand".
  let closed = false;
  const flush = () => {
    if (pending && revealer) {
      panel = {
        revealer,
        owner: pending.owner,
        cards: pending.cards,
        turn: turnNumber,
        ...(pending.brief ? { brief: true } : {}),
      };
    }
    pending = null;
  };
  for (const e of events) {
    if (pending && e.type !== "CARD_REVEALED") {
      closed = true;
      flush();
      revealer = null;
      look = false;
    } else if (look && e.type !== "CARD_REVEALED") {
      revealer = null;
      look = false;
    }
    if (e.type === "SCHEME_PLAYED" && isKeenHearing(e.card)) {
      flush();
      revealer = e.player;
      closed = false;
      look = false;
    } else if (e.type === "EFFECT_RESOLVING" && isLookAtHand(e.source)) {
      flush();
      revealer = e.player;
      closed = false;
      look = true;
    } else if (e.type === "CARD_REVEALED" && revealer && !closed && e.player !== revealer) {
      if (!pending || pending.owner !== e.player) {
        flush();
        pending = { owner: e.player, cards: [], brief: look };
      }
      pending.cards.push(e.card);
    } else if (e.type === "TURN_STARTED" || e.type === "TURN_ENDED") {
      flush();
      revealer = null;
      if (panel && (panel.brief || (e.type === "TURN_STARTED" && e.player === panel.revealer))) panel = null;
    } else if (e.type === "CARD_SHUFFLED_INTO_DECK" && e.from === "HAND" && panel?.brief && e.player === panel.owner) {
      const cards = panel.cards.filter((c) => c !== e.card);
      panel = cards.length ? { ...panel, cards } : null;
    } else if (inherited && (e.type === "ACTION_SPENT" || e.type === "ATTACK_DECLARED")) {
      revealer = null;
    }
  }
  if (pending) {
    flush();
    revealer = null;
  }
  // Still waiting for the reveal only if a play was seen and nothing closed it.
  // …and never across batches for a look-at-hand marker (see `look`).
  return { panel, armed: look ? null : revealer };
}
