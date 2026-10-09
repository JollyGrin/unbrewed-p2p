/** Player-facing copy for the Adventure HUD (TEAM-decision framing). Rules copy: `adventureRulesCopy`. */
import { anEnemy } from "./adventureRulesCopy";
import type { ScenarioDisplay } from "./protocol";

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
export const threatSourceWords = (key: string, display?: ScenarioDisplay | null): string =>
  ({ roundEnd: "the round's end", noTarget: `${anEnemy(display)} with no target`, effect: "a card effect" })[key] ??
  key.replace(/[-_]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
