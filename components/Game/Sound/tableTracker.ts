import type { PlayOptions, SoundEvent } from "@/lib/sound";
import { REMOTE_GAIN } from "@/lib/sound";

/**
 * Turns table state into sound cues by watching what changed, the way you
 * would hear a real table: a card arrived in a hand, a pile grew, a piece
 * landed. Listening to the state (and not to the buttons) means every way of
 * doing a thing sounds the same (fan, pile menu, command palette, a keyboard
 * shortcut added later) and other players' actions can be heard too.
 *
 * Pure: no React, no audio. `createTableTracker` gets a `play` function.
 */

export type Cue = { sound: SoundEvent; count?: number; pitch?: number };

type PoolSummary = {
  hand: number;
  deck: number;
  discard: number;
  /** Deck order, bottom first. */
  order: string[];
  /** Every health value and sidekick count on the plate, in a fixed order. */
  hp: number[];
};

type TokenSummary = {
  card: boolean;
  /** Which face is up: changes on a card flip or a two-faced piece flip. */
  face: string;
  x: number;
  y: number;
  counter?: number;
};

type TokensSummary = Map<string, TokenSummary>;

const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
const num = (v: unknown): number => (typeof v === "number" ? v : 0);

type LoosePawn = { hp?: unknown; quantity?: unknown } | null | undefined;
type LoosePool = {
  hand?: unknown;
  deck?: unknown;
  discard?: unknown;
  hero?: LoosePawn;
  sidekick?: LoosePawn;
  extraCharacters?: unknown;
};

export const summarizePool = (raw: unknown): PoolSummary | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const pool = raw as LoosePool;
  const extras = Array.isArray(pool.extraCharacters)
    ? (pool.extraCharacters as { hero?: LoosePawn }[])
    : [];
  return {
    hand: len(pool.hand),
    deck: len(pool.deck),
    discard: len(pool.discard),
    order: Array.isArray(pool.deck)
      ? (pool.deck as { title?: unknown }[]).map((c) => String(c?.title ?? ""))
      : [],
    hp: [
      num(pool.hero?.hp),
      num(pool.sidekick?.hp),
      num(pool.sidekick?.quantity),
      ...extras.map((c) => num(c?.hero?.hp)),
    ],
  };
};

export const summarizeTokens = (raw: unknown): TokensSummary | undefined => {
  const tokens = (raw as { tokens?: unknown } | undefined)?.tokens;
  if (!Array.isArray(tokens)) return undefined;
  const out: TokensSummary = new Map();
  for (const t of tokens) {
    if (!t || typeof t.id !== "string") continue;
    out.set(t.id, {
      card: !!t.card,
      face: `${t.faceDown ? "down" : "up"}/${t.flipped ? "b" : "a"}`,
      x: num(t.x),
      y: num(t.y),
      counter:
        t.counter && !t.counter.link && typeof t.counter.value === "number"
          ? t.counter.value
          : undefined,
    });
  }
  return out;
};

