/**
 * cardOptions.ts — decide which prompt options should render as clickable card
 * FACES rather than plain text buttons (issue #288, extended by issue #352).
 *
 * When a prompt asks you to pick a card — a hand-card commit (issue #288's
 * Multi-Arm Barrage second attack) or a deck-search / tutor / look-at-top /
 * discard pick (issue #352) — the engine attaches the real card instance id in
 * `option.data.card` (`<defId>#<n>`). game.tsx renders those as the same
 * hover-previewable card-face picker the hand already uses, so you can see what
 * a card does mid-decision instead of reading an opaque instance-id button.
 *
 * The gate matters for BOTH prompt kinds this can arrive on:
 *  - CHOOSE_OPTION — the hand-card commit and effect-branch chooseOne prompts.
 *  - CHOOSE_TARGET — tutor/search, look-at-top, discard/shuffle-back, boost picks.
 * Effect-label options carry `data.branch` (not `data.card`), and sentinels
 * (`decline`, `data.card` null/absent) carry no instance id — the `#` guard keeps
 * both out, so they keep falling through to regular panel buttons. Fighter/space
 * CHOOSE_TARGETs don't carry `data.card` either, so the board-click flow is
 * untouched.
 */
import type { CardInstanceId, LegalOption, ViewPrompt } from "./protocol";

export interface CardOption {
  /** the RESPOND_PROMPT option id to send when this card is picked */
  id: string;
  /** the card instance behind this option, resolved for the face picker */
  instance: CardInstanceId;
}

/**
 * The real card instance id (`<defId>#<n>`) an option offers via `data.card`, or
 * null. The `#` guard requires an actual instance id, so effect-label branches
 * (`data.branch`) and sentinels (`decline`, `data.card` null) return null.
 */
export const optionCardId = (o: LegalOption): CardInstanceId | null => {
  const c = (o.data as { card?: unknown } | undefined)?.card;
  return typeof c === "string" && c.includes("#") ? c : null;
};

/**
 * Options that should render as clickable card faces for `prompt`. Returns [] for
 * any prompt that isn't a card pick (wrong kind, or no option carries a real
 * instance id) — leaving fighter/space CHOOSE_TARGETs and label-only
 * CHOOSE_OPTIONs to their existing board / button rendering.
 */
export const cardFaceOptions = (prompt: ViewPrompt | null): CardOption[] => {
  if (!prompt) return [];
  if (prompt.kind !== "CHOOSE_OPTION" && prompt.kind !== "CHOOSE_TARGET") return [];
  return prompt.options.flatMap((o) => {
    const instance = optionCardId(o);
    return instance ? [{ id: o.id, instance }] : [];
  });
};
