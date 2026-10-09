/**
 * Adventure "<object> destroyed — <enemy> is loose" moment (issue #1158).
 *
 * A breakout reaches the client as one batch carrying THREAT_OVERFLOW → SPACE_OPENED →
 * ENEMY_SPAWNED (engine #590 / #689 / #651). `breakoutInBatch` is the pure "which chain is in
 * this batch" question; the interstitial renders whatever it returns. PRESENTATION ONLY.
 *
 * A SPACE_OPENED or ENEMY_SPAWNED with no THREAT_OVERFLOW before it (an effect that opens a
 * fence or spawns an enemy on its own) is NOT a breakout and returns null, as does an overflow
 * that opened nothing.
 */
import { scenarioObjectNumbers } from "./scenarioObjects";
import type { GameEvent, PlayerView, ScenarioDisplay, SpaceId, ViewFighter } from "./protocol";

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
  /** printed scenario-object number, null when the map declares none */
  objectNumber: number | null;
  space: SpaceId;
  /** marker lying on the opened space, when one is readable */
  marker: string | null;
  enemy: { name: string; hp: number; maxHp: number; size: ViewFighter["size"]; move: number | null; joinsDeck: boolean } | null;
  /** breakouts so far (engine `scenario.breakouts`) */
  lost: number;
  /** the breakout that loses the game (engine `display.lossLimit`), null when the scenario has none */
  total: number | null;
  /** what moved the threat track this batch, null when unknown */
  pushedBy: string | null;
  /** the scenario's display copy (setting, enemy noun), null when it authors none */
  display: ScenarioDisplay | null;
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
  const display = next.scenario.display ?? null;
  const total = display?.lossLimit ?? null;
  // the game-losing breakout ends the game (the end screen takes over): no interstitial
  if (total != null && chain.overflows >= total) return null;
  const f = chain.spawn ? next.fighters.find((x) => x.id === chain.spawn!.fighter) : undefined;
  const marker = next.tokens.find((t) => t.space === chain.space && t.kind === "marker" && t.identity)?.identity ?? null;
  return {
    objectNumber: scenarioObjectNumbers(next.map, display)[chain.space] ?? null,
    space: chain.space,
    marker,
    enemy: f ? enemyOf(f, chain.spawn!.card) : null,
    lost: next.scenario.breakouts ?? chain.overflows,
    total,
    pushedBy: pushedOverBy(prev, next),
    display,
  };
};

const enemyOf = (f: ViewFighter, card: string | null): NonNullable<BreakoutMoment["enemy"]> => ({
  name: f.name,
  hp: f.hp,
  maxHp: f.maxHp,
  size: f.size,
  move: f.enemy?.move ?? null,
  joinsDeck: card != null,
});

/**
 * The released enemy lands in a LATER batch than the overflow (a human places its token, engine
 * #651/#741): fill an enemy-less moment from a bare ENEMY_SPAWNED. Null when this batch has none
 * or the moment already names its enemy.
 */
export const withLateSpawn = (
  moment: BreakoutMoment,
  events: readonly GameEvent[],
  next: PlayerView
): BreakoutMoment | null => {
  if (moment.enemy) return null;
  const spawned = events.find((e): e is Extract<GameEvent, { type: "ENEMY_SPAWNED" }> => e.type === "ENEMY_SPAWNED");
  const f = spawned && next.fighters.find((x) => x.id === spawned.fighter);
  return spawned && f ? { ...moment, enemy: enemyOf(f, spawned.card) } : null;
};
