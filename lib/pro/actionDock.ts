import { Action, CardInstanceId, CardMeta, FighterId, SpaceId } from "./protocol";

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
  /** Label of the live scheme item on a space (view.itemTokens → map.items), so a
   *  USE_SCHEME_ITEM action reads "Use <item label>" rather than a bare "Use item"
   *  (protocol v17). Undefined = the space has no known item; falls back to "item". */
  itemLabelForSpace?: (space: SpaceId) => string | undefined;
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
    case "BOOST_MOVE": {
      // "Boost +2 with War Drums" (issue #514) — during a maneuver the ONLY thing
      // that matters is how far each card carries you, so the boost value leads
      // and the card is named plainly. A catalog miss (or a card the server says
      // has no printed boost) falls back to the original discard wording rather
      // than printing "Boost +null".
      const boost = catalog[a.card.split("#")[0]]?.boost;
      return boost == null
        ? `Boost move (discard ${cardLabel(catalog, a.card)})`
        : `Boost +${boost} with ${cardTitle(catalog, a.card)}`;
    }
    case "MOVE_FIGHTER":
      return `Move ${a.fighter.split("/")[1]}`;
    case "SHAPESHIFT": {
      const formLabel = a.form === "Human" ? "Night Elf" : a.form;
      return `${a.via === "OMEN" ? "Omen: " : ""}Shapeshift to ${formLabel}`;
    }
    case "END_MANEUVER":
      return "End maneuver";
    case "SCHEME":
      return `Scheme: ${cardLabel(catalog, a.card)}`;
    case "USE_SCHEME_ITEM":
      return `Use ${ctx?.itemLabelForSpace?.(a.space) ?? "item"}`;
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

/** Action types the sidebar never lists as a plain button: prompts render in the
 *  PromptPanel, board affordances (MOVE_FIGHTER / PLACE_SIDEKICK) render as
 *  clickable spaces, and FORFEIT is offered only through the confirm-gated dock
 *  button. Kept here so `listActions` (game.tsx) and `soleAction` agree on what a
 *  "dock action" is. */
export const NON_DOCK_ACTION_TYPES: ReadonlyArray<Action["type"]> = [
  "RESPOND_PROMPT",
  "MOVE_FIGHTER",
  "PLACE_SIDEKICK",
  "FORFEIT",
];

/**
 * The single dock action a spacebar shortcut may fire, or null (issue #353).
 *
 * Eligible only when, ignoring FORFEIT entirely, the server offers EXACTLY ONE
 * legal action AND that action is a dock action (not a board affordance or a
 * prompt). FORFEIT and undo (which isn't a legalAction at all) never count
 * toward the option total, so "only Maneuver, plus you could forfeit" still
 * qualifies. A live prompt disqualifies the whole state — spacebar must never
 * answer a PromptPanel.
 *
 * Seat-agnostic and undo-agnostic by design: it reads only the server's
 * `legalActions` and whether a prompt is open, mirroring how the rest of the
 * dock stays free of client-side rules.
 */
export const soleAction = (legalActions: Action[], prompt: unknown): Action | null => {
  if (prompt) return null;
  const nonForfeit = legalActions.filter((a) => a.type !== "FORFEIT");
  if (nonForfeit.length !== 1) return null;
  const only = nonForfeit[0];
  return NON_DOCK_ACTION_TYPES.includes(only.type) ? null : only;
};

// ---------------------------------------------------------------------------
// Dock row ordering + hotkeys (issue #514)
// ---------------------------------------------------------------------------

/** The bands the dock groups its rows into, in RENDERED order. */
export type DockGroup = "maneuver" | "attack" | "scheme" | "boost" | "other";

/** Rendered top-to-bottom. Maneuver leads (it's the state you're in, or the
 *  cheapest way out of it), then combat — the usual path, and the one players
 *  hunt for — then schemes, then the maneuver-only boost rows, then anything
 *  else the server offers (commits, defenses, discards, shapeshifts). */
const GROUP_ORDER: readonly DockGroup[] = ["maneuver", "attack", "scheme", "boost", "other"];

