import type { Action, FighterId, PlayerId, ProMapSpace, SpaceId, ViewFighter } from "./protocol";

// ---------------------------------------------------------------------------
// Bought attack range — PRESENTATION ONLY (unbrewed-p2p #668 ↔ engine #456).
//
// Cecil Palmer's BROADCAST TOKENS rule card: *"When you declare an attack, you
// may spend any number of Broadcast tokens to increase your attack range by the
// same number of spaces."* The engine encodes it as `HeroDef.rangePurchase` and
// resolves it WITHOUT a protocol change (engine RULING R5): over-spending is
// strictly dominated, so there is exactly one rational spend per (attacker,
// target) pair — the SHORTFALL — and `declareAttack` deducts precisely that,
// emitting the ordinary `COUNTER_CHANGED` beside `ATTACK_DECLARED`.
//
// Which means the wire says nothing at all. `legalActions` simply contains a
// `DECLARE_ATTACK` against a fighter three spaces away, and the tokens vanish
// after the click. Without this module that reads as two separate bugs —
// "why is that fighter highlighted?" and "where did my tokens go?" — so the
// client REPRICES the offer locally, to show the cost BEFORE the click and to
// narrate the spend after it.
//
// Same contract as lib/pro/largeReach.ts, which explains the other invisible
// reach widening: the engine decides legality, these helpers only EXPLAIN a
// server-offered option. Nothing here ever adds, hides or re-checks an action.
//
// ATTACKER-ONLY, exactly like the LARGE widening (engine #307 / #456's own
// note): buying range must never let anybody reach the buyer. So the costs are
// computed only for the VIEWER'S OWN offered attacks — the opponent's board
// never grows a threat ring because Cecil has a full dial.
// ---------------------------------------------------------------------------

/** A hero whose deck buys attack range with a counter, and how to say so. */
export interface RangePurchaseRule {
  /** the `PlayerView.counters` key the engine spends — VERIFY against the
   *  engine's rules.ts (`rangePurchase.counter`). Cecil's is `BROADCAST`. */
  counter: string;
  /** singular noun for one unit, as the card prints it ("Broadcast token"). */
  noun: string;
  /** compact per-unit glyph for the on-board cost chip ("−2 📻"). Matches the
   *  counter's HERO_STATE_COUNTERS badge icon so the price and the pool that
   *  pays it are visibly the same resource. */
  icon: string;
}

/**
 * The ONE registry of range-buying heroes, keyed by engine hero id. Opt-in like
 * HERO_STATE_COUNTERS: a hero with no row here gets today's exact behaviour, and
 * every cost this module reports is 0.
 */
export const RANGE_PURCHASE_HEROES: Record<string, RangePurchaseRule> = {
  // Cecil Palmer (engine #456): `rangePurchase: { counter: 'BROADCAST', who: 'ANY_OWN' }`
  // — "you" is the PLAYER, so either of his fighters may buy with the seat's dial.
  "cecil-palmer": { counter: "BROADCAST", noun: "Broadcast token", icon: "📻" },
};

/** The range-purchase rule for a hero, or null when the deck buys no range. */
export const rangePurchaseRuleFor = (heroId: string | undefined): RangePurchaseRule | null =>
  (heroId && RANGE_PURCHASE_HEROES[heroId]) || null;

/** The board spaces a fighter's body occupies (head + tail for a LARGE fighter). */
const occupiedSpaces = (f: Pick<ViewFighter, "space" | "tailSpace">): SpaceId[] =>
  [f.space, f.tailSpace].filter((s): s is SpaceId => s != null);

/**
 * Undirected targeting adjacency for one space, mirroring the engine's
 * `adjacentSpaces`: `adjacentTo` plus one-way movement edges in BOTH directions
 * (the official one-way ruling — range is line-of-targeting, not a movement
 * path). Built once per view, because the reverse one-way edges need a whole
 * pass over the map to find.
 */
export const targetingGraph = (spaces: ProMapSpace[]): Map<SpaceId, SpaceId[]> => {
  const g = new Map<SpaceId, Set<SpaceId>>();
  const edge = (a: SpaceId, b: SpaceId) => {
    if (!g.has(a)) g.set(a, new Set());
    g.get(a)!.add(b);
  };
  for (const s of spaces) {
    if (!g.has(s.id)) g.set(s.id, new Set());
    for (const a of s.adjacentTo) edge(s.id, a);
    // one-way edges count for TARGETING in both directions (engine adjacentSpaces)
    for (const a of s.oneWayTo ?? []) {
      edge(s.id, a);
      edge(a, s.id);
    }
  }
  return new Map([...g].map(([k, v]) => [k, [...v]]));
};

