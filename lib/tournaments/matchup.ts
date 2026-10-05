/**
 * The matchup rule, as data, and the ONE function that turns it into a game's
 * heroes and map (#1196, Dean's MVP cut 2026-10-05).
 *
 * v1 implements `free`, `fixed` and `map`; `pool` and `draft` are refused with a
 * clear message. Hero swap (odd games swapped) and a loser-picks decider are
 * later changes to `assignment()` ONLY — the form, the payload and the UI all
 * speak in rules and call this for what a game looks like.
 */
import type { Assignment, MapRef, MatchupMode, MatchupRule } from "./types";

export type { Assignment };

export const SUPPORTED_MODES: readonly MatchupMode[] = ["free", "fixed", "map"];

/** The rule players get when the organizer says nothing. */
export const FREE_RULE: MatchupRule = { mode: "free" };

/** A clear reason a rule can't be used yet, or null when it can. */
export const unsupportedModeMessage = (mode: MatchupMode): string | null =>
  SUPPORTED_MODES.includes(mode)
    ? null
    : `The "${mode}" matchup mode (hero pools and pick/ban drafts) is coming later.`;

/**
 * Heroes and map for game `gameIndex` (0-based) of a match under `rule`.
 * v1: every game gets the rule's fixed heroes/map; `free` assigns nothing.
 */
export const assignment = (
  rule: MatchupRule,
  _gameIndex: number,
): Assignment => {
  switch (rule.mode) {
    case "map":
      return { heroes: { a: null, b: null }, map: rule.map ?? null };
    case "fixed":
      return {
        heroes: { a: rule.heroes?.a ?? null, b: rule.heroes?.b ?? null },
        map: rule.map ?? null,
      };
    default:
      return { heroes: { a: null, b: null }, map: null };
  }
};

/** One-line description for cards and the join page ("Players choose", …). */
export const describeRule = (
  rule: MatchupRule,
  mapName?: (ref: MapRef) => string,
): string => {
  const name = rule.map ? (mapName?.(rule.map) ?? rule.map.id) : null;
  switch (rule.mode) {
    case "free":
      return "Players choose";
    case "map":
      return name ? `Players pick heroes · ${name}` : "Same map for everyone";
    case "fixed":
      return "Organizer sets each match";
    default:
      return "Draft";
  }
};
