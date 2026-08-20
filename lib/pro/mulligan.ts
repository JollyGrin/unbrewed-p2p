/**
 * Opening-hand mulligan (issue #622 ↔ engine #395) — the ONE place the client
 * knows the mulligan wire shape.
 *
 * At game start each player gets a single keep-or-redraw window on their opening
 * hand. The engine runs it as two ordinary `PendingPrompt`s (P1 then P2) answered
 * through the existing `RESPOND_PROMPT` path, redacted so neither seat learns the
 * other's answer until the window closes — so the client needs no new socket
 * machinery, only a dedicated presentation (components/Pro/MulliganDialog.tsx)
 * and two log lines.
 *
 * ## Why the string comparisons are widened
 * The prompt kind and the two window-close events are engine-side names that
 * reach us through `protocol.ts` (copied verbatim from the engine). This module
 * matches them as plain strings rather than against the `PromptKind` / `GameEvent`
 * unions so that a client built against an OLDER protocol copy still compiles and
 * still renders correctly the moment a newer server starts sending them — and so
 * a server that never sends them (mulligan off, or an older build) simply never
 * lights any of this up. Nothing here is rules logic: it is naming and copy.
 */
import type { GameEvent, LegalOption, PlayerId, ViewPrompt } from "./protocol";
import type { ProLogLine } from "./gameLog";

/** `PromptKind` the engine opens the window with. */
export const MULLIGAN_PROMPT_KIND = "MULLIGAN";

/** Window-close events, emitted for BOTH seats once both players have answered. */
export const MULLIGAN_TAKEN_EVENT = "MULLIGAN_TAKEN";
export const HAND_KEPT_EVENT = "HAND_KEPT";

export type MulliganChoice = "KEEP" | "MULLIGAN";

/** Is this the opening-hand window? True for the redacted opponent copy too. */
export const isMulliganPrompt = (prompt: ViewPrompt | null | undefined): boolean =>
  !!prompt && (prompt.kind as string) === MULLIGAN_PROMPT_KIND;

/**
 * Which of the two answers an offered option is, for presentation only: the
 * button that redraws is styled and confirmed differently from the one that
 * keeps. The option's own `id`/`label` is what actually gets sent, so an
 * unrecognised option still renders (under the server's label) and still works —
 * it just gets the neutral treatment.
 */
export const mulliganChoiceOf = (option: LegalOption): MulliganChoice | null => {
  const text = `${option.id} ${option.label ?? ""}`.toLowerCase();
  if (/mulligan|redraw|re-draw/.test(text)) return "MULLIGAN";
  if (/keep/.test(text)) return "KEEP";
  return null;
};

/** Past-tense line for the seat's own waiting state ("You kept your hand"). */
export const decidedLabel = (choice: MulliganChoice | null): string =>
  choice === "MULLIGAN"
    ? "You mulliganed your opening hand"
    : choice === "KEEP"
      ? "You kept your opening hand"
      : "You have decided";

/**
 * Activity-feed lines for the window closing. The engine emits one event per
 * seat only once BOTH have answered, so both choices surface at the same moment
 * and in both seats' feeds — the client never has to infer a choice from the
 * shuffle/draw traffic (and never could, since the opponent's is redacted).
 */
export function mulliganLogLines(
  events: readonly GameEvent[],
  ctx: { you: PlayerId; seat: (player: PlayerId) => string }
): ProLogLine[] {
  const lines: ProLogLine[] = [];
  for (const event of events) {
    const e = event as { type: string; player?: unknown };
    if (e.type !== MULLIGAN_TAKEN_EVENT && e.type !== HAND_KEPT_EVENT) continue;
    if (typeof e.player !== "string") continue;
    const player = e.player as PlayerId;
    const mine = player === ctx.you;
    const verb = e.type === MULLIGAN_TAKEN_EVENT ? "mulliganed" : "kept";
    lines.push({
      text: `${ctx.seat(player)} ${verb} ${mine ? "your" : "their"} opening hand`,
      who: mine ? "you" : "opp",
    });
  }
  return lines;
}
