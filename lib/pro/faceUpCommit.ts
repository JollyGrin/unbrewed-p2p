/**
 * COMMIT-TIME FACE-UP PLAY (issue #772 ↔ engine #555, DSL v0.78.0, protocol 34).
 *
 * A `CardDef` may declare `faceUp`: the attacker commits that card FACE UP, so it
 * lands on `combat.attackerCard` at `COMMIT_DEFENSE` — public to every viewer —
 * and the defender picks a defense KNOWING the attack. Purely additive on the wire:
 * `COMMIT_ATTACK_CARD.faceUp?: true`, `CARD_COMMITTED.card?`, and nothing else.
 *
 * THE ONE THING THE CLIENT MUST INFER. `ViewCombatCard` carries no `faceUp` marker,
 * so "this face is a pre-reveal face-up commit" is read off the SHAPE of the view:
 * `stage === 'COMMIT_DEFENSE'` (the defender has not acted) plus an attacker card
 * whose instance id is an ORDINARY `<cardDefId>#<n>` — a card played from a hand.
 * The two other ways a face can already be in that slot before the reveal wear their
 * provenance in the id, and both predate this ticket:
 *
 *  - `sub-attack:<fighter>`  — SYNTHETIC (v0.17.0), no CardDef at all.
 *  - `<cardDefId>#linked`    — a LINKED printed card an effect attacked with (v32).
 *
 * That id grammar is therefore load-bearing, and it lives HERE, once: the log, the
 * strike beat, the feel layer, the combat panel and the replay scrubber all ask this
 * module rather than re-deriving three inline id checks that could drift apart.
 *
 * WHY IT MATTERS BEYOND THE BADGE: several places used "`attackerCard` became
 * non-null" as the definition of "the cards are revealed". For a face-up commit that
 * moment is the COMMIT, one decision earlier — so the log would print "Reveal: X vs
 * no defense" before the defender had a chance to defend, the reveal sound would
 * fire at the wrong beat, and the strike-linger hold would collapse early. Those
 * places now ask `isFaceUpPreRevealAttack` and fall back on `combat.stage`.
 *
 * Pure and display-only, like gameLog.ts: nothing here feeds back into play.
 */
import { isLinkedCombatCard } from "./effectAttack";
import { CardInstanceId, PlayerId, PlayerView, ViewCombat, ViewPlayer } from "./protocol";
import { isSubAttackInstance } from "./subAttackChain";

/**
 * Is this combat card an ordinary card played from a HAND — as opposed to the two
 * shapes an effect can drop into a combat slot (a synthetic sub-attack, a linked
 * printed card)? True for every card any player has ever committed.
 */
export const isHandCombatCard = (instance: CardInstanceId): boolean =>
  !isSubAttackInstance(instance) && !isLinkedCombatCard(instance);

/**
 * Is this combat showing an attack card the attacker played FACE UP, with the
 * defender still to answer?
 *
 * False for every combat shipped before engine v0.78.0: at `COMMIT_DEFENSE` the
 * attacker's card is either absent (a face-down commit) or synthetic/linked.
 */
export const isFaceUpPreRevealAttack = (combat: ViewCombat | null | undefined): boolean =>
  !!combat &&
  combat.stage === "COMMIT_DEFENSE" &&
  !!combat.attackerCard &&
  isHandCombatCard(combat.attackerCard.instance);

/** Copy for the badge the face-up card wears in the combat panel + the scrubber. */
export const FACE_UP_BADGE = "face up";

/** The full sentence behind the badge — why a card is showing before the reveal. */
export const FACE_UP_TITLE =
  "Played face up: the attacker committed this card openly, so the defender chooses a defense knowing the attack.";

/**
 * WHICH SEAT has a face-up commit on the table right now, or null.
 *
 * The engine leaves `ViewSelf.committedCard` null and `ViewOpponent.hasCommitted`
 * false for a face-up commit — the card is public on `combat.attackerCard` instead —
 * so every "has this seat committed?" derivation that reads those two fields would
 * otherwise show the attacker as still deciding while their card sits face up on the
 * panel. Callers OR this in.
 */
export const faceUpCommitter = (view: PlayerView): PlayerId | null =>
  isFaceUpPreRevealAttack(view.combat) ? view.combat!.attackerPlayer : null;

/**
 * Stamp `hasCommitted` on the seat holding a face-up commit.
 *
 * The two seat projections (gameLog, fxEvents) and the HUD's plate list all build a
 * `ViewPlayer` per seat out of fields that go EMPTY for a face-up play, and all three
 * would otherwise show the attacker as still deciding over their own played card. A
 * >2-player seat is the case the per-field fix misses: its `ViewPlayer` comes off the
 * wire whole, so the correction has to be applied to the map, not to the projection.
 *
 * Returns the same map, mutated in place (every caller has just built it privately).
 */
export const withFaceUpCommit = (
  players: Map<PlayerId, ViewPlayer>,
  view: PlayerView
): Map<PlayerId, ViewPlayer> => {
  const committer = faceUpCommitter(view);
  const seat = committer ? players.get(committer) : undefined;
  if (committer && seat) players.set(committer, { ...seat, hasCommitted: true });
  return players;
};
