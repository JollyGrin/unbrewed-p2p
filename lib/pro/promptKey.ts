/**
 * One prompt's identity for per-prompt UI state (a minimised sheet, an expanded
 * bar, the turn reminder's progress key).
 *
 * `promptId` alone is not unique: the engine numbers prompts off its action log
 * (`p${actionLog.length}`), and a setup prompt answered before anything is logged
 * leaves the next prompt with the same id. The setup sidekick choice (v42) and the
 * same seat's mulligan prompt both arrive as `p0` (issue #1717), so state keyed on
 * the bare id carried over from one to the other. The owner and the kind tell them
 * apart, and both are on every seat's copy of the prompt (options are not, so they
 * stay out of the key).
 */
import type { ViewPrompt } from "./protocol";

export const promptKeyOf = (prompt: Pick<ViewPrompt, "promptId" | "player" | "kind" | "description">): string =>
  [prompt.promptId, prompt.player, prompt.kind, prompt.description ?? ""].join("|");
