import { Action, CardInstanceId, CardMeta, FighterId } from "./protocol";

// ---------------------------------------------------------------------------
// Action-dock presentation (pure). The dock renders EVERY affordance generically
// from the server's `legalActions`; it never special-cases a seat id, so a seat
// widened engine-side (BOOST_MOVE/FORFEIT in ffa/2v2, unbrewed-engine #119/#117)
// renders and sends exactly like a duel seat. Extracted from pages/pro/game.tsx
// so this seat-agnostic behavior is unit-testable. Both the sidebar
// (`describeAction`) and the hand-card affordance (`cardAffordances`) forward the
// server-offered action verbatim; sendAction echoes back whatever seat it carries.
// ---------------------------------------------------------------------------

/** Printed-card title via the server catalog ('king-kong/clobber#2' -> 'Clobber'). */
export const cardTitle = (catalog: Record<string, CardMeta>, instance: CardInstanceId): string => {
  const defId = instance.split("#")[0];
  return catalog[defId]?.title ?? defId.split("/").pop() ?? instance;
};

/** Printed-card label via the server catalog ('king-kong/clobber#2' -> 'clobber (3/2)'). */
export const cardLabel = (catalog: Record<string, CardMeta>, instance: CardInstanceId): string => {
  const meta = catalog[instance.split("#")[0]];
  if (!meta) return instance.split("#")[0].split("/").pop() ?? instance;
  const stats = meta.type === "scheme" ? "scheme" : `${meta.value ?? "–"}/${meta.boost ?? "–"}`;
  return `${meta.title} (${stats})`;
};

/** Context a DECLARE_ATTACK label needs to read as plain English (issue #161). */
export interface DescribeCtx {
  nameOf: (id: FighterId) => string;
  attackerBadge?: Partial<Record<FighterId, number>>;
}

/**
 * Presentational label for a server-offered action (sidebar list).
 *
 * `ctx` carries the bits a DECLARE_ATTACK label needs to read as plain English
 * instead of raw fighter ids (issue #161): a name lookup for attacker/target,
 * and the per-attacker disambiguator number that also badges the matching board
 * token, so "Attack Kong with Raptor 2" points unambiguously at the token
 * wearing the 2 badge. Omit `ctx` for the legacy id-suffix fallback.
 *
 * Player-agnostic by design: BOOST_MOVE reads "Boost move (discard X)" whether a
 * duel or multiplayer seat offered it.
 */
export const describeAction = (
  catalog: Record<string, CardMeta>,
  a: Action,
  ctx?: DescribeCtx
): string => {
  switch (a.type) {
    case "MANEUVER":
      return "Maneuver";
    case "BOOST_MOVE":
      return `Boost move (discard ${cardLabel(catalog, a.card)})`;
    case "MOVE_FIGHTER":
      return `Move ${a.fighter.split("/")[1]}`;
    case "END_MANEUVER":
      return "End maneuver";
    case "SCHEME":
      return `Scheme: ${cardLabel(catalog, a.card)}`;
    case "DECLARE_ATTACK": {
      const targetName = ctx ? ctx.nameOf(a.target) : a.target.split("/")[1];
      const attackerName = ctx ? ctx.nameOf(a.attacker) : a.attacker.split("/")[1];
      const badge = ctx?.attackerBadge?.[a.attacker];
      return `Attack ${targetName} with ${attackerName}${badge != null ? ` ${badge}` : ""}`;
    }
    case "COMMIT_ATTACK_CARD":
      return `Commit ${cardLabel(catalog, a.card)}`;
    case "COMMIT_DEFENSE_CARD":
      return `Defend with ${cardLabel(catalog, a.card)}`;
    case "DECLINE_DEFENSE":
      return "Don't defend";
    case "DISCARD_TO_LIMIT":
      return `Discard ${cardLabel(catalog, a.card)}`;
    case "PLACE_SIDEKICK":
      return `Place ${a.fighter.split("/")[1]} on ${a.space}`;
    case "RESPOND_PROMPT":
      return "Answer prompt"; // rendered by PromptPanel instead — filtered out of the list
    case "FORFEIT":
      return "Forfeit"; // engine #32 enumerates it, but we filter it out of the list and offer it via the dock button
  }
};

/** A hand-card affordance: the raw server action plus a short verb label. */
export interface CardAffordance {
  action: Action;
  label: string;
}

/**
 * Hand affordances for one card: a card is playable iff a server-offered action
 * carries its instance id. Short verb labels; the full sentence stays in the
 * sidebar. The action is forwarded UNCHANGED, so a multiplayer BOOST_MOVE keeps
 * its `player: "p3"` and sendAction echoes that seat back to the server.
 */
export const cardAffordances = (
  legalActions: Action[],
  instance: CardInstanceId
): CardAffordance[] =>
  legalActions.flatMap((a) => {
    if (!("card" in a) || a.card !== instance) return [];
    const label =
      a.type === "SCHEME"
        ? "Scheme"
        : a.type === "BOOST_MOVE"
          ? "Boost move"
          : a.type === "COMMIT_ATTACK_CARD"
            ? "Attack with"
            : a.type === "COMMIT_DEFENSE_CARD"
              ? "Defend with"
              : "Discard"; // DISCARD_TO_LIMIT — the only remaining card-carrying type
    return [{ action: a, label }];
  });
