/**
 * The EFFECT-INITIATED attack (issue #671 ↔ engine #463, protocol v32).
 *
 * `{op:'attackWith'}` opens a REAL combat from a card effect, outside any action:
 * Boba Fett's *Slave I: FiresPray Strife* removes him from the board and, at the
 * start of his next turn, places him anywhere and attacks with SEISMIC CHARGE.
 * The combat arrives at `COMMIT_DEFENSE` with `attackerCard` already populated —
 * face UP, because the card that fired it named the attack in its printed text —
 * so the defender answers with a full defense window. That is the same shape a
 * drained sub-attack has had since v0.17.0, and the combat panel needs nothing new
 * to draw the face.
 *
 * What it DOES need is to say so. Every other combat on the table was declared by
 * somebody spending an action; this one opened on a turn edge with no declaration,
 * and its attack card is one the defender has never seen in the opponent's deck
 * (`HeroDef.linkedCards` — printed, never drawn, never in the 30). Without a marker
 * the panel reads as a bug.
 *
 * TWO KINDS OF NON-DECK COMBAT CARD, told apart by their instance id, exactly as
 * `isSubAttackCard` already does for the first:
 *
 *  - `sub-attack:<fighter>` — SYNTHETIC. No CardDef at all, no printed text, so the
 *    panel draws a bespoke tile (`SubAttackFace`).
 *  - `<cardDefId>#linked`   — a LINKED PRINTED card. A real CardDef with a real
 *    title, value and blocks, present in `PlayerView.catalog` (the engine registers
 *    `linkedCards` into `GameContext.cards`, which is what `catalogOf` walks), so it
 *    resolves art and text through the ordinary path — provided the deck snapshot
 *    carries it. Boba's does, in `deck_data.extraCards`.
 *
 * The `#linked` suffix is the engine's own construction (`makeCombatCard(
 * \`${op.card}#linked\`, …)` in engine/effects.ts' attackWith arm). Reading the id
 * is deliberate and matches the sub-attack precedent: the alternative is
 * cross-batch bookkeeping over `EFFECT_ATTACK_INITIATED` to remember which live
 * combat it opened, which buys nothing the suffix does not already say.
 */
import { CardInstanceId, CardMeta } from "./protocol";

/** What the engine appends to a linked CardDef id to make its combat instance. */
export const LINKED_CARD_SUFFIX = "#linked";

/**
 * Is this combat card a LINKED printed card — one an effect brought into a combat
 * rather than a player playing it from hand?
 */
export const isLinkedCombatCard = (instance: CardInstanceId): boolean =>
  instance.endsWith(LINKED_CARD_SUFFIX);

/** Presentation for the combat panel's effect-attack tag. */
export interface EffectAttackTag {
  /** short chip copy */
  text: string;
  /** the full sentence, as the chip's tooltip / aria-label */
  title: string;
}

/**
 * The tag for a combat whose attack card is a linked printed card, or null for
 * every ordinary combat (and for a synthetic sub-attack, which wears its own chain
 * tag and its own face).
 *
 * The card's TITLE leads the tooltip when the catalog knows it, because "SEISMIC
 * CHARGE" is the words the print used and the ones the opponent's *Slave I* text
 * said out loud. An unknown def id still tags — a client that cannot name the card
 * should still explain the combat.
 */
export const effectAttackTagFor = (
  catalog: Record<string, CardMeta> | undefined,
  instance: CardInstanceId | undefined | null
): EffectAttackTag | null => {
  if (!instance || !isLinkedCombatCard(instance)) return null;
  const title = catalog?.[instance.slice(0, -LINKED_CARD_SUFFIX.length)]?.title;
  return {
    text: "EFFECT ATTACK",
    title: title
      ? `${title} — a card effect opened this combat. No action was spent, and the card is printed on another card, not drawn from the deck.`
      : "A card effect opened this combat. No action was spent, and the attack card is printed on another card, not drawn from the deck.",
  };
};
