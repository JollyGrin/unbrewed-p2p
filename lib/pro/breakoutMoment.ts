/**
 * Adventure "enclosure destroyed — <dinosaur> is loose" moment (issue #1158).
 *
 * A breakout reaches the client as one batch carrying THREAT_OVERFLOW → SPACE_OPENED →
 * ENEMY_SPAWNED (engine #590 / #689 / #651). `breakoutInBatch` is the pure "which chain is in
 * this batch" question; the interstitial renders whatever it returns. PRESENTATION ONLY.
 *
 * A SPACE_OPENED or ENEMY_SPAWNED with no THREAT_OVERFLOW before it (an effect that opens a
 * fence or spawns an enemy on its own) is NOT a breakout and returns null, as does an overflow
 * that opened nothing.
 */
import { enclosureNumbers } from "./enclosures";
import type { GameEvent, PlayerView, SpaceId, ViewFighter } from "./protocol";

/** The 4th breakout ends the game (the end screen takes over), so it gets no interstitial. */
export const BREAKOUT_LIMIT = 4;

export interface BreakoutChain {
  /** 1-based count of overflows so far (THREAT_OVERFLOW.overflows) */
  overflows: number;
  space: SpaceId;
  spawn: { fighter: string; enemyId: string; card: string | null } | null;
}

export const breakoutInBatch = (events: readonly GameEvent[]): BreakoutChain | null => {
  const at = events.findIndex((e) => e.type === "THREAT_OVERFLOW");
  if (at < 0) return null;
  const overflow = events[at] as Extract<GameEvent, { type: "THREAT_OVERFLOW" }>;
  const rest = events.slice(at + 1);
  const opened = rest.find((e): e is Extract<GameEvent, { type: "SPACE_OPENED" }> => e.type === "SPACE_OPENED");
  if (!opened) return null;
  const spawned = rest.find((e): e is Extract<GameEvent, { type: "ENEMY_SPAWNED" }> => e.type === "ENEMY_SPAWNED");
  return {
    overflows: overflow.overflows,
    space: opened.space,
    spawn: spawned ? { fighter: spawned.fighter, enemyId: spawned.enemyId, card: spawned.card } : null,
  };
};

export interface BreakoutMoment {
  /** printed enclosure number, null when the map declares none */
  enclosure: number | null;
  space: SpaceId;
  /** marker lying on the opened space, when one is readable */
  marker: string | null;
  enemy: { name: string; hp: number; maxHp: number; size: ViewFighter["size"]; move: number | null; joinsDeck: boolean } | null;
  lost: number;
  total: number;
  /** what moved the threat track this batch, null when unknown */
  pushedBy: string | null;
}

/** `bySource` (#735) is not on the wire type yet — read it defensively. */
const bySource = (v: PlayerView | null): Record<string, number> | null => {
  const t = v?.scenario?.threat as { bySource?: Record<string, number> } | undefined;
  return t?.bySource ?? null;
};

/** The source whose threat contribution grew most between two views, or null. */
export const pushedOverBy = (prev: PlayerView | null, next: PlayerView): string | null => {
  const a = bySource(prev);
  const b = bySource(next);
  if (!b) return null;
  let best: string | null = null;
  let bestDelta = 0;
  for (const [k, n] of Object.entries(b)) {
    const d = n - (a?.[k] ?? 0);
    if (d > bestDelta) {
      best = k;
      bestDelta = d;
    }
  }
  return best;
};

/** Everything the interstitial prints, or null when this batch deserves none. */
export const breakoutMoment = (
  events: readonly GameEvent[],
  prev: PlayerView | null,
  next: PlayerView
): BreakoutMoment | null => {
  const chain = breakoutInBatch(events);
  if (!chain || !next.scenario || next.winner) return null;
  if (chain.overflows >= BREAKOUT_LIMIT) return null;
  const starts = next.map.spaces.filter((s) => s.startsBlocked).length;
  const lost = starts - (next.blockedSpaces?.length ?? 0);
  const f = chain.spawn ? next.fighters.find((x) => x.id === chain.spawn!.fighter) : undefined;
  const marker = next.tokens.find((t) => t.space === chain.space && t.kind === "marker" && t.identity)?.identity ?? null;
  return {
    enclosure: enclosureNumbers(next.map)[chain.space] ?? null,
    space: chain.space,
    marker,
    enemy: f
      ? { name: f.name, hp: f.hp, maxHp: f.maxHp, size: f.size, move: f.enemy?.move ?? null, joinsDeck: chain.spawn!.card != null }
      : null,
    lost,
    total: Math.max(starts, BREAKOUT_LIMIT),
    pushedBy: pushedOverBy(prev, next),
  };
};
