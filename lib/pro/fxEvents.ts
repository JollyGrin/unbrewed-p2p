/**
 * Feel-layer events for Pro games. Protocol v1 has no event stream, so — same
 * trick as gameLog.ts — semantic moments are derived by diffing consecutive
 * server views. Display-only: these events drive sounds and transient board
 * visuals and never feed anything back into play. Kept separate from the log
 * differ because the two care about different things (the log wants prose for
 * every change; this wants a handful of punchy beats with board coordinates).
 */
import { FighterId, GameEvent, PlayerId, PlayerView, SpaceId, ViewPlayer } from "./protocol";
import { isViewerOnWinningTeam } from "./teams";
import { sweptFighters } from "./sweep";

export type FxEvent =
  /** combat card(s) flipped face-up — count 2 means attack+defense revealed together */
  | { type: "reveal"; count: 1 | 2 }
  /** a face-down commit hit the table (own play confirmed, or opponent committed) */
  | { type: "commit" }
  | { type: "draw" }
  | { type: "damage"; fighter: FighterId; space: SpaceId | null; amount: number; mine: boolean; heroHit: boolean }
  | { type: "heal"; fighter: FighterId; space: SpaceId | null; amount: number; mine: boolean }
  /** combat resolved with zero damage dealt — the defense held */
  | { type: "blocked"; space: SpaceId | null }
  | { type: "defeated"; fighter: FighterId; space: SpaceId | null; mine: boolean }
  /** it just became your turn */
  | { type: "turn" }
  /** a cancel-effects card (Feint, …) snuffed an opponent's card text (#346) */
  | { type: "cancel" }
  | { type: "victory" }
  | { type: "loss" };

const playersById = (view: PlayerView): Map<PlayerId, ViewPlayer> => {
  const players = new Map(view.players.map((p) => [p.id, p]));
  players.set(view.self.id, {
    ...(players.get(view.self.id) ?? {}),
    id: view.self.id,
    heroId: view.self.heroId,
    you: true,
    hand: view.self.hand,
    handCount: view.self.hand.length,
    deckCount: view.self.deckCount,
    discard: view.self.discard,
    committedCard: view.self.committedCard,
    hasCommitted: !!view.self.committedCard,
    counters: view.self.counters,
    flags: view.self.flags,
    wonCombatThisTurn: view.self.wonCombatThisTurn,
    lostCombatThisTurn: view.self.lostCombatThisTurn,
    firstAttackThisTurn: view.self.firstAttackThisTurn,
    playedACardThisTurn: view.self.playedACardThisTurn,
    tookDamageThisTurn: view.self.tookDamageThisTurn,
  });
  if (view.opponent) {
    players.set(view.opponent.id, {
      ...(players.get(view.opponent.id) ?? {}),
      id: view.opponent.id,
      heroId: view.opponent.heroId,
      you: false,
      handCount: view.opponent.handCount,
      deckCount: view.opponent.deckCount,
      discard: view.opponent.discard,
      hasCommitted: view.opponent.hasCommitted,
      counters: view.opponent.counters,
      flags: view.opponent.flags,
      wonCombatThisTurn: view.opponent.wonCombatThisTurn,
      lostCombatThisTurn: view.opponent.lostCombatThisTurn,
      firstAttackThisTurn: view.opponent.firstAttackThisTurn,
      playedACardThisTurn: view.opponent.playedACardThisTurn,
      tookDamageThisTurn: view.opponent.tookDamageThisTurn,
    });
  }
  return players;
};

