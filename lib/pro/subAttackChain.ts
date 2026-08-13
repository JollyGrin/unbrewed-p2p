/**
 * Sub-attack CHAIN tracking (issue #596 ↔ engine #359).
 *
 * A `subAttack` op opens a SYNTHETIC combat: a card-shaped attack with no hand or
 * deck card behind it (instance `sub-attack:<fighterId>`, no printed text, no
 * effect blocks). The client has rendered one of those since Grievous's "Fire, you
 * fools!" (issue #288) — but exactly one, because the engine's single
 * `pendingSubAttack` slot silently kept only the LAST op in a block.
 *
 * Engine #359 collapsed that slot into a FIFO followup queue, so ONE card can now
 * open N sequential combats, each with its own defense window. Kenshiro's Hokuto:
 * Hundred-Fist Rush is the first consumer: up to three (WAAAA / TATATA /
 * WAATAAA!), gated on copies already in his discard pile. Three identical
 * "bonus attack" lines with no ordinal is an unreadable table, so this module
 * derives CHAIN PROGRESS — which card opened the chain, and which hit this is.
 *
 * WHAT THE WIRE ACTUALLY CARRIES (and therefore what is derived here):
 *  - #359 records the parent card on the synthetic combat card ENGINE-SIDE, for
 *    `COMBAT_CARD_IS`. It changed NO protocol field: `ViewCombatCard` has no
 *    `parentCard`, and `SUB_ATTACK_INITIATED` carries only attacker/target/value.
 *    So the parent is recovered client-side, from the last real combat card the
 *    sub-attacker's OWNER revealed before the synthetic one appeared.
 *  - The queue LENGTH is never broadcast either — entries drain one at a time, one
 *    event per opened combat. A total is therefore NOT derivable, and this module
 *    never invents one: a registry entry may declare the PRINTED upper bound
 *    ("up to 3"), which is a fact about the card, not a claim about the queue.
 *
 * Pure and display-only, like gameLog.ts: nothing here feeds back into play.
 */
import { CardInstanceId, CardMeta, FighterId, GameEvent, PlayerId, PlayerView } from "./protocol";

/** Instance-id prefix the engine mints for a synthetic sub-attack combat card. */
export const SUB_ATTACK_PREFIX = "sub-attack:";

/** Is this combat card the synthetic one a `subAttack` op opened? */
export const isSubAttackInstance = (instance: CardInstanceId): boolean =>
  instance.startsWith(SUB_ATTACK_PREFIX);

/** Title matching, same normalization the art resolver uses (lowercase + trim). */
const norm = (s: string) => s.trim().toLowerCase();

/**
 * A card known to open a MULTI-hit chain. Keyed by the parent card's VERBATIM
 * title (matched case-insensitively) rather than by hero, because that is what the
 * client can actually resolve from a card instance — and because a chain is a
 * property of the card, not of the deck.
 *
 * `max` is the bound the card PRINTS, so the label can read "of up to 3". It is
 * never used to predict how many hits are coming: a Hundred-Fist Rush with one
 * copy in the discard pile opens exactly one combat, and that one still reads
 * "chain hit 1 of up to 3" — which is honest (the card prints three stages) and is
 * the number the player is checking against their own discard pile.
 */
export interface SubAttackChainEntry {
  /** verbatim parent-card title, as it appears in the deck snapshot / catalog. */
  title: string;
  /** hero ids that print the card — documentation + a grep handle, not a gate. */
  heroes: string[];
  /** short display label for the log line and the combat panel. */
  label: string;
  /** printed upper bound on the chain ("opens up to N extra combats"). */
  max: number;
}

export const SUB_ATTACK_CHAINS: SubAttackChainEntry[] = [
  {
    // Kenshiro, Hokuto: Hundred-Fist Rush (issue #596 ↔ engine #362). The card
    // prints three stages, each gated on how many copies are already in the discard
    // pile: WAAAA (>= 1), TATATA (>= 2), WAATAAA! (>= 3), every one a 3-value
    // attack. Title is the author's verbatim heading from the TUC export.
    title: "Hokuto: Hundred-Fist Rush",
    heroes: ["kenshiro"],
    label: "Hundred-Fist Rush",
    max: 3,
  },
];

const chainEntryFor = (parentTitle: string | null | undefined): SubAttackChainEntry | null =>
  parentTitle ? SUB_ATTACK_CHAINS.find((e) => norm(e.title) === norm(parentTitle)) ?? null : null;

/**
 * Live chain state, carried ACROSS state batches (the page keeps one of these).
 *
 * `candidates` is the lookahead that makes parent recovery possible: by the time a
 * sub-attack combat opens, the parent combat is already over and its cards are gone
 * from the view, so the last real combat card each player revealed is remembered
 * from the PREVIOUS view.
 */
export interface SubAttackChainState {
  /** the real card whose text opened this chain, or null when unknown / no chain. */
  parent: CardInstanceId | null;
  /** how many synthetic sub-attack combats have opened in the current chain. */
  hits: number;
  /** last real combat card revealed per player (the parent lookahead). */
  candidates: Partial<Record<PlayerId, CardInstanceId>>;
}

