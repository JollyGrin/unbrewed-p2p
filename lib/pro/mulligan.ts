/**
 * Opening-hand mulligan (issue #622 ↔ protocol v30, engine #395) — the prompt
 * half of the client's mulligan support.
 *
 * At game start each player gets a single keep-or-redraw window on their opening
 * hand. The engine runs it as two ordinary `PendingPrompt`s (p1 then p2) answered
 * through the existing `RESPOND_PROMPT` path, redacted so neither seat learns the
 * other's answer until the window closes — so the client needs no new socket
 * machinery, only a dedicated presentation (components/Pro/MulliganDialog.tsx).
 * The two window-close events narrate in the activity feed like every other
 * event, in `gameLog.ts`. Nothing here is rules logic: it is naming and copy.
 */
import type { LegalOption, PromptKind, ViewPrompt } from "./protocol";

/** `PromptKind` the engine opens the window with (protocol v30). */
export const MULLIGAN_PROMPT_KIND: PromptKind = "MULLIGAN";

export type MulliganChoice = "KEEP" | "MULLIGAN";

/** Is this the opening-hand window? True for the redacted opponent copy too. */
export const isMulliganPrompt = (prompt: ViewPrompt | null | undefined): boolean =>
  !!prompt && prompt.kind === MULLIGAN_PROMPT_KIND;

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
