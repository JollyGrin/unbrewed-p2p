/**
 * Slow mode (issue #703) — the pure pacing queue behind the action spotlight.
 *
 * A player watching a bot sees every opponent action snap the board in one frame:
 * the server's humanizing delay is 300–900ms and the client applies each `STATE`
 * broadcast the instant it lands. The battle-sequence epic (#379/#382) fixed that
 * for the combat reveal only — a maneuver, a scheme, a boost, a draw all still
 * flash past.
 *
 * So: an opt-in queue that holds an opponent's `STATE` batch until the player has
 * read it and clicked OK. Every `STATE` batch is exactly one action (see
 * `ProGameSnapshot.events`), so one batch = one spotlight = one OK.
 *
 * This module is the whole decision layer, deliberately pure so the safety valves
 * can be tested without a socket. The rules that matter:
 *
 *  - ORDERING IS SACRED. Snapshots are applied in arrival order, always. The queue
 *    never reorders, and every "flush" applies what is pending FIRST and the fresh
 *    batch last.
 *  - Anything that could need the player's input jumps the queue: a prompt aimed at
 *    them, their own action, a resume/join snapshot, a decided game. Those flush
 *    everything and apply immediately, so slow mode can never stall a decision or
 *    delay a defense prompt.
 *  - Slow mode OFF is not "a queue that drains fast" — the reducer returns the
 *    snapshot for immediate application and never touches its state, so an OFF
 *    session behaves exactly as it did before this file existed.
 */
import { CardInstanceId, GameEvent, PlayerId, PlayerView } from "./protocol";

/** The minimum a batch has to be for the queue to classify it — `ProGameSnapshot`
 *  satisfies this structurally, and the reducer stays generic over the rest so it
 *  never has to know about `legalActions`/`prompt` aliases. */
export interface SlowModeBatch {
  view: PlayerView;
  events: GameEvent[];
}

/**
 * How many opponent batches may wait behind the one on screen. A long bot turn
 * (attack → prompts → effects → end) can outrun a reading player; past the cap the
 * OLDEST batches are applied without their spotlight rather than growing an
 * unbounded backlog that leaves the board minutes behind the real game.
 */
export const SLOW_MODE_QUEUE_CAP = 10;

/**
 * Events that identify WHO acted. Deliberately narrow: a batch caused by an
 * opponent routinely carries events naming YOU (their scheme makes you discard,
 * their attack damages your fighter, their effect makes you draw), so only events
 * that report a decision its `player` made are actor-defining.
 *
 * `TURN_ENDED` before `TURN_STARTED` is why this is order-sensitive rather than a
 * priority table: the batch that ends your turn emits `TURN_ENDED{you}` and then
 * `TURN_STARTED{them}`, and the actor is the one who ended it.
 */
const ACTOR_EVENTS = new Set([
  "ACTION_SPENT",
  "PROMPT_RESOLVED",
  "SCHEME_PLAYED",
  "CARD_PLAYED_FROM_HAND",
  "ADDITIONAL_DEFENSE_PLAYED",
  "CARD_COMMITTED",
  "SECOND_ATTACK_COMMITTED",
  "ABILITY_BOOST_COMMITTED",
  "MOVE_BOOSTED",
  "ITEM_USED",
  "COMBAT_ITEM_ATTACHED",
  "BONUS_ATTACK_PASSED",
  "MULLIGAN_TAKEN",
  "HAND_KEPT",
  "TURN_ENDED",
  "TURN_END_FORCED",
  "TURN_STARTED",
]);

/**
 * The seat whose decision produced this batch, or null when nothing in it names an
 * actor (setup placement, a purely derived broadcast). First actor-defining event
 * wins — see ACTOR_EVENTS.
 */
export function batchActor(events: GameEvent[]): PlayerId | null {
  for (const e of events) {
    if (ACTOR_EVENTS.has(e.type) && "player" in e) return e.player as PlayerId;
  }
  return null;
}

/** Combat's own reveal (CombatPanel + the #517 linger) already narrates these, so
 *  the spotlight must not show a second copy of the cards. Exported for the
 *  overlay, which downgrades such a batch to text-only. */
export function isCombatRevealBatch(events: GameEvent[]): boolean {
  return events.some(
    (e) =>
      e.type === "ATTACK_DECLARED" ||
      e.type === "CARDS_REVEALED" ||
      e.type === "COMBAT_DAMAGE" ||
      e.type === "COMBAT_RESOLVED" ||
      e.type === "COMBAT_ENDED"
  );
}

/**
 * The card the spotlight leads with, or null for a card-less action (a plain
 * maneuver, an end of turn). Priority order is "what did they DO", not "what
 * moved": a scheme's own card beats the card it made someone discard.
 *
 * Redacted ids (the server masks a card in a zone you can't see — see
 * server/redact.ts) are skipped, so a hidden boost falls through to whatever
 * IS public rather than rendering an unresolvable face. Every real instance id
 * is `<hero>/<def>#<n>`, so the slash is the test.
 */
