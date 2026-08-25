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

/**
 * Every DISTINCT, publicly-visible card the batch touched, most-important first.
 *
 * The spotlight leads with a large face for the first entry and shows the rest as
 * thumbnails, so an unfamiliar player can study what actually happened: the attack
 * card AND the defense AND the boosts that were discarded under them. Combat is
 * included on purpose (#703 follow-up) — by the time this panel is read, the
 * combat reveal has already flown past, and those are exactly the cards worth
 * studying.
 *
 * Ordering is "what did they DO" first: a scheme's own card beats the card it made
 * someone discard. Redacted ids (the server masks a card in a zone you cannot see —
 * see server/redact.ts) are skipped, so a face-down boost never renders as an
 * unresolvable blank. Every real instance id is `<hero>/<def>#<n>`, so the slash is
 * the test.
 */
const CARD_EVENT_PRIORITY = [
  "SCHEME_PLAYED",
  "CARD_PLAYED_FROM_HAND",
  "CARDS_REVEALED",
  "ADDITIONAL_DEFENSE_PLAYED",
  "CARD_BOOSTED",
  "MOVE_BOOSTED",
  "CARD_REVEALED",
  "CARD_FOUND",
  "CARD_TUCKED",
  "CARD_RETURNED_TO_HAND",
  "CARD_DISCARDED",
] as const;

/** Card-instance fields that appear across the event union. */
const CARD_FIELDS = ["card", "attackerCard", "defenderCard"] as const;

const isPublicCard = (v: unknown): v is CardInstanceId =>
  typeof v === "string" && v.includes("/");

const cardsOn = (e: GameEvent): CardInstanceId[] => {
  const out: CardInstanceId[] = [];
  for (const f of CARD_FIELDS) {
    const v = (e as unknown as Record<string, unknown>)[f];
    if (isPublicCard(v)) out.push(v);
  }
  return out;
};

/**
 * `extra` takes the `cards` arrays the batch's own log lines already carry, so a
 * card the feed names but the events do not (or names through a variant this list
 * hasn't learned) still gets a face.
 */
export function spotlightCards(
  events: GameEvent[],
  extra: readonly CardInstanceId[] = []
): CardInstanceId[] {
  const seen = new Set<CardInstanceId>();
  const push = (c: CardInstanceId) => {
    if (!seen.has(c)) seen.add(c);
  };
  for (const type of CARD_EVENT_PRIORITY)
    for (const e of events) if (e.type === type) cardsOn(e).forEach(push);
  for (const e of events) cardsOn(e).forEach(push); // anything the priority list missed
  for (const c of extra) if (isPublicCard(c)) push(c);
  return [...seen];
}

/** What the caller knows that the batch itself cannot say. */
export interface PaceContext {
  /** an action of ours is in flight — its result must never wait */
  ownAction?: boolean;
  /** this is the authoritative first view of a (re)connection: a join, a
   *  RECONNECT or a RESUME_ROOM. See the `resume` note in `isPacedBatch`. */
  resume?: boolean;
}

/**
 * Should this batch be PACED (held for an OK), or applied the moment it lands?
 *
 * Instant — and therefore flushing whatever is queued ahead of it — when:
 *  - it is a (re)connection's first view (`resume`): the server is re-sending the
 *    whole authoritative state, so anything queued is already superseded;
 *  - it opens a prompt aimed at YOU (defense, target choice, mulligan…) — a paced
 *    batch must never sit between the player and a decision they owe;
 *  - YOU caused it (`actor === view.you`, or `ownAction`);
 *  - the game is decided (`view.winner`) — nothing after that is worth holding.
 *
 * `resume` is the caller's flag, NOT "the batch has no events" (#703 follow-up).
 * Those used to be treated as the same thing, on the theory that only join/
 * reconnect/resume omit events. They are not — the engine emits events-less
 * broadcasts mid-turn (`applyUndo` clears `lastEvents` and rebroadcasts, and a
 * live bot turn shows others) — and under the old rule each one silently flushed
 * the queue and tore the spotlight off screen mid-read. Such a batch is now
 * SILENT instead: applied in arrival order, never flushing and never demanding an
 * OK of its own. See `isSilentBatch`.
 */
export function isPacedBatch(batch: SlowModeBatch, ctx: PaceContext = {}): boolean {
  if (ctx.ownAction || ctx.resume) return false;
  const view = batch.view;
  if (view.winner) return false;
  if (view.prompt && view.prompt.player === view.you) return false;
  const actor = batchActor(batch.events);
  if (actor !== null && actor === view.you) return false;
  return true;
}

/**
 * A batch with nothing to narrate. It still has to be APPLIED — it is an
 * authoritative view, and order is sacred — but it must never become a spotlight:
 * holding one would put a panel reading "nothing visible changed" in front of the
 * player and make them dismiss it.
 */
export function isSilentBatch(batch: SlowModeBatch): boolean {
  return batch.events.length === 0;
}

export interface SlowModeState<T extends SlowModeBatch> {
  /** batches that have arrived but not been applied, in ARRIVAL order */
  queue: T[];
  /**
   * The batch currently ON SCREEN, waiting for the player's OK — null when
   * nothing is held.
   *
   * This is the identity the spotlight renders from, and it is deliberately NOT
   * "the last snapshot applied" (#703 follow-up). A cap overflow applies OLD
   * batches to keep the board moving while the player reads; when the panel was
   * keyed off the newest snapshot, each of those repainted it with a different
   * action's text, which read exactly like the spotlight advancing itself. Only
   * ADVANCE and a flush may change what is held.
   */
  held: T | null;
}

export function emptySlowModeState<T extends SlowModeBatch>(): SlowModeState<T> {
  return { queue: [], held: null };
}

export type SlowModeEvent<T extends SlowModeBatch> =
  /** a STATE landed; `ctx` carries what only the socket knows (see PaceContext) */
  | ({ type: "STATE"; batch: T; slowMode: boolean } & PaceContext)
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
  state: { queue: [], held: null },
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
      const { ownAction, resume } = event;
      if (!isPacedBatch(event.batch, { ownAction, resume })) return flush(state, event.batch);
      // Nothing on screen and nothing waiting → apply now. It becomes the
      // spotlight unless there is nothing to say about it.
      if (state.held === null && state.queue.length === 0)
        return {
          state: { queue: [], held: isSilentBatch(event.batch) ? null : event.batch },
          apply: [event.batch],
        };
      // Otherwise it waits its turn. Past the cap the oldest batches are applied
      // un-spotlit so the backlog can't grow without bound — `held` is untouched,
      // so the description the player is still reading stays on screen.
      const queue = [...state.queue, event.batch];
      if (queue.length <= SLOW_MODE_QUEUE_CAP)
        return { state: { ...state, queue }, apply: [] };
      const overflow = queue.splice(0, queue.length - SLOW_MODE_QUEUE_CAP);
      return { state: { ...state, queue }, apply: overflow };
    }
    case "ADVANCE": {
      // Apply forward until something is worth showing. Silent batches are pulled
      // through with the OK the player already gave rather than costing one each.
      const queue = [...state.queue];
      const apply: T[] = [];
      let held: T | null = null;
      while (queue.length > 0) {
        const next = queue.shift()!;
        apply.push(next);
        if (!isSilentBatch(next)) {
          held = next;
          break;
        }
      }
      return { state: { queue, held }, apply };
    }
    case "SKIP_ALL":
    case "DISABLE":
      return flush(state);
    case "RESET":
      return { state: emptySlowModeState<T>(), apply: [] };
  }
}
