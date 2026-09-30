/**
 * Pure view-model for the Adventure board overlays (Wave 4.3, unbrewed-p2p#1099).
 * Everything here reads the redacted PlayerView / GameEvent stream only, so it is
 * fixture-testable without an engine. Enemy hands never reach the client; we only
 * ever read `enemy.deckCount` (a count) and `initiative.deckCount`.
 */
import type { FighterId, GameEvent, PlayerView, ViewInitiativeCard } from "@/lib/pro/protocol";

export interface InitiativeRowEntry {
  card: ViewInitiativeCard;
  current: boolean;
  /** face-down cards carry no title (hidden info) — the label falls back to the entry kind */
  label: string;
}

export interface ThreatCell {
  /** 1-based space on the track (engine `resetTo: 1` convention) */
  space: number;
  /** the printed number / value at this space, from scenario data */
  value: number;
  marker: boolean;
}

export interface EnemyDial {
  id: FighterId;
  name: string;
  role: "VILLAIN" | "MINION";
  hp: number;
  maxHp: number;
  deckCount: number;
  defeated: boolean;
}

export interface AdventureBoardModel {
  round: number | null;
  phase: string | null;
  initiativeDeckCount: number | null;
  row: InitiativeRowEntry[];
  threat: { cells: ThreatCell[]; level: number; overflows: number } | null;
  enemies: EnemyDial[];
}

const ENTRY_LABEL = { SEAT: "Seat", FIGHTER: "Enemy", EFFECT: "Event" } as const;

export const threatCells = (positions: number[], position: number): ThreatCell[] =>
  positions.map((value, i) => ({ space: i + 1, value, marker: i + 1 === position }));

/** null when the view carries no adventure data (every regular format). */
export const adventureBoardModel = (view: PlayerView): AdventureBoardModel | null => {
  const { initiative, scenario } = view;
  const enemies: EnemyDial[] = view.fighters
    .filter((f) => f.enemy)
    .map((f) => ({
      id: f.id,
      name: f.name,
      role: f.enemy!.role,
      hp: f.hp,
      maxHp: f.maxHp,
      deckCount: f.enemy!.deckCount,
      defeated: f.defeated,
    }));
  if (!initiative && !scenario && enemies.length === 0) return null;
  return {
    round: initiative?.round ?? null,
    phase: initiative?.phase ?? null,
    initiativeDeckCount: initiative?.deckCount ?? null,
    row: (initiative?.row ?? []).map((card) => ({
      card,
      current: card.id === initiative?.current,
      label: card.title ?? (card.faceDown ? "Face down" : ENTRY_LABEL[card.entry]),
    })),
    threat: scenario
      ? {
          cells: threatCells(scenario.threat.positions, scenario.threat.position),
          level: scenario.threat.level,
          overflows: scenario.threat.overflows,
        }
      : null,
    enemies,
  };
};

/**
 * One-line "what is the mover doing" text from the most recent ENEMY_ACTIVATION in a
 * STATE batch (null when the batch has none).
 */
export const moverIntent = (events: readonly GameEvent[] | undefined, view: PlayerView): string | null => {
  const ev = [...(events ?? [])].reverse().find((e) => e.type === "ENEMY_ACTIVATION");
  if (!ev || ev.type !== "ENEMY_ACTIVATION") return null;
  const name = (id: FighterId) => view.fighters.find((f) => f.id === id)?.name ?? id;
  const who = name(ev.fighter);
  if (ev.outcome === "NO_TARGET" || !ev.target) return `${who} has no target`;
  return ev.outcome === "ADJACENT"
    ? `${who} attacks ${name(ev.target)}`
    : `${who} moves toward ${name(ev.target)}`;
};

export interface TeamDecisionModel {
  promptId: string;
  /** the human seat that answers (R2 chooser) */
  chooser: string;
  /** the engine seat whose decision this is, when named */
  forName: string | null;
  youChoose: boolean;
  description: string | null;
  /** read-only option labels for teammates; empty for the chooser (they use the normal prompt UI) */
  options: { id: string; label: string }[];
}

/**
 * The "players choose" decision (engine #589, R2): null unless the open prompt is a TEAM
 * decision. Every seat sees who is choosing and what; only the chooser answers.
 */
export const teamDecisionModel = (view: PlayerView): TeamDecisionModel | null => {
  const p = view.prompt;
  if (!p || p.onBehalfOf !== "TEAM") return null;
  const seatName = (id: string) => {
    const pl = view.players.find((x) => x.id === id);
    if (pl) return pl.displayName?.trim() || pl.heroId || id;
    return view.fighters.find((f) => f.owner === id)?.name ?? id;
  };
  const youChoose = p.player === view.you;
  return {
    promptId: p.promptId,
    chooser: youChoose ? "You" : seatName(p.player),
    forName: p.forSeat ? seatName(p.forSeat) : null,
    youChoose,
    description: p.description ?? null,
    options: youChoose ? [] : p.options.map(({ id, label }) => ({ id, label })),
  };
};
