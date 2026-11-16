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

/** A "how many?" count prompt that can be answered by picking cards instead. */
export interface RevealedHandPick {
  /** the seat whose hand the batch revealed */
  owner: PlayerId;
  /** the revealed hand, in reveal order */
  cards: CardInstanceId[];
  /** the most cards that can be picked (never more than the hand holds) */
  max: number;
  /** count → the RESPOND_PROMPT option id that answers the count prompt with it */
  countOptions: Record<number, string>;
}

/** The whole number an option offers via `data.count`, or null. */
export const optionCount = (o: LegalOption): number | null => {
  const n = (o.data as { count?: unknown } | undefined)?.count;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * "Look at a hand, choose up to N cards" (issue #1691 — POMNI's *The Funny
 * One!*). The engine has no multi-select prompt: it asks "how many? 0/1/2"
 * first (a CHOOSE_OPTION whose options carry `data.count`) and then one
 * CHOOSE_TARGET per card. When the SAME event batch that opened the count
 * prompt revealed one other seat's hand, the count can be answered by picking
 * the cards themselves, so the caller shows the hand instead of bare numbers.
 *
 * Shape-based, not tied to one card. Returns null — and the prompt keeps its
 * buttons — unless EVERY option is a distinct count, the batch's reveals all
 * belong to ONE seat that is not the chooser, and at least one card can be
 * picked. So a discard-N count prompt with no reveal in its batch, a reveal of
 * the chooser's own cards, reveals from several seats (Foreshadowing) and a
 * mid-prompt reconnect (no events replayed) all fall through.
 */
export const revealedHandPick = (
  prompt: ViewPrompt | null,
  reveals: readonly RevealedCard[],
): RevealedHandPick | null => {
  if (!prompt || prompt.kind !== "CHOOSE_OPTION" || prompt.options.length === 0) return null;
  const countOptions: Record<number, string> = {};
  for (const o of prompt.options) {
    const n = optionCount(o);
    if (n === null || n in countOptions) return null;
    countOptions[n] = o.id;
  }
  const owner = reveals[0]?.player;
  if (!owner || owner === prompt.player) return null;
  const cards: CardInstanceId[] = [];
  for (const r of reveals) {
    // Same `#` guard as optionCardId: an instance id, not a bare def id.
    if (r.player !== owner || !r.card.includes("#") || cards.includes(r.card)) return null;
    cards.push(r.card);
  }
  const max = Math.min(cards.length, Math.max(...Object.keys(countOptions).map(Number)));
  return max >= 1 ? { owner, cards, max, countOptions } : null;
};
