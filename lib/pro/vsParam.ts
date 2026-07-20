/**
 * `?vs=` create-screen preset (issue #460).
 *
 * The /pro landing's "Play vs AI" CTA links straight into the create flow with
 * the duel opponent seat already filled by a bot, so a first-time visitor lands
 * one click from a solo match. Purely a client-side preset of state the create
 * screen already owns: no protocol or engine change, and it composes with the
 * existing `?hero=` / `?debug` params.
 *
 * Accepted: `ai` (medium), `ai-easy`, `ai-medium`, `ai-hard`. Anything else
 * (including a bare `?vs`) parses to null and leaves the seat human — an
 * unknown value must never silently arm a bot the visitor didn't ask for.
 */
import type { BotDifficulty } from "./protocol";

export function parseVsParam(
  value: string | string[] | undefined,
): BotDifficulty | null {
  // Next gives an array when a param repeats (`?vs=ai&vs=ai-hard`); the last
  // one wins, matching how a browser query string reads left-to-right.
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "ai":
    case "ai-medium":
      return "medium";
    case "ai-easy":
      return "easy";
    case "ai-hard":
      return "hard";
    default:
      return null;
  }
}

/** The `?vs=` value that presets a given difficulty (inverse of the parse). */
export function vsParamFor(difficulty: BotDifficulty): string {
  return `ai-${difficulty}`;
}
