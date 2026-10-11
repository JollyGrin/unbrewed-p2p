/**
 * "How it went" (p2p #1398, feature/end-screen part 2 of 3): the damage facts
 * the post-game panel shows — dealt, taken, biggest hit, first blood, a
 * per-turn strip, first player, and the client-observed game clock. None of
 * this is on the wire as a number, so it is derived twice, from two sources
 * that must agree:
 *
 *   1. `reduceGameStats` folds each STATE's `events` during play. Instant on
 *      the first paint of the panel, but it only knows what this page saw —
 *      empty after a reload.
 *   2. `statsFromExpansion` reads the same numbers off a `POST /replay`
 *      expansion's steps, which carry every fighter's hp per step. Complete
 *      and reload-safe, but it only exists once the bundle has landed and the
 *      round trip has returned; the page swaps it in silently.
 *
 * The unit both routes agree on is HP LOST: a `DAMAGE_APPLIED.amount` is the
 * raw amount (engine/damage.ts clamps hp at 0 after emitting it), so the
 * reducer clamps each event against the hp it tracks for that fighter and the
 * expansion reads the per-step hp drop directly. "Dealt" by a seat is the hp
 * its opponents lost, "taken" the hp its own fighters lost — attribution is by
 * fighter OWNER, because the event does not name a dealer. Exhaustion damage
 * (your own empty deck) therefore reads as damage the opponent dealt; that is
 * the price of the two routes matching, and it is rare.
 *
 * Edge cases the routes may disagree on, all rare and all accepted: an hp
 * floor ("cannot be reduced below N") that the reducer only learns after the
 * batch, a `defeat` op (hp → 0 with no DAMAGE_APPLIED) that only the
 * expansion sees, and two hits on one fighter inside one action, which the
 * reducer counts as two hits and the expansion as one.
 */
import type { Action, FighterId, GameEvent, PlayerId, PlayerView, ReplayBundle, ReplayExpansion } from "./protocol";

/** A single hit: how much, and on which turn. */
export interface Hit {
  amount: number;
  turn: number;
}

export interface GameStats {
  /** Hp lost by each owner's fighters, per turn: `turns[t - 1][owner]`. Absent owner = 0. */
  turns: Array<Partial<Record<PlayerId, number>>>;
  /** The biggest single hit each owner's fighters TOOK. */
  biggestHitOn: Partial<Record<PlayerId, Hit>>;
  /** The first hp lost in the game — whose fighter bled, and when. Null while nobody has. */
  firstBlood: { victim: PlayerId; turn: number } | null;
  /** Who took turn 1 — the expansion's `steps[0].activePlayer` or the first TURN_STARTED. */
  firstPlayer: PlayerId | null;
}

export const EMPTY_GAME_STATS: GameStats = { turns: [], biggestHitOn: {}, firstBlood: null, firstPlayer: null };

/** Fold one hit into the stats, in place. `turn` below 1 lands on turn 1 (setup damage is impossible, but never drop a number). */
const recordHit = (stats: GameStats, victim: PlayerId, amount: number, turn: number) => {
  if (amount <= 0) return;
  const t = Math.max(1, turn);
  while (stats.turns.length < t) stats.turns.push({});
  const row = stats.turns[t - 1];
  row[victim] = (row[victim] ?? 0) + amount;
  const best = stats.biggestHitOn[victim];
  if (!best || amount > best.amount) stats.biggestHitOn[victim] = { amount, turn: t };
  if (!stats.firstBlood) stats.firstBlood = { victim, turn: t };
};

const cloneStats = (s: GameStats): GameStats => ({
  turns: s.turns.map((row) => ({ ...row })),
  biggestHitOn: { ...s.biggestHitOn },
  firstBlood: s.firstBlood,
  firstPlayer: s.firstPlayer,
});

// ---------------------------------------------------------------------------
// Route 1: the live event reducer
// ---------------------------------------------------------------------------

/** Page state for the live route: the stats plus what the reducer tracks between STATEs. */
export interface GameStatsAccumulator {
  stats: GameStats;
  /** True once a STATE that CARRIED events was folded — the join/reconnect STATE has none, so a reload leaves this false. */
  observed: boolean;
  /** The turn the last STATE's view was on; where damage lands when a batch carries no TURN_STARTED. */
  turn: number;
  /** Each fighter's hp after the last STATE, to clamp a raw `amount` to the hp actually lost. */
  hp: Record<FighterId, number>;
  owners: Record<FighterId, PlayerId>;
}

export const EMPTY_GAME_STATS_ACCUMULATOR: GameStatsAccumulator = {
  stats: EMPTY_GAME_STATS,
  observed: false,
  turn: 0,
  hp: {},
  owners: {},
};

/**
 * Fold one STATE (its events, then its view) into the accumulator. Pure: returns
 * a new accumulator, the input untouched. A STATE with no events still resyncs
 * the tracked hp, owners and turn from the view.
 */