export const EMPTY_SUB_ATTACK_CHAIN: SubAttackChainState = {
  parent: null,
  hits: 0,
  candidates: {},
};

/** Real (non-synthetic) combat cards in a view, keyed by the player who revealed
 *  them. A synthetic card is never a parent candidate — a chain's second hit must
 *  keep pointing at the card that opened the FIRST. */
const candidatesIn = (view: PlayerView | null): Partial<Record<PlayerId, CardInstanceId>> => {
  const c = view?.combat;
  if (!c) return {};
  const out: Partial<Record<PlayerId, CardInstanceId>> = {};
  if (c.attackerCard && !isSubAttackInstance(c.attackerCard.instance)) {
    out[c.attackerPlayer] = c.attackerCard.instance;
  }
  if (c.defenderCard && !isSubAttackInstance(c.defenderCard.instance)) {
    out[c.defenderPlayer] = c.defenderCard.instance;
  }
  return out;
};

const ownerOf = (view: PlayerView, fighter: FighterId): PlayerId | null =>
  view.fighters.find((f) => f.id === fighter)?.owner ?? null;

/**
 * Advance the chain by one STATE batch. Pure: same (prev, view, events) in, same
 * state out — the page holds the running value.
 *
 * - Each `SUB_ATTACK_INITIATED` in the batch is one more hit. The parent is fixed
 *   on the FIRST hit (from the sub-attacker owner's remembered card) and then held,
 *   so hits 2 and 3 stay attributed to the card that opened the chain even though
 *   the live combat card is synthetic by then.
 * - A combat whose attack card is a REAL card ends the chain: the queue has
 *   drained and a fresh attack is on the table. So does having no combat at all.
 *   A combat still showing the synthetic card is the SAME hit, not a new one — the
 *   sub-combat spans several batches (defense window, damage, cleanup).
 */
export function advanceSubAttackChain(
  prev: SubAttackChainState,
  prevView: PlayerView | null,
  view: PlayerView,
  events: GameEvent[]
): SubAttackChainState {
  const initiated = events.filter(
    (e): e is Extract<GameEvent, { type: "SUB_ATTACK_INITIATED" }> =>
      e.type === "SUB_ATTACK_INITIATED"
  );
  // The pre-batch view is the freshest place a parent card can still be read (the
  // parent combat is over by the time the synthetic one is in `view`), so it wins
  // over the older remembered value; `view` contributes the cards of whatever
  // combat is on the table now, for the NEXT batch.
  const fresh = candidatesIn(prevView);
  const candidates = { ...prev.candidates, ...fresh, ...candidatesIn(view) };

  if (initiated.length > 0) {
    const owner = ownerOf(view, initiated[0].attacker);
    const parent =
      prev.parent ?? (owner ? fresh[owner] ?? prev.candidates[owner] ?? null : null);
    return { parent, hits: prev.hits + initiated.length, candidates };
  }

  const live = view.combat;
  if (live?.attackerCard && isSubAttackInstance(live.attackerCard.instance)) {
    // Same synthetic combat, further along — hold the chain.
    return { ...prev, candidates };
  }
  return { parent: null, hits: 0, candidates };
}

/**
 * The parent card's VERBATIM title, from the match catalog. Deliberately not
 * `cardLabel` (actionDock.ts), which appends "(3/2)" value/boost stats — the
 * registry matches on the printed title alone, and the stats would read as noise in
 * a chain label anyway. Null for an unresolvable instance (a card the catalog does
 * not carry), which downgrades the narration rather than breaking it.
 */
export const parentCardTitle = (
  catalog: Record<string, CardMeta>,
  instance: CardInstanceId | null
): string | null => (instance ? catalog[instance.split("#")[0]]?.title ?? null : null);

/** One hit's rendered progress. `text` is the one-line form both the log and the
 *  combat panel show; the parts are exposed for callers that lay them out. */
export interface SubAttackChainProgress {
  /** display label — the registry's short label, else the parent card's title. */
  label: string;
  /** 1-based index of this hit within the chain. */
  hit: number;
  /** the card's PRINTED bound, when it declares one; null otherwise. */
  max: number | null;
  text: string;
}

/**
 * Progress for the `hit`-th sub-attack of a chain opened by `parentTitle`, or null
 * when there is nothing worth saying.
 *
 * Null on a lone hit from an UNREGISTERED card, which is deliberately the Grievous
 * "Fire, you fools!" case: one droid, one shot, no chain to narrate, and its line
 * reads exactly as it did before this module existed. A registered card narrates
 * from hit 1 (its printed bound is the point), and any card narrates from hit 2 —
 * once a second synthetic combat opens, "which one is this?" is a real question
 * whatever card asked it.
 */
export function subAttackChainProgress(
  parentTitle: string | null,
  hit: number
): SubAttackChainProgress | null {
  if (hit < 1) return null;
  const entry = chainEntryFor(parentTitle);
  if (entry) {
    return {
      label: entry.label,
      hit,
      max: entry.max,
      text: `${entry.label} — chain hit ${hit} of up to ${entry.max}`,
    };
  }
  if (hit < 2) return null;
  const label = parentTitle?.trim() || "Bonus attack";
  return { label, hit, max: null, text: `${label} — chain hit ${hit}` };
}