const CARD_EVENT_PRIORITY = [
  "SCHEME_PLAYED",
  "CARD_PLAYED_FROM_HAND",
  "ADDITIONAL_DEFENSE_PLAYED",
  "CARD_BOOSTED",
  "MOVE_BOOSTED",
  "CARD_REVEALED",
  "CARD_FOUND",
  "CARD_TUCKED",
  "CARD_RETURNED_TO_HAND",
  "CARD_DISCARDED",
] as const;

export function spotlightCard(events: GameEvent[]): CardInstanceId | null {
  for (const type of CARD_EVENT_PRIORITY) {
    for (const e of events) {
      if (e.type !== type) continue;
      const card = "card" in e ? (e.card as string) : null;
      if (card && card.includes("/")) return card as CardInstanceId;
    }
  }
  return null;
}

/**
 * Should this batch be PACED (held for an OK), or applied the moment it lands?
 *
 * Instant — and therefore flushing whatever is queued ahead of it — when:
 *  - it carries no events at all (join / reconnect / resume: not an action);
 *  - it opens a prompt aimed at YOU (defense, target choice, mulligan…) — a paced
 *    batch must never sit between the player and a decision they owe;
 *  - YOU caused it (`actor === view.you`, or the caller knows an action of theirs
 *    is in flight via `ownAction`);
 *  - the game is decided (`view.winner`) — nothing after that is worth holding.
 */
export function isPacedBatch(batch: SlowModeBatch, ownAction = false): boolean {
  if (ownAction) return false;
  if (batch.events.length === 0) return false;
  const view = batch.view;
  if (view.winner) return false;
  if (view.prompt && view.prompt.player === view.you) return false;
  const actor = batchActor(batch.events);
  if (actor !== null && actor === view.you) return false;
  return true;
}

export interface SlowModeState<T extends SlowModeBatch> {
  /** batches that have arrived but not been applied, in ARRIVAL order */
  queue: T[];
  /** true while an applied batch is on screen waiting for the player's OK */
  holding: boolean;
}

export function emptySlowModeState<T extends SlowModeBatch>(): SlowModeState<T> {
  return { queue: [], holding: false };
}

export type SlowModeEvent<T extends SlowModeBatch> =
  /** a STATE landed. `ownAction` = the client has one of its own actions in flight */
  | { type: "STATE"; batch: T; slowMode: boolean; ownAction?: boolean }
  /** the player clicked OK on the spotlight */
  | { type: "ADVANCE" }
  /** "Skip all" — drain everything now, in order */
  | { type: "SKIP_ALL" }
  /** the toggle was switched off mid-queue */
  | { type: "DISABLE" }
  /** leaving the game / socket teardown */
  | { type: "RESET" };

export interface SlowModeStep<T extends SlowModeBatch> {
  state: SlowModeState<T>;
  /** snapshots the caller must apply NOW, in this exact order (possibly empty) */
  apply: T[];
}

/** Drain everything pending, then whatever else the caller wants applied after it. */
const flush = <T extends SlowModeBatch>(
  state: SlowModeState<T>,
  ...trailing: T[]
): SlowModeStep<T> => ({
  state: { queue: [], holding: false },
  apply: [...state.queue, ...trailing],
});

/**
 * The queue's whole behaviour. Returns the next state plus the batches to apply
 * right now — the caller applies `apply` in order and nothing else.
 */
export function slowModeStep<T extends SlowModeBatch>(
  state: SlowModeState<T>,
  event: SlowModeEvent<T>
): SlowModeStep<T> {
  switch (event.type) {
    case "STATE": {
      // Slow mode off: the layer is inert. Note the flush — a batch that arrives
      // in the same tick the player switched the toggle off must still land
      // behind anything already queued, never in front of it.
      if (!event.slowMode) return flush(state, event.batch);
      if (!isPacedBatch(event.batch, event.ownAction)) return flush(state, event.batch);
      // Nothing on screen and nothing waiting → this batch becomes the spotlight.
      if (!state.holding && state.queue.length === 0)
        return { state: { queue: [], holding: true }, apply: [event.batch] };
      // Otherwise it waits its turn. Past the cap the oldest batches are applied
      // un-spotlit so the backlog can't grow without bound.
      const queue = [...state.queue, event.batch];
      if (queue.length <= SLOW_MODE_QUEUE_CAP)
        return { state: { ...state, queue }, apply: [] };
      const overflow = queue.splice(0, queue.length - SLOW_MODE_QUEUE_CAP);
      return { state: { ...state, queue }, apply: overflow };
    }
    case "ADVANCE": {
      if (state.queue.length === 0) return { state: { queue: [], holding: false }, apply: [] };
      const [next, ...rest] = state.queue;
      return { state: { queue: rest, holding: true }, apply: [next] };
    }
    case "SKIP_ALL":
    case "DISABLE":
      return flush(state);
    case "RESET":
      return { state: emptySlowModeState<T>(), apply: [] };
  }
}