/** Zones per space, for the RANGED/LUNGE same-zone reach component. */
const zoneIndex = (spaces: ProMapSpace[]): Map<SpaceId, string[]> =>
  new Map(spaces.map((s) => [s.id, s.zones]));

/**
 * True when `to` is within `n` undirected adjacency steps of `from` — the engine's
 * `withinSpaces`, verbatim in behaviour including its `from === to ⇒ false`
 * (distance 0 is not "within n steps"; the shared-space case is handled by the
 * SMALL rule below, not by distance).
 */
export const withinSpaces = (
  graph: Map<SpaceId, SpaceId[]>,
  from: SpaceId,
  to: SpaceId,
  n: number
): boolean => {
  if (from === to) return false;
  let frontier: SpaceId[] = [from];
  const seen = new Set<SpaceId>([from]);
  for (let d = 1; d <= n; d++) {
    const next: SpaceId[] = [];
    for (const cur of frontier) {
      for (const adj of graph.get(cur) ?? []) {
        if (seen.has(adj)) continue;
        if (adj === to) return true;
        seen.add(adj);
        next.push(adj);
      }
    }
    frontier = next;
  }
  return false;
};

/** The map lookups the reach predicate needs, built once per view. */
export interface ReachIndex {
  graph: Map<SpaceId, SpaceId[]>;
  zones: Map<SpaceId, string[]>;
}

export const reachIndex = (spaces: ProMapSpace[]): ReachIndex => ({
  graph: targetingGraph(spaces),
  zones: zoneIndex(spaces),
});

const sharesZone = (idx: ReachIndex, a: SpaceId, b: SpaceId): boolean => {
  const other = new Set(idx.zones.get(b) ?? []);
  return (idx.zones.get(a) ?? []).some((z) => other.has(z));
};

/**
 * The engine's `inAttackRange` for one pair of spaces, at a given purchased
 * `bonus`. Kept structurally identical to engine/map.ts so the two cannot drift:
 * a shared space is reach only under the SMALL rule (never widened by distance),
 * the melee component is `(large ? 2 : 1) + bonus` adjacency steps, and
 * RANGED/LUNGE add same-zone.
 */
const inAttackRange = (
  idx: ReachIndex,
  from: SpaceId,
  to: SpaceId,
  reach: ViewFighter["reach"],
  attackerSize: ViewFighter["size"],
  targetSize: ViewFighter["size"],
  bonus: number
): boolean => {
  if (from === to) return attackerSize === "SMALL" || targetSize === "SMALL";
  const large = attackerSize === "LARGE";
  if (withinSpaces(idx.graph, from, to, large ? 2 : 1)) return true;
  if (bonus > 0 && withinSpaces(idx.graph, from, to, (large ? 2 : 1) + bonus)) return true;
  return (reach === "RANGED" || reach === "LUNGE") && sharesZone(idx, from, to);
};

/** Pose-aware form: reach holds when ANY pair of occupied spaces qualifies. */
export const inReach = (
  attacker: ViewFighter,
  target: ViewFighter,
  idx: ReachIndex,
  bonus = 0
): boolean =>
  occupiedSpaces(attacker).some((a) =>
    occupiedSpaces(target).some((t) =>
      inAttackRange(idx, a, t, attacker.reach, attacker.size, target.size, bonus)
    )
  );

/**
 * The MINIMUM counters that put `target` in `attacker`'s reach — the engine's
 * `rangeCostFor`. 0 means "already in reach, spend nothing", which is the answer
 * for every attack in every other deck and, importantly, for an ADJACENT target
 * even when the dial is full: the engine buys the shortfall, never the dial.
 * `null` when no affordable spend reaches (which the server would not have
 * offered, so it reads as "do not annotate this option").
 *
 * Probed upward from 1 rather than measured as a distance, exactly as the engine
 * does, so one predicate decides both "is it in reach" and "what does it cost".
 */
export const rangeCostFor = (
  attacker: ViewFighter,
  target: ViewFighter,
  idx: ReachIndex,
  budget: number
): number | null => {
  if (attacker.space == null || target.space == null) return null;
  if (inReach(attacker, target, idx)) return 0;
  for (let n = 1; n <= budget; n++) if (inReach(attacker, target, idx, n)) return n;
  return null;
};

/** What one server-offered DECLARE_ATTACK will cost in tokens, and in what. */
export interface BoughtRange {
  attacker: FighterId;
  target: FighterId;
  cost: number;
  rule: RangePurchaseRule;
}

/** The view fields this module reads — a narrow slice, so tests need no full view.
 *  Note `legalActions` is NOT one of them: on the wire it rides BESIDE the view
 *  (`snapshot.legalActions`), so it is passed separately rather than read off a
 *  field that would silently be `undefined`. */