export function reduceGameStats(
  acc: GameStatsAccumulator,
  events: readonly GameEvent[],
  view: Pick<PlayerView, "fighters" | "turnNumber">,
): GameStatsAccumulator {
  const stats = cloneStats(acc.stats);
  const hp = { ...acc.hp };
  // Damage before the batch's first TURN_STARTED belongs to the turn the
  // previous view was on; the view's own turn is the fallback when this is
  // the first STATE the page folded (reload).
  let turn = acc.turn > 0 ? acc.turn : view.turnNumber;
  const ownerOf = (id: FighterId): PlayerId | undefined =>
    acc.owners[id] ?? view.fighters.find((f) => f.id === id)?.owner;

  for (const e of events) {
    if (e.type === "TURN_STARTED") {
      turn = e.turnNumber;
      if (e.turnNumber === 1 && !stats.firstPlayer) stats.firstPlayer = e.player;
      continue;
    }
    if (e.type !== "DAMAGE_APPLIED") continue;
    const victim = ownerOf(e.fighter);
    if (!victim) continue;
    const before = hp[e.fighter];
    const lost = before === undefined ? e.amount : Math.min(e.amount, Math.max(0, before));
    if (before !== undefined) hp[e.fighter] = Math.max(0, before - lost);
    recordHit(stats, victim, lost, turn);
  }

  const owners: Record<FighterId, PlayerId> = {};
  const hpAfter: Record<FighterId, number> = {};
  for (const f of view.fighters) {
    owners[f.id] = f.owner;
    hpAfter[f.id] = f.hp;
  }
  return {
    stats,
    observed: acc.observed || events.length > 0,
    turn: view.turnNumber > 0 ? view.turnNumber : turn,
    hp: hpAfter,
    owners,
  };
}

// ---------------------------------------------------------------------------
// Route 2: the replay expansion
// ---------------------------------------------------------------------------

/**
 * The same stats read off a `POST /replay` expansion: every per-step hp drop is
 * a hit on that fighter's owner, on the step's turn. Null when the expansion
 * cannot vouch for the whole game — no steps, or a `diverged` re-simulation
 * whose steps stop early — so the caller keeps whatever it already has.
 */
export function statsFromExpansion(expansion: Pick<ReplayExpansion, "steps" | "verification">): GameStats | null {
  const { steps } = expansion;
  if (!steps.length || expansion.verification === "diverged") return null;
  const stats = cloneStats(EMPTY_GAME_STATS);
  stats.firstPlayer = steps[0].activePlayer ?? null;
  for (let k = 1; k < steps.length; k++) {
    const prev = new Map(steps[k - 1].fighters.map((f) => [f.id, f.hp] as const));
    for (const f of steps[k].fighters) {
      const before = prev.get(f.id);
      if (before === undefined) continue;
      const lost = before - f.hp;
      if (lost > 0) recordHit(stats, f.owner, lost, steps[k].turnNumber);
    }
  }
  return stats;
}

/** The seat behind the bundle's first logged action — the last-resort first-player guess. */
export const firstActorOf = (bundle: Pick<ReplayBundle, "actionLog"> | null): PlayerId | null => {
  const first = bundle?.actionLog[0] as (Action & { player?: PlayerId }) | undefined;
  return first?.player ?? null;
};

// ---------------------------------------------------------------------------
// Per-seat read-out
// ---------------------------------------------------------------------------

export interface TurnDamage {
  turn: number;
  dealt: number;
  taken: number;
}

export interface SideSummary {
  dealt: number;
  taken: number;
  /** The biggest single hit this seat landed on anyone. */
  biggestHit: Hit | null;
  /** Who drew first blood: `dealtBy` is the one opponent when the victim is `you` (2-player), `you` when it was the opponent; null in a bigger lobby. */
  firstBlood: { dealtBy: PlayerId | null; turn: number } | null;
  /** One entry per turn 1..N, N = at least `turns` (pads with zeros). */
  perTurn: TurnDamage[];
}

/** The stats as one seat reads them. `players` is the room's seat list (the view's players' ids). */
export function sideSummary(stats: GameStats, you: PlayerId, players: readonly PlayerId[], turns = 0): SideSummary {
  const others = players.filter((p) => p !== you);
  const n = Math.max(turns, stats.turns.length);
  const perTurn: TurnDamage[] = [];
  let dealt = 0;
  let taken = 0;
  for (let t = 1; t <= n; t++) {
    const row = stats.turns[t - 1] ?? {};
    let d = 0;
    for (const [owner, lost] of Object.entries(row)) if (owner !== you) d += lost ?? 0;
    const k = row[you] ?? 0;
    dealt += d;
    taken += k;
    perTurn.push({ turn: t, dealt: d, taken: k });
  }
  let biggestHit: Hit | null = null;
  for (const [owner, hit] of Object.entries(stats.biggestHitOn)) {
    if (owner === you || !hit) continue;
    if (!biggestHit || hit.amount > biggestHit.amount) biggestHit = hit;
  }
  let firstBlood: SideSummary["firstBlood"] = null;
  if (stats.firstBlood) {
    const { victim, turn } = stats.firstBlood;
    const dealtBy = victim === you ? (others.length === 1 ? others[0] : null) : players.length === 2 ? you : null;
    firstBlood = { dealtBy, turn };
  }
  return { dealt, taken, biggestHit, firstBlood, perTurn };
}

// ---------------------------------------------------------------------------
// The client-observed clock
// ---------------------------------------------------------------------------

/**
 * When this browser first saw a STATE for the room. CLIENT-OBSERVED, not the
 * engine's game duration: it starts when the page got its first view (a
 * creator waits here for the opponent to join) and a reload resumes the same
 * stamp from sessionStorage. Never persisted across tabs on purpose.
 */
const CLOCK_KEY = (roomId: string) => `pro:clock-start:${roomId}`;

/** The stored start for a room, else stamp `now` and return it. Storage failures fall back to `now`. */
export function readOrMarkClockStart(roomId: string, now: number = Date.now()): number {
  try {
    const raw = window.sessionStorage.getItem(CLOCK_KEY(roomId));
    const stored = raw ? Number(raw) : NaN;
    if (Number.isFinite(stored) && stored > 0) return stored;
    window.sessionStorage.setItem(CLOCK_KEY(roomId), String(now));
  } catch {
    /* private mode / storage disabled: an unpersisted clock still runs */
  }
  return now;
}

/** `mm:ss`, minutes unbounded (75:04 for an hour and a quarter); negative or NaN clamp to 00:00. */
export function formatClock(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
