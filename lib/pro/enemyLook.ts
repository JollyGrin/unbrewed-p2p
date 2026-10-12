/**
 * How an enemy reads on every adventure surface (#1406): the board token, the initiative strip
 * and the enemy plates all draw from here, so the flat board, the tabletop and the HUD can't
 * drift. Roles come from the wire (`ViewFighter.enemy.role`) — nothing here knows a scenario.
 *
 * Hue AND shape carry the difference (colour-blind safe): the VILLAIN is an ivory solid ring
 * over a crimson plate; a MINION is a dashed salmon ring over a dark plate. The minion salmon is
 * lighter than the old enemy red so it stays apart from the p3 hero green under deuteranopia
 * (ΔE ≥ 28 vs every p1–p4 seat colour). SEAT_COLOR is untouched.
 */
export type EnemyRole = "VILLAIN" | "MINION";

export interface EnemyLook {
  /** the ring / rim colour — what a token's border and a tabletop base accent use */
  ring: string;
  /** the plate behind the initial or portrait */
  plate: string;
  /** text on the plate */
  ink: string;
  /** solid for the villain, dashed for a minion */
  ringStyle: "solid" | "dashed";
  /** badge text */
  label: "VILLAIN" | "MINION";
}

export const ENEMY_LOOK: Record<EnemyRole, EnemyLook> = {
  VILLAIN: {
    ring: "#F5F0E6",
    plate: "#7A1626",
    ink: "#F5F0E6",
    ringStyle: "solid",
    label: "VILLAIN",
  },
  MINION: {
    ring: "#FFC2B8",
    plate: "rgba(255,194,184,0.16)",
    ink: "#FFC2B8",
    ringStyle: "dashed",
    label: "MINION",
  },
};

export const enemyLookOf = (
  role: EnemyRole | null | undefined,
): EnemyLook | null => (role ? ENEMY_LOOK[role] : null);

/** The board colour of a fighter: the enemy look's ring for an enemy, else the caller's seat colour. */
export const fighterColor = (
  f: { owner: string; enemy?: { role: EnemyRole } | null },
  seatColors: Record<string, string>,
): string => enemyLookOf(f.enemy?.role)?.ring ?? seatColors[f.owner] ?? "#999";