export interface RangePurchaseView {
  you: PlayerId;
  fighters: ViewFighter[];
  players: { id: PlayerId; heroId: string; counters?: Record<string, number> }[];
  map: { spaces: ProMapSpace[] };
}

/**
 * Every offered attack that is only legal because tokens will be spent, priced.
 * Empty for every deck that buys no range, and for a Cecil attack on an adjacent
 * fighter (cost 0 — free reach is still free).
 *
 * Gated on the ATTACKER'S OWNER being the viewer, not merely on the action being
 * offered: `legalActions` is already this seat's, but the gate is what documents
 * that bought reach is never drawn as a threat on the opponent's side.
 *
 * The budget is that seat's LIVE counter — the same number `affordableRangeBonus`
 * widened the enumeration with — so the client's price and the server's deduction
 * are computed from identical inputs.
 */
export const boughtRangeAttacks = (
  view: RangePurchaseView,
  actions: Action[]
): BoughtRange[] => {
  if (!actions.some((a) => a.type === "DECLARE_ATTACK")) return [];
  const seat = view.players.find((p) => p.id === view.you);
  const rule = rangePurchaseRuleFor(seat?.heroId);
  if (!rule) return [];
  const budget = seat?.counters?.[rule.counter] ?? 0;
  if (budget <= 0) return [];
  const idx = reachIndex(view.map.spaces);
  const byId = new Map(view.fighters.map((f) => [f.id, f]));
  const out: BoughtRange[] = [];
  for (const a of actions) {
    if (a.type !== "DECLARE_ATTACK") continue;
    const attacker = byId.get(a.attacker);
    const target = byId.get(a.target);
    if (!attacker || !target) continue;
    if (attacker.owner !== view.you) continue; // attacker-only, always
    const cost = rangeCostFor(attacker, target, idx, budget);
    if (cost != null && cost > 0) out.push({ attacker: a.attacker, target: a.target, cost, rule });
  }
  return out;
};

/** The compact chip drawn on a bought target's board token: `−2 📻`. */
export const boughtRangeChip = (b: Pick<BoughtRange, "cost" | "rule">): string =>
  `−${b.cost} ${b.rule.icon}`;

/** Hover/row copy for a bought target — the cost AND why it is being charged. */
export const boughtRangeBlurb = (b: Pick<BoughtRange, "cost" | "rule">): string =>
  `Beyond reach — declaring this attack spends ${b.cost} ${b.rule.noun}${b.cost === 1 ? "" : "s"} to close the gap.`;

/**
 * The log line for a spend, phrased for BOTH seats: "Cecil Palmer spent 2 Broadcast
 * tokens to reach The Child". Built from the `COUNTER_CHANGED` that arrives beside
 * `ATTACK_DECLARED`, which is the only signal the engine emits for the purchase.
 */
export const rangeSpendText = (
  attackerName: string,
  targetName: string,
  amount: number,
  rule: RangePurchaseRule
): string =>
  `${attackerName} spent ${amount} ${rule.noun}${amount === 1 ? "" : "s"} to reach ${targetName}`;

/**
 * The bespoke log line for one `COUNTER_CHANGED` decrease, or null when this
 * decrease is not a range purchase.
 *
 * The pairing IS the signal: engine #456 deliberately added no event, so a spend
 * is "a decrease of the hero's `rangePurchase` counter arriving in the same STATE
 * batch as an `ATTACK_DECLARED` by one of that player's fighters". Everything
 * else about that counter — the gains from ending movement on multi-zone spaces,
 * or any future card that spends it — falls through to the generic counter line,
 * which is the right default and stays untouched.
 *
 * Structurally gated (hero registry + event pairing), never on label text, and it
 * renders for BOTH seats: the counters are public and the reach is the opponent's
 * business more than anyone's.
 */
export const rangeSpendLineFor = (
  events: { type: string; attacker?: FighterId; target?: FighterId }[],
  player: PlayerId,
  counterName: string,
  amount: number,
  view: { fighters: ViewFighter[]; players: { id: PlayerId; heroId: string }[] }
): string | null => {
  const rule = rangePurchaseRuleFor(view.players.find((p) => p.id === player)?.heroId);
  if (!rule || rule.counter !== counterName || amount <= 0) return null;
  const byId = new Map(view.fighters.map((f) => [f.id, f]));
  for (const e of events) {
    if (e.type !== "ATTACK_DECLARED" || !e.attacker || !e.target) continue;
    const attacker = byId.get(e.attacker);
    if (!attacker || attacker.owner !== player) continue;
    return rangeSpendText(attacker.name, byId.get(e.target)?.name ?? e.target, amount, rule);
  }
  return null;
};
