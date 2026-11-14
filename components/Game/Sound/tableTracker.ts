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
  /** The seat's applied "New game" count (`resetEpoch` on its blob). */
  epoch?: number;
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
): { cues: Cue[]; moved: { id: string; card: boolean }[]; replaced: boolean } => {
  let cards = 0;
  let pieces = 0;
  let flipped = false;
  let counted = 0;
  const moved: { id: string; card: boolean }[] = [];
  next.forEach((t, id) => {
    const before = prev.get(id);
    if (!before) {
      if (t.card) cards++;
      else pieces++;
      return;
    }
    if (before.face !== t.face) flipped = true;
    else if (before.x !== t.x || before.y !== t.y)
      moved.push({ id, card: t.card });
    if (
      before.counter !== undefined &&
      t.counter !== undefined &&
      before.counter !== t.counter
    ) {
      counted = t.counter - before.counter;
    }
  });
  let piecesGone = 0;
  let kept = 0;
  prev.forEach((t, id) => {
    if (next.has(id)) kept++;
    // A card leaving the table is heard where it lands (hand, discard, deck).
    else if (!t.card) piecesGone++;
  });

  const cues: Cue[] = [];
  if (flipped) cues.push({ sound: "flip" });
  else if (cards > 0) cues.push({ sound: "place", count: cards });
  // A whole loadout arriving at once is one set-down, not a drum roll.
  else if (pieces > 0) cues.push({ sound: "tokenDown", count: pieces > 3 ? 1 : pieces });
  else if (piecesGone > 0) cues.push({ sound: "tokenUp" });
  else if (counted !== 0) cues.push({ sound: "hp", pitch: counted < 0 ? 0.94 : 1.06 });
  // Nothing that was on the board is on it now: a wipe, a re-seed, or the
  // first pieces on an empty board.
  return {
    cues,
    moved,
    replaced: kept === 0 && prev.size + next.size > 0,
  };
};

type Roll = { id: string; by?: unknown; values?: unknown };

export type TableTrackerDeps = {
  play: (sound: SoundEvent, opts?: PlayOptions) => void;
  /** Whether other players' actions should be heard (the user's setting). */
  hearOthers: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  now?: () => number;
};

/** Another player's dragged piece sounds once it has stopped for this long. */
export const SETTLE_MS = 350;
/**
 * A piece that moves again this soon after it landed is the same drag going
 * on after a pause, not a new one: it does not land aloud a second time.
 * Positions are all the wire carries, so a pause and a release look alike;
 * the price is that a real second drag of the same piece this quickly is
 * silent.
 */
export const SAME_DRAG_MS = 1500;
/**
 * How long after a seat's "New game" its board's re-seed is still expected:
 * the wipe and the new pieces arrive as their own updates, a moment after
 * the pool. Only an update that replaces the whole board is swallowed, and
 * only until the new pieces are there; anything else the seat does in this
 * time is heard as usual.
 */
export const RESET_QUIET_MS = 2000;

type PoolChange = { cues: Cue[]; reset?: number };
type TokenChange = {
  cues: Cue[];
  moved: { id: string; card: boolean }[];
  replaced: boolean;
  /** pieces on the board after the change */
  count: number;
};

