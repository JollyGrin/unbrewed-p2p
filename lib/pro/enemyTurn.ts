/**
 * The enemy-turn narrator card (#1156): which step of the AI ladder fired on the latest
 * ENEMY_ACTIVATION, whom it targets, the attack card, and the persistence rule (the card
 * stays until the next activation or turn start, then collapses to a one-line summary).
 * Pure — the React layer only renders it.
 */
import type { FighterId, GameEvent, PlayerView } from "./protocol";
import { ENEMY_LADDER, LARGE_REACH_NOTE, enemyIntent } from "./adventureRulesCopy";

export interface EnemyTurnStep {
  n: 1 | 2 | 3;
  label: string;
  does: string;
  lit: boolean;
}

export interface EnemyTurnAttack {
  /** catalog id of the attack card (no `#n`) — the key for its CDN face */
  cardId: string;
  title: string;
  value: number | null;
  defender: string | null;
}

export interface EnemyTurnModel {
  fighter: FighterId;
  enemyName: string;
  outcome: "ADJACENT" | "CLOSEST" | "NO_TARGET";
  steps: EnemyTurnStep[];
  /** header sub-line: "MOVE 3" (+ " · hits from 2 away" for LARGE) */
  moveLine: string;
  large: boolean;
  targetId: FighterId | null;
  targetName: string | null;
  /** what happened, e.g. "attacks Hero" / "threat +1 (now 3)" */
  consequence: string;
  attack: EnemyTurnAttack | null;
}

export interface EnemyTurnState {
  model: EnemyTurnModel;
  /** true once a later turn started: render only the one-line summary */
  collapsed: boolean;
}

const nameOf = (view: PlayerView, id: FighterId) =>
  view.fighters.find((f) => f.id === id)?.name ?? id;

const attackFrom = (
  events: readonly GameEvent[],
  view: PlayerView,
  enemy: FighterId,
  defender: string | null,
): EnemyTurnAttack | null => {
  const declared = events.some(
    (e) => e.type === "ATTACK_DECLARED" && e.attacker === enemy,
  );
  const rev = events.find((e) => e.type === "CARDS_REVEALED");
  if (!declared || !rev || rev.type !== "CARDS_REVEALED") return null;
  const meta = view.catalog?.[rev.attackerCard.replace(/#\d+$/, "")];
  return {
    cardId: rev.attackerCard.replace(/#\d+$/, ""),
    title: meta?.title ?? rev.attackerCard,
    value: meta?.value ?? null,
    defender,
  };
};

/** Model for the LAST ENEMY_ACTIVATION in a batch (null when it has none). */
export const enemyTurnModel = (
  events: readonly GameEvent[] | undefined,
  view: PlayerView,
): EnemyTurnModel | null => {
  const list = events ?? [];
  const at = list.map((e) => e.type).lastIndexOf("ENEMY_ACTIVATION");
  const ev = list[at];
  if (!ev || ev.type !== "ENEMY_ACTIVATION") return null;
  const f = view.fighters.find((x) => x.id === ev.fighter);
  const large = f?.size === "LARGE";
  const step = ev.outcome === "ADJACENT" ? 1 : ev.outcome === "CLOSEST" ? 2 : 3;
  const targetId = step === 3 ? null : (ev.target ?? null);
  const targetName = targetId ? nameOf(view, targetId) : null;
  const threat = view.scenario?.threat.level;
  const consequence =
    step === 3
      ? threat != null
        ? `threat +1 (now ${threat})`
        : "threat +1"
      : step === 1
        ? enemyIntent(ev.outcome, targetName)
        : `${enemyIntent(ev.outcome, targetName)}, attacks`;
  const move = f?.enemy?.move;
  return {
    fighter: ev.fighter,
    enemyName: f?.name ?? ev.fighter,
    outcome: ev.outcome,
    steps: ENEMY_LADDER.map(({ n, label, does }) => ({ n, label, does, lit: n === step })),
    moveLine: [move != null ? `MOVE ${move}` : null, large ? LARGE_REACH_NOTE : null]
      .filter(Boolean)
      .join(" · "),
    large,
    targetId,
    targetName,
    consequence,
    attack:
      step === 3
        ? null
        : attackFrom(list.slice(at), view, ev.fighter, targetName),
  };
};

/** One-line collapsed summary: "Rex: attacks Hero" / "Rex: threat +1 (now 3)". */
export const enemyTurnSummary = (m: EnemyTurnModel): string =>
  `${m.enemyName}: ${m.consequence}`;

/**
 * Fold one STATE batch into the card state. A new ENEMY_ACTIVATION replaces it; a later
 * batch of the same activation (the attack reveal) fills in the attack card; a
 * TURN_STARTED collapses it to the summary line.
 */
export const nextEnemyTurnState = (
  prev: EnemyTurnState | null,
  events: readonly GameEvent[] | undefined,
  view: PlayerView,
): EnemyTurnState | null => {
  const fresh = enemyTurnModel(events, view);
  if (fresh) {
    const at = (events ?? []).map((e) => e.type).lastIndexOf("ENEMY_ACTIVATION");
    const turnAfter = (events ?? [])
      .slice(at)
      .some((e) => e.type === "TURN_STARTED");
    return { model: fresh, collapsed: turnAfter };
  }
  if (!prev) return null;
  let model = prev.model;
  if (!model.attack && model.targetId && events?.length) {
    const attack = attackFrom(events, view, model.fighter, model.targetName);
    if (attack) model = { ...model, attack };
  }
  const collapsed =
    prev.collapsed || (events ?? []).some((e) => e.type === "TURN_STARTED");
  return model === prev.model && collapsed === prev.collapsed
    ? prev
    : { model, collapsed };
};

/** The board arrow while the full card is up (nothing for NO_TARGET / collapsed). */
export const enemyTurnArrow = (
  s: EnemyTurnState | null,
): { attacker: FighterId; target: FighterId } | null =>
  s && !s.collapsed && s.model.targetId
    ? { attacker: s.model.fighter, target: s.model.targetId }
    : null;
