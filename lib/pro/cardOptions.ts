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
import type { CardInstanceId, LegalOption, PlayerId, ViewPrompt } from "./protocol";

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

/** A CARD_REVEALED event distilled to the two fields the pick matcher needs. */
export interface RevealedCard {
  player: PlayerId;
  card: CardInstanceId;
}

/** A CHOOSE_TARGET option whose target player's revealed card is known. */
export interface PlayerRevealOption {
  /** the RESPOND_PROMPT option id to send when this card is picked */
  id: string;
  /** the revealed card, resolved for the face picker */
  instance: CardInstanceId;
  /** the seat the revealed card belongs to */
  player: PlayerId;
}

/** The seat an option targets via `data.player`, or null. */
export const optionPlayerId = (o: LegalOption): PlayerId | null => {
  const p = (o.data as { player?: unknown } | undefined)?.player;
  return typeof p === "string" ? (p as PlayerId) : null;
};

/**
 * Match a CHOOSE_TARGET's player options against the CARD_REVEALEDs from the
 * SAME event batch that opened the prompt (issue #861 — The Narrator's
 * Foreshadowing: every seat reveals their top card, then you pick a player).
 * The caller passes only reveals captured under the prompt's own promptId, so a
 * stale reveal from an earlier batch can never attach to a later prompt.
 *
 * All-or-nothing: returns enriched options only when EVERY option names a player
 * (option.data.player) AND that player has a reveal in the batch — which is
 * exactly Foreshadowing's shape. Anything else (a Choose-Opponent prompt with
 * data.player options but no reveals in its batch, a prompt whose options name
 * fighters or spaces, or a mid-prompt reconnect where the reveal events are
 * gone) returns [] and the prompt keeps its ordinary button rendering.
 */
export const revealedPlayerPickOptions = (
  prompt: ViewPrompt | null,
  reveals: readonly RevealedCard[],
): PlayerRevealOption[] => {
  if (!prompt || prompt.kind !== "CHOOSE_TARGET" || prompt.options.length === 0) return [];
  const byPlayer = new Map(reveals.map((r) => [r.player, r.card]));
  const out: PlayerRevealOption[] = [];
  for (const o of prompt.options) {
    const p = optionPlayerId(o);
    if (!p) return [];
    const card = byPlayer.get(p);
    // Same `#` guard as optionCardId: an instance id, not a bare def id.
    if (!card || !card.includes("#")) return [];
    out.push({ id: o.id, instance: card, player: p });
  }
  return out;
};
