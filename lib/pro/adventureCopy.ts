/** Player-facing copy for the Adventure HUD (enemy-turn card, TEAM-decision framing). */

export const ENEMY_TURN_STEPS = [
  { n: 1, label: "Hero adjacent?", does: "attacks" },
  { n: 2, label: "Closest reachable hero", does: "moves, attacks" },
  { n: 3, label: "No one in reach", does: "threat +1" },
] as const;

export const LARGE_REACH_NOTE = "hits from 2 away";

export const TEAM_GUIDANCE =
  "Pick the option the rules allow — usually the one that hurts your team least.";

export const teamChoosingTitle = (
  youChoose: boolean,
  chooser: string,
  villain: string | null,
  what: string | null,
): string => {
  const base = youChoose
    ? `You're choosing for ${villain ?? "the villain"}`
    : `${chooser} is choosing for ${villain ?? "the villain"}`;
  return youChoose && what ? `${base}: ${what}` : base;
};

/** Plain words for a `threat.bySource` key (#735); unknown keys fall back to a spaced guess. */
export const threatSourceWords = (key: string): string =>
  ({ roundEnd: "the round's end", noTarget: "a dinosaur with no target", effect: "a card effect" })[key] ??
  key.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