/** Which band a server action renders in. Type-driven only — no seat, no rules. */
export const dockGroup = (a: Action): DockGroup => {
  switch (a.type) {
    case "MANEUVER":
    case "END_MANEUVER":
      return "maneuver";
    case "DECLARE_ATTACK":
      return "attack";
    case "SCHEME":
    case "USE_SCHEME_ITEM":
      return "scheme";
    case "BOOST_MOVE":
      return "boost";
    default:
      return "other";
  }
};

/** One rendered dock row: the server action plus its presentation extras. */
export interface DockRow {
  /** the server-offered action, forwarded to sendAction unchanged */
  action: Action;
  /** the digit that fires this row (1–9), or null — a lone row (the spacebar's
   *  job, issue #353) and any row past the 9th carry no chip */
  hotkey: number | null;
  /** render a group divider immediately above this row */
  dividerBefore: boolean;
}

/**
 * Group, order, and number the dock's rows (issue #514).
 *
 * Ordering is by band (see GROUP_ORDER), STABLE within a band so the server's own
 * enumeration order survives. Hotkeys are assigned AFTER sorting, top-to-bottom,
 * so the chip a row wears is always the digit that fires that row.
 *
 * Two states this shapes in particular:
 *  - maneuvering (END_MANEUVER + BOOST_MOVE offered): "End maneuver" first, then
 *    a divider, then the boost rows.
 *  - choose-action: Maneuver, then the attacks, then a divider, then the schemes.
 *
 * Pure and seat-agnostic: it reads action `type` only, so a multiplayer seat's
 * rows sort exactly like a duel seat's.
 */
export const dockRows = (actions: Action[]): DockRow[] => {
  const ordered = GROUP_ORDER.flatMap((g) => actions.filter((a) => dockGroup(a) === g));
  // A single row is the spacebar's case (#353) — numbering it would advertise a
  // second shortcut for the same one button.
  const numbered = ordered.length >= 2;
  let prev: DockGroup | null = null;
  return ordered.map((action, i) => {
    const group = dockGroup(action);
    const dividerBefore = prev !== null && group !== prev;
    prev = group;
    return { action, hotkey: numbered && i < 9 ? i + 1 : null, dividerBefore };
  });
};

/** A hand-card affordance: the raw server action plus a short verb label. */
export interface CardAffordance {
  action: Action;
  label: string;
}

/** The live COMBAT item a committing fighter may attach (protocol v17). Derived by
 *  the page from view.combat + the fighter's space + view.itemTokens + map.items. In
 *  any one combat the viewer is EITHER attacker or defender, so a single item
 *  (label + value) covers both COMMIT_ATTACK_CARD and COMMIT_DEFENSE_CARD. */
export interface AttachItem {
  label: string;
  value: number;
}

/**
 * Hand affordances for one card: a card is playable iff a server-offered action
 * carries its instance id. Short verb labels; the full sentence stays in the
 * sidebar. The action is forwarded UNCHANGED, so a multiplayer BOOST_MOVE keeps
 * its `player: "p3"` and sendAction echoes that seat back to the server.
 *
 * v17 combat items: when the server offers BOTH a plain and an `attachItem: true`
 * commit for the same card, they surface as two menu entries — the attach one
 * labeled "<verb> + <item> (+N)" so the opt-in is explicit. The attach decision is
 * the server's to offer (attacker commits before the defender decides); this only
 * labels what was offered.
 */
export const cardAffordances = (
  legalActions: Action[],
  instance: CardInstanceId,
  attachItem?: AttachItem
): CardAffordance[] =>
  legalActions.flatMap((a) => {
    if (!("card" in a) || a.card !== instance) return [];
    const base =
      a.type === "SCHEME"
        ? "Scheme"
        : a.type === "BOOST_MOVE"
          ? "Boost move"
          : a.type === "COMMIT_ATTACK_CARD"
            ? "Attack with"
            : a.type === "COMMIT_DEFENSE_CARD"
              ? "Defend with"
              : "Discard"; // DISCARD_TO_LIMIT — the only remaining card-carrying type
    const attaches =
      (a.type === "COMMIT_ATTACK_CARD" || a.type === "COMMIT_DEFENSE_CARD") && a.attachItem === true;
    const label = attaches && attachItem ? `${base} + ${attachItem.label} (+${attachItem.value})` : base;
    return [{ action: a, label }];
  });