export function diffFxEvents(
  prev: PlayerView | null,
  next: PlayerView,
  gameEvents: GameEvent[] = []
): FxEvent[] {
  // First snapshot (join/reconnect) is a state dump, not a play — no fanfare.
  if (!prev) return [];

  const events: FxEvent[] = [];

  const prevPlayers = playersById(prev);
  const nextPlayers = playersById(next);

  // Combat commits/reveals first: the flip is the cause, damage the consequence,
  // so the sounds should layer in that order.
  const selfCommitted = !!next.self.committedCard && !prev.self.committedCard;
  const otherCommitted = [...nextPlayers].some(([player, nextPlayer]) => {
    if (player === next.you) return false;
    return nextPlayer.hasCommitted && !prevPlayers.get(player)?.hasCommitted;
  });
  if (selfCommitted || otherCommitted) events.push({ type: "commit" });

  const attackerFlipped = !!next.combat?.attackerCard && !prev.combat?.attackerCard;
  const defenderFlipped = !!next.combat?.defenderCard && !prev.combat?.defenderCard;
  if (attackerFlipped || defenderFlipped) {
    events.push({ type: "reveal", count: attackerFlipped && defenderFlipped ? 2 : 1 });
  }

  // Fighters: damage / heal / defeat. A defeated fighter leaves the board
  // (space -> null), so fall back to where it stood for the visual.
  const prevFighters = new Map(prev.fighters.map((f) => [f.id, f]));
  // Fighters removed by the elimination sweep drop to hp:0 with no
  // DAMAGE_APPLIED — their hp drop is not combat damage, so skip the phantom
  // number and don't let it count as "damage this snapshot" (issue #212).
  const swept = sweptFighters(gameEvents);
  let anyHpDrop = false;
  for (const f of next.fighters) {
    const was = prevFighters.get(f.id);
    if (!was) continue;
    const space = f.space ?? was.space;
    const mine = f.owner === next.you;
    if (f.hp < was.hp && !swept.has(f.id)) {
      anyHpDrop = true;
      events.push({
        type: "damage",
        fighter: f.id,
        space,
        amount: was.hp - f.hp,
        mine,
        heroHit: f.kind === "HERO",
      });
    } else if (f.hp > was.hp) {
      events.push({ type: "heal", fighter: f.id, space, amount: f.hp - was.hp, mine });
    }
    if (f.defeated && !was.defeated) {
      events.push({ type: "defeated", fighter: f.id, space, mine });
    }
  }

  // The defense held: the combat resolved this batch dealing zero damage. Keyed off
  // the SAME resolve signal the strike diff uses (COMBAT_RESOLVED / COMBAT_DAMAGE in
  // the batch, or an outcome transition off UNKNOWN), NOT `next.combat.outcome` —
  // which is already null when a combat resolves+ends in one STATE batch, so the old
  // gate silently dropped BLOCKED for every single-batch block/tie (#382 regression).
  // Absence of COMBAT_DAMAGE means 0 damage; the hp check guards the pre-v10 path so
  // effect-damage isn't misread as a block. Empty events + no transition → nothing
  // (join/reconnect stays silent).
  const resolvedEvent = gameEvents.find((e) => e.type === "COMBAT_RESOLVED");
  const damageEvent = gameEvents.find((e) => e.type === "COMBAT_DAMAGE");
  const prevOutcome = prev.combat?.outcome ?? null;
  const nextOutcome = next.combat?.outcome ?? null;
  const resolvedByView = nextOutcome !== null && nextOutcome !== "UNKNOWN" && prevOutcome !== nextOutcome;
  const resolvedThisBatch = !!resolvedEvent || !!damageEvent || resolvedByView;
  const netDamage =
    damageEvent?.type === "COMBAT_DAMAGE" ? damageEvent.amount : next.combat?.attackDamageDealt ?? 0;
  if (resolvedThisBatch && netDamage === 0 && !anyHpDrop) {
    const targetId = next.combat?.target ?? prev.combat?.target ?? null;
    const target = targetId ? next.fighters.find((f) => f.id === targetId) : undefined;
    events.push({ type: "blocked", space: target?.space ?? null });
  }

  // Cards drawn (either seat — the table should sound busy for both players).
  const drewSelf =
    next.self.deckCount < prev.self.deckCount &&
    next.self.hand.some((c) => !prev.self.hand.includes(c));
  const drewOther = [...nextPlayers].some(([player, nextPlayer]) => {
    if (player === next.you) return false;
    const prevPlayer = prevPlayers.get(player);
    return !!prevPlayer && nextPlayer.deckCount < prevPlayer.deckCount && nextPlayer.handCount > prevPlayer.handCount;
  });
  if (drewSelf || drewOther) events.push({ type: "draw" });

  // "The Snuff" (#346): a cancel-effects card foiled an opponent's card text.
  // EFFECT_CANCELED lives only on the v10 event stream (nothing in the snapshot
  // reflects it), so read it off `gameEvents`; one beat per batch however many
  // effects were cancelled. Absent on join/reconnect (empty events) — no ghost.
  if (gameEvents.some((e) => e.type === "EFFECT_CANCELED")) events.push({ type: "cancel" });

  if (next.winner && !prev.winner) {
    events.push({ type: isViewerOnWinningTeam(next) ? "victory" : "loss" });
  } else if (prev.activePlayer !== next.activePlayer && next.activePlayer === next.you) {
    events.push({ type: "turn" });
  }

  return events;
}