export const createTableTracker = ({
  play,
  hearOthers,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now = () => Date.now(),
}: TableTrackerDeps) => {
  const pools = new Map<string, PoolSummary | undefined>();
  const tokens = new Map<string, TokensSummary | undefined>();
  /** Per seat: the piece being dragged, waiting to come to rest. */
  const settling = new Map<
    string,
    { handle: unknown; id: string; resumed: boolean }
  >();
  /** Per seat: the piece that last landed, and when. */
  const landed = new Map<string, { id: string; at: number }>();
  /** Per seat: its board's re-seed (a new game) is expected until this time. */
  const resetUntil = new Map<string, number>();
  /** The newest "New game" already heard: one sound per reset, not per seat. */
  let heardEpoch = 0;
  const heardRolls = new Set<string>();
  let quiet = false;

  /** Plays the cues; false when they were another player's and those are off. */
  const emit = (cues: Cue[], remote: boolean): boolean => {
    if (remote && !hearOthers()) return false;
    for (const { sound, ...opts } of cues) {
      play(sound, remote ? { ...opts, gain: REMOTE_GAIN } : opts);
    }
    return true;
  };

  const cancelSettle = (seat: string) => {
    clearTimer(settling.get(seat)?.handle);
    settling.delete(seat);
  };
  const cancelAllSettles = () => {
    settling.forEach((s) => clearTimer(s.handle));
    settling.clear();
  };

  /**
   * Walk every seat, remember what it looks like now, and return what
   * changed for seats that were already known. A seat seen for the first
   * time (you just joined, they just joined, the first deal) only sets the
   * baseline.
   */
  const scan = <S, C>(
    seen: Map<string, S | undefined>,
    entries: Record<string, unknown> | undefined,
    summarize: (raw: unknown) => S | undefined,
    diff: (prev: S, next: S) => C | undefined,
  ): { seat: string; change: C }[] => {
    const names = Object.keys(entries ?? {});
    const changes: { seat: string; change: C }[] = [];
    for (const seat of names) {
      const next = summarize(entries?.[seat]);
      const prev = seen.get(seat);
      seen.set(seat, next);
      if (!prev || !next) continue;
      const change = diff(prev, next);
      if (change) changes.push({ seat, change });
    }
    Array.from(seen.keys()).forEach((seat) => {
      if (!names.includes(seat)) seen.delete(seat);
    });
    return changes;
  };

  /**
   * Play what changed. Several other seats changing in one update is a state
   * snapshot (a reconnect, a room reset), not several people acting in the
   * same instant: stay silent for them rather than play a burst. Returns
   * whether the update was such a snapshot.
   */
  const voice = (
    changes: { seat: string; change: { cues: Cue[] } }[],
    self: string | undefined,
  ): boolean => {
    const remote = changes.filter((c) => c.seat !== self);
    const snapshot =
      remote.length >= 2 && remote.some((c) => c.change.cues.length > 0);
    if (!snapshot) remote.forEach((c) => emit(c.change.cues, true));
    changes
      .filter((c) => c.seat === self)
      .forEach((c) => emit(c.change.cues, false));
    return snapshot;
  };

  /** Another player's piece moved: it lands once it has stopped. */
  const armSettle = (seat: string, piece: { id: string; card: boolean }) => {
    const pending = settling.get(seat);
    const last = landed.get(seat);
    const resumed =
      pending?.id === piece.id
        ? pending.resumed
        : last?.id === piece.id && now() - last.at < SAME_DRAG_MS;
    clearTimer(pending?.handle);
    const handle = setTimer(() => {
      settling.delete(seat);
      landed.set(seat, { id: piece.id, at: now() });
      if (!resumed && !quiet)
        emit([{ sound: piece.card ? "place" : "tokenDown" }], true);
    }, SETTLE_MS);
    settling.set(seat, { handle, id: piece.id, resumed });
  };

  return {
    /**
     * While quiet, updates only move the baseline. Set while the connection
     * is down and for a moment after it returns, so whatever happened in
     * between arrives silently.
     */
    setQuiet(value: boolean) {
      quiet = value;
      // a drag seen before the gap must not land after it
      if (value) cancelAllSettles();
    },

    /** `players` of the game state: seat name → `{ pool }`. */
    onPlayers(players: Record<string, unknown> | undefined, self?: string) {
      const changes = scan<PoolSummary, PoolChange>(
        pools,
        players,
        (raw) => {
          const player = raw as { pool?: unknown; resetEpoch?: unknown } | undefined;
          const summary = summarizePool(player?.pool);
          return summary && { ...summary, epoch: num(player?.resetEpoch) };
        },
        (prev, next) => {
          // A new game: the re-deal is not a shuffle and a hand of draws.
          if ((next.epoch ?? 0) > (prev.epoch ?? 0))
            return { cues: [], reset: next.epoch };
          const cues = diffPool(prev, next);
          return cues.length ? { cues } : undefined;
        },
      );
      const resets = changes
        .filter((c) => c.change.reset !== undefined)
        // my own seat first: a reset I started is mine to hear, at full level
        .sort((a, b) => Number(b.seat === self) - Number(a.seat === self));
      if (quiet) {
        resets.forEach((c) => {
          heardEpoch = Math.max(heardEpoch, c.change.reset!);
        });
        return;
      }
      // Each seat re-seeds in its own update, so a room of four would
      // trickle shuffles and set-downs: the whole reset is one shuffle.
      // Whoever shows it first voices it: me at full level when I started
      // it, another player quietly when they did. With "Other players" off
      // theirs is not played, and the one shuffle is my own deck being
      // re-dealt when my seat follows.
      resets.forEach(({ seat, change }) => {
        const epoch = change.reset!;
        resetUntil.set(seat, now() + RESET_QUIET_MS);
        cancelSettle(seat);
        if (epoch <= heardEpoch) return;
        if (emit([{ sound: "shuffle" }], seat !== self)) heardEpoch = epoch;
      });
      voice(
        changes.filter((c) => c.change.reset === undefined),
        self,
      );
    },

    /** The positions state: seat name → `{ tokens }`. */
    onPositions(blobs: Record<string, unknown> | undefined, self?: string) {
      const changes = scan<TokensSummary, TokenChange>(
        tokens,
        blobs,
        summarizeTokens,
        (prev, next) => {
          const change = diffTokens(prev, next);
          return change.cues.length || change.moved.length || change.replaced
            ? { ...change, count: next.size }
            : undefined;
        },
      );
      if (quiet) return;
      // A seat that just started a new game: the update that replaces its
      // whole board is the re-seed, not something the player did. Once the
      // new pieces are there the seat is live again.
      const live = changes.filter(({ seat, change }) => {
        const until = resetUntil.get(seat);
        if (until === undefined) return true;
        if (now() >= until) {
          resetUntil.delete(seat);
          return true;
        }
        if (!change.replaced) return true;
        if (change.count > 0) resetUntil.delete(seat);
        return false;
      }).filter((c) => c.change.cues.length || c.change.moved.length);
      if (voice(live, self)) {
        // nobody dragged anything in a snapshot: nothing is left to land
        cancelAllSettles();
        return;
      }
      // Your own drags are voiced by the board itself (lift and landing);
      // another player's are heard once, when the piece comes to rest.
      live.forEach(({ seat, change }) => {
        if (seat !== self && change.moved.length && !change.cues.length)
          armSettle(seat, change.moved[0]);
      });
    },

    /**
     * The newest dice roll, heard once per roll id. Someone else's roll
     * (`roll.by` is not `self`) is another player's action like any other:
     * quieter, and silent with "Other players" off.
     */
    onRoll(roll: Roll | undefined, self?: string) {
      if (!roll?.id || heardRolls.has(roll.id)) return;
      heardRolls.add(roll.id);
      if (quiet) return;
      const remote =
        self !== undefined && typeof roll.by === "string" && roll.by !== self;
      const dice = len(roll.values);
      emit([{ sound: dice > 1 ? "dice" : "die" }], remote);
      // A handful of dice is a thicker clatter than a pair.
      if (dice > 2 && (!remote || hearOthers())) {
        play("die", { gain: 0.6 * (remote ? REMOTE_GAIN : 1) });
      }
    },

    dispose() {
      cancelAllSettles();
    },
  };
};

export type TableTracker = ReturnType<typeof createTableTracker>;