/** How many deck slots sit between the first and the last one that moved. */
const reorderedSpan = (a: string[], b: string[]): number => {
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  let end = a.length - 1;
  while (end > start && a[end] === b[end]) end--;
  return start >= a.length ? 0 : end - start + 1;
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * What one seat's pile changes sound like. One kind of sound per change,
 * picked by where the cards went:
 * the deck was reordered or refilled → shuffle; the discard grew → discard;
 * the hand grew → draw; one card went onto the deck → place.
 */
export const diffPool = (prev: PoolSummary, next: PoolSummary): Cue[] => {
  const dHand = next.hand - prev.hand;
  const dDeck = next.deck - prev.deck;
  const dDiscard = next.discard - prev.discard;

  if (dDeck >= 2) return [{ sound: "shuffle" }];
  if (dDeck === 0 && next.deck > 1) {
    const span = reorderedSpan(prev.order, next.order);
    // A real shuffle moves cards all over the deck; a peek-and-reorder (scry)
    // only shifts a few on top, which is a card being slid, not a riffle.
    if (span >= Math.min(next.deck, 5)) return [{ sound: "shuffle" }];
    if (span > 0 && dHand === 0 && dDiscard === 0) return [{ sound: "draw" }];
  }
  if (dDiscard > 0) return [{ sound: "discard", count: dDiscard }];
  if (dHand > 0) return [{ sound: "draw", count: dHand }];
  if (dDeck === 1) return [{ sound: "place" }];

  const dHp = sum(next.hp) - sum(prev.hp);
  if (dHp !== 0 || next.hp.some((v, i) => v !== prev.hp[i])) {
    // Damage ticks a little lower than healing.
    return [{ sound: "hp", pitch: dHp < 0 ? 0.94 : 1.06 }];
  }
  return [];
};

/** Tokens that only changed position, plus the cue for everything else. */
export const diffTokens = (
  prev: TokensSummary,
  next: TokensSummary,
): { cues: Cue[]; moved: { card: boolean }[] } => {
  let cards = 0;
  let pieces = 0;
  let flipped = false;
  let counted = 0;
  const moved: { card: boolean }[] = [];
  next.forEach((t, id) => {
    const before = prev.get(id);
    if (!before) {
      if (t.card) cards++;
      else pieces++;
      return;
    }
    if (before.face !== t.face) flipped = true;
    else if (before.x !== t.x || before.y !== t.y) moved.push({ card: t.card });
    if (
      before.counter !== undefined &&
      t.counter !== undefined &&
      before.counter !== t.counter
    ) {
      counted = t.counter - before.counter;
    }
  });
  let piecesGone = 0;
  prev.forEach((t, id) => {
    // A card leaving the table is heard where it lands (hand, discard, deck).
    if (!next.has(id) && !t.card) piecesGone++;
  });

  const cues: Cue[] = [];
  if (flipped) cues.push({ sound: "flip" });
  else if (cards > 0) cues.push({ sound: "place", count: cards });
  // A whole loadout arriving at once is one set-down, not a drum roll.
  else if (pieces > 0) cues.push({ sound: "tokenDown", count: pieces > 3 ? 1 : pieces });
  else if (piecesGone > 0) cues.push({ sound: "tokenUp" });
  else if (counted !== 0) cues.push({ sound: "hp", pitch: counted < 0 ? 0.94 : 1.06 });
  return { cues, moved };
};

type Roll = { id: string; values?: unknown };

export type TableTrackerDeps = {
  play: (sound: SoundEvent, opts?: PlayOptions) => void;
  /** Whether other players' actions should be heard (the user's setting). */
  hearOthers: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/** Another player's dragged piece sounds once it has stopped for this long. */
export const SETTLE_MS = 350;

export const createTableTracker = ({
  play,
  hearOthers,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}: TableTrackerDeps) => {
  const pools = new Map<string, PoolSummary | undefined>();
  const tokens = new Map<string, TokensSummary | undefined>();
  const settling = new Map<string, unknown>();
  const heardRolls = new Set<string>();
  let quiet = false;

  const emit = (cues: Cue[], remote: boolean) => {
    if (remote && !hearOthers()) return;
    for (const { sound, ...opts } of cues) {
      play(sound, remote ? { ...opts, gain: REMOTE_GAIN } : opts);
    }
  };

  /**
   * Walk every seat, remember what it looks like now, and collect the cues
   * for seats that were already known. A seat seen for the first time (you
   * just joined, they just joined, the first deal) only sets the baseline.
   */
  const scan = <S,>(
    seen: Map<string, S | undefined>,
    entries: Record<string, unknown> | undefined,
    summarize: (raw: unknown) => S | undefined,
    diff: (prev: S, next: S, seat: string) => Cue[],
    self: string | undefined,
  ) => {
    const names = Object.keys(entries ?? {});
    const changes: { seat: string; cues: Cue[] }[] = [];
    for (const seat of names) {
      const next = summarize(entries?.[seat]);
      const prev = seen.get(seat);
      seen.set(seat, next);
      if (!prev || !next) continue;
      const cues = diff(prev, next, seat);
      if (cues.length) changes.push({ seat, cues });
    }
    Array.from(seen.keys()).forEach((seat) => {
      if (!names.includes(seat)) seen.delete(seat);
    });
    if (quiet) return;
    // Several other seats changing in one update is a state snapshot (a
    // reconnect, a room reset), not several people acting in the same
    // instant: stay silent for them rather than play a burst.
    const remote = changes.filter((c) => c.seat !== self);
    if (remote.length < 2) remote.forEach((c) => emit(c.cues, true));
    changes
      .filter((c) => c.seat === self)
      .forEach((c) => emit(c.cues, false));
  };

  return {
    /**
     * While quiet, updates only move the baseline. Set while the connection
     * is down and for a moment after it returns, so whatever happened in
     * between arrives silently.
     */
    setQuiet(value: boolean) {
      quiet = value;
    },

    /** `players` of the game state: seat name → `{ pool }`. */
    onPlayers(players: Record<string, unknown> | undefined, self?: string) {
      scan(
        pools,
        players,
        (raw) => summarizePool((raw as { pool?: unknown } | undefined)?.pool),
        diffPool,
        self,
      );
    },

    /** The positions state: seat name → `{ tokens }`. */
    onPositions(blobs: Record<string, unknown> | undefined, self?: string) {
      scan(
        tokens,
        blobs,
        summarizeTokens,
        (prev, next, seat) => {
          const { cues, moved } = diffTokens(prev, next);
          // Your own drags are voiced by the board itself (lift and landing);
          // another player's are heard once, when the piece comes to rest.
          if (seat !== self && moved.length && !cues.length) {
            clearTimer(settling.get(seat));
            const card = moved[0].card;
            settling.set(
              seat,
              setTimer(() => {
                settling.delete(seat);
                if (!quiet) emit([{ sound: card ? "place" : "tokenDown" }], true);
              }, SETTLE_MS),
            );
          }
          return cues;
        },
        self,
      );
    },

    /** The newest dice roll (yours or anyone's): heard once per roll id. */
    onRoll(roll: Roll | undefined) {
      if (!roll?.id || heardRolls.has(roll.id)) return;
      heardRolls.add(roll.id);
      if (quiet) return;
      const dice = len(roll.values);
      play(dice > 1 ? "dice" : "die");
      // A handful of dice is a thicker clatter than a pair.
      if (dice > 2) play("die", { gain: 0.6 });
    },

    dispose() {
      settling.forEach((h) => clearTimer(h));
      settling.clear();
    },
  };
};

export type TableTracker = ReturnType<typeof createTableTracker>;
