/**
 * Cosmetic points and upgrades (epic #610, ticket #614) — the fetch layer for
 * `GET /me/cosmetics`, `POST /me/cosmetics/spend` and
 * `PUT /me/cosmetics/token-rim` on the accounts API (unbrewed-api-28).
 *
 * Same contract as the rest of lib/account: never throws, never logs, every
 * failure becomes a typed reason. Two things about THIS endpoint set shape the
 * code below and are worth knowing before reading it:
 *
 * 1. **A 503 still carries the ledger.** Points *earned* are recomputed from
 *    telemetry on every read, but what a player has SPENT — their upgraded
 *    cards, their token-rim prefs — is the API's own storage and survives an
 *    upstream outage. Its 503 body therefore carries the same `heroes` array
 *    with every telemetry-derived field (`earned`, `available`,
 *    `tokenRim.unlockedTier`) set to `null`. We read that body, because a
 *    player whose upgrades appeared to evaporate during a telemetry blip would
 *    reasonably think they had been robbed.
 * 2. **`null` is not `0`.** It means "we could not find out". The page must be
 *    able to tell that apart from "no points yet" — one is a banner and
 *    disabled buttons, the other is an ordinary new account — so the nullable
 *    fields stay nullable all the way to the render.
 *
 * Since #615 this module has a SECOND consumer: the equip wire, which needs the
 * loadout for the one hero a player is about to take into a game rather than
 * the whole ledger a store page renders. That is `wireLoadoutFor` at the bottom
 * — a pure projection of the same `HeroCosmetics` rows, so there is one place
 * that knows what the API answers and one shape it answers in.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what something LOOKS like and nothing
 * else. Nothing in this module reaches the engine, a log line, a legal action,
 * a bot, or a replay outcome. It buys pixels.
 */
import type { CosmeticLoadout } from "@/lib/pro/cosmeticsWire";
import { COSMETIC_RIM_TIERS, CosmeticRimTier } from "@/lib/pro/cosmetics";
import { API_URL } from "./apiUrl";

/** A card set the player has bought at least one tier step of. */
export interface CosmeticCard {
  /** `norm(title)` — the same key the art snapshot and the rim registry use. */
  key: string;
  /** Highest tier step purchased; 1-based, never 0 (an unbought card has no row). */
  tier: number;
}

export interface CosmeticTokenRim {
  /**
   * Highest rim tier this hero's EARNED points have unlocked (0 = none), or
   * null when telemetry couldn't be reached. Measured against earned, never
   * available, so buying card art never takes a rim away.
   */
  unlockedTier: number | null;
  /** The stored display pref. Storage, not telemetry — always known. */
  enabled: boolean;
}

/** One hero's cosmetic standing. Telemetry-derived fields are nullable — see (2). */
export interface HeroCosmetics {
  heroId: string;
  earned: number | null;
  spent: number;
  adjusted: number;
  available: number | null;
  cards: CosmeticCard[];
  tokenRim: CosmeticTokenRim;
}

/** The economy, as the API publishes it. Never hardcoded on this side. */
export interface CosmeticConstants {
  /** Cost of each step up a card's ladder, cheapest first. Length = the ceiling. */
  cardTierCosts: number[];
  /** Earned-point thresholds for each token-rim tier, ascending. */
  tokenRimThresholds: number[];
}

export interface CosmeticsPayload {
  heroes: HeroCosmetics[];
  constants: CosmeticConstants;
}

/**
 * The ladder the client falls back to when the API didn't publish one (an
 * older deploy, or an unreadable body). Deliberately the API's own numbers:
 * it is a render hint that keeps the page from showing blank costs, and the
 * server re-checks every price on the spend anyway, so a stale copy can only
 * ever mislabel a button — never overcharge anybody.
 */
export const FALLBACK_CONSTANTS: CosmeticConstants = {
  cardTierCosts: [50, 150, 400, 1000],
  tokenRimThresholds: [250, 750, 2000, 5000],
};

/** Why the read didn't arrive. `unavailable` is the catch-all → degraded page. */
export type CosmeticsFailure = "unauthorized" | "rate_limited" | "unavailable";

export type CosmeticsResult =
  | { ok: true; value: CosmeticsPayload }
  | {
      ok: false;
      reason: CosmeticsFailure;
      /**
       * The ledger the API managed to report anyway — see (1). Null when we
       * couldn't reach it at all, or its body wasn't readable.
       */
      degraded: CosmeticsPayload | null;
    };

/**
 * Why a spend didn't take.
 * - `insufficient_points` / `invalid_tier` — the server's 422s. Both are
 *   honestly reachable from a page left open while another tab bought
 *   something, so they are messages, not bug reports.
 * - `unavailable` — 503/network. A spend needs telemetry to know the balance,
 *   so it fails CLOSED; taking the client's word for it would be the exploit.
 */
export type SpendFailure =
  | "insufficient_points"
  | "invalid_tier"
  | "unauthorized"
  | "rate_limited"
  | "unavailable";

export type SpendResult =
  | { ok: true; hero: HeroCosmetics }
  | { ok: false; reason: SpendFailure; message: string };

export type TokenRimResult = { ok: true } | { ok: false; reason: SpendFailure };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** A count: a non-negative integer, or 0 for anything else. */
const asCount = (value: unknown): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return n > 0 ? Math.round(n) : 0;
};

/** A count that keeps "the server said it doesn't know" as `null`. */
const asNullableCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;

/** Any integer, including negative — a clawback adjustment is one. */
const asInt = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;

const normalizeCards = (raw: unknown): CosmeticCard[] => {
  if (!Array.isArray(raw)) return [];
  const cards: CosmeticCard[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const row = asRecord(entry);
    const key = row ? asString(row.key) : null;
    const tier = row ? asCount(row.tier) : 0;
    // A tier-0 row is an unbought card, which by construction has no row at
    // all; a duplicate key would render twice and upgrade ambiguously.
    if (!key || tier <= 0 || seen.has(key)) continue;
    seen.add(key);
    cards.push({ key, tier });
  }
  return cards;
};

const normalizeHero = (raw: unknown): HeroCosmetics | null => {
  const row = asRecord(raw);
  const heroId = row ? asString(row.heroId) : null;
  if (!row || !heroId) return null;
  const rim = asRecord(row.tokenRim) ?? {};
  return {
    heroId,
    earned: asNullableCount(row.earned),
    spent: asCount(row.spent),
    adjusted: asInt(row.adjusted),
    available: asNullableCount(row.available),
    cards: normalizeCards(row.cards),
    tokenRim: {
      unlockedTier: asNullableCount(rim.unlockedTier),
      enabled: rim.enabled === true,
    },
  };
};

/** An ascending list of positive numbers, or null when the field is unusable. */
const normalizeLadder = (raw: unknown): number[] | null => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const steps = raw.map(asCount);
  return steps.every((step) => step > 0) ? steps : null;
};

const normalizeConstants = (raw: unknown): CosmeticConstants => {
  const row = asRecord(raw) ?? {};
  return {
    cardTierCosts:
      normalizeLadder(row.cardTierCosts) ?? FALLBACK_CONSTANTS.cardTierCosts,
    tokenRimThresholds:
      normalizeLadder(row.tokenRimThresholds) ??
      FALLBACK_CONSTANTS.tokenRimThresholds,
  };
};

/**
 * Body → payload. Hero order is the API's and is preserved: it runs
 * games-descending, which is the order a player wants their own heroes in.
 */
export const normalizeCosmetics = (body: unknown): CosmeticsPayload => {
  const root = asRecord(body) ?? {};
  const raw = Array.isArray(root.heroes) ? root.heroes : [];
  const heroes: HeroCosmetics[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const hero = normalizeHero(entry);
    if (!hero || seen.has(hero.heroId)) continue;
    seen.add(hero.heroId);
    heroes.push(hero);
  }
  return { heroes, constants: normalizeConstants(root.constants) };
};

const failureFor = (status: number): CosmeticsFailure =>
  status === 401 ? "unauthorized" : status === 429 ? "rate_limited" : "unavailable";

/**
 * The signed-in player's cosmetic standing across every hero.
 *
 * The player id is never sent: the API derives it from the session cookie.
 */
export const fetchCosmetics = async (): Promise<CosmeticsResult> => {
  try {
    const res = await fetch(`${API_URL}/me/cosmetics`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      let degraded: CosmeticsPayload | null = null;
      try {
        // The 503 body carries the stored ledger — see (1). Anything else may
        // not, and a body we can't read is simply nothing more to learn.
        degraded = normalizeCosmetics(await res.json());
      } catch {
        /* no body, or not JSON */
      }
      return { ok: false, reason: failureFor(res.status), degraded };
    }
    return { ok: true, value: normalizeCosmetics(await res.json()) };
  } catch {
    return { ok: false, reason: "unavailable", degraded: null };
  }
};

/**
 * Human wording for a refused spend, built from the server's own numbers so
 * the toast says WHY rather than "something went wrong". The server is the
 * authority on both the balance and the ladder position; a 422 means this page
 * is stale, and the message is how the player finds that out.
 */
const spendMessage = (reason: SpendFailure, body: unknown): string => {
  const row = asRecord(body) ?? {};
  if (reason === "insufficient_points") {
    const cost = asNullableCount(row.cost);
    const available = asNullableCount(row.available);
    return cost !== null && available !== null
      ? `Not enough points — that upgrade costs ${cost} and you have ${available}.`
      : "Not enough points for that upgrade.";
  }
  if (reason === "invalid_tier") {
    const next = asNullableCount(row.nextTier);
    return next !== null
      ? `That card has moved on — tier ${next} is the next step.`
      : "That upgrade isn't the next step on this card's ladder.";
  }
  if (reason === "unauthorized") return "You've been signed out — sign in again to upgrade.";
  if (reason === "rate_limited") return "Slow down a moment, then try again.";
  return "Points are unavailable right now — try again in a minute.";
};

/**
 * Buy one tier step on one card set.
 *
 * `tier` is always the card's current tier + 1; the server re-checks that
 * inside its transaction, so two tabs racing on the same card produce one
 * upgrade and one honest 422 rather than two upgrades.
 *
 * A success answers the hero's WHOLE block as of the commit — balance, cards
 * and rim together — so the caller never has to guess at the new state or
 * refetch to find it. That is the rollback story too: there is no optimistic
 * write to roll back, because nothing moves until the server has agreed.
 */
export const postSpend = async (
  heroId: string,
  cardKey: string,
  tier: number,
): Promise<SpendResult> => {
  try {
    const res = await fetch(`${API_URL}/me/cosmetics/spend`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ heroId, cardKey, tier }),
    });
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* nothing more to learn */
      }
      const error = asString(asRecord(body)?.error);
      const reason: SpendFailure =
        res.status === 422
          ? error === "insufficient_points"
            ? "insufficient_points"
            : "invalid_tier"
          : failureFor(res.status);
      return { ok: false, reason, message: spendMessage(reason, body) };
    }
    const hero = normalizeHero(asRecord(await res.json())?.hero);
    // A 200 whose body we can't read means the points ARE spent; answering a
    // failure would invite a second click and a second charge.
    return hero
      ? { ok: true, hero }
      : { ok: false, reason: "unavailable", message: "Upgrade bought — reload to see it." };
  } catch {
    return { ok: false, reason: "unavailable", message: spendMessage("unavailable", null) };
  }
};

/**
 * Turn a hero's token rim on or off.
 *
 * Deliberately telemetry-free on the server, so it keeps working while stats
 * are unreachable — which is why the page leaves this toggle live even when
 * the rest of it is degraded.
 */
export const putTokenRim = async (
  heroId: string,
  enabled: boolean,
): Promise<TokenRimResult> => {
  try {
    const res = await fetch(`${API_URL}/me/cosmetics/token-rim`, {
      method: "PUT",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ heroId, enabled }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: failureFor(res.status) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

// --- presentation helpers ----------------------------------------------------
// Pure, so every number and label on the page is testable without a DOM.

/** A hero with nothing bought and nothing known — the shape a fresh hero has. */
export const emptyHeroCosmetics = (
  heroId: string,
  known: boolean,
): HeroCosmetics => ({
  heroId,
  // `known` is the degradation flag: during an outage a hero the API didn't
  // mention has UNKNOWN points, not zero, and must read as such.
  earned: known ? 0 : null,
  spent: 0,
  adjusted: 0,
  available: known ? 0 : null,
  cards: [],
  tokenRim: { unlockedTier: known ? 0 : null, enabled: false },
});

/** Tier bought on one card set; 0 for an un-upgraded one. */
export const cardTier = (hero: HeroCosmetics, cardKey: string): number =>
  hero.cards.find((card) => card.key === cardKey)?.tier ?? 0;

/**
 * The rim paint for a numeric tier, or null for "no rim". A tier beyond the
 * client's known ladder clamps to the top paint rather than rendering nothing:
 * an API that grew a fifth tier should look like a very good rim on an old
 * client, not like a missing one.
 */
export const rimTierName = (tier: number | null): CosmeticRimTier | null => {
  if (tier === null || tier <= 0) return null;
  return COSMETIC_RIM_TIERS[Math.min(tier, COSMETIC_RIM_TIERS.length) - 1];
};

/** Cost of stepping a card from `currentTier` to the next, or null when maxed. */
export const nextTierCost = (
  constants: CosmeticConstants,
  currentTier: number,
): number | null => constants.cardTierCosts[currentTier] ?? null;

export interface RimProgress {
  /** Tiers unlocked so far (0-based count), or null when points are unknown. */
  tier: number | null;
  /** Earned points the next tier needs, or null when the ladder is topped out. */
  nextThreshold: number | null;
  /** Points still to earn for the next tier. */
  toGo: number | null;
  /** Whole percent of the way from the current tier's floor to the next. */
  percent: number;
}

/**
 * Progress toward the next token-rim tier. Measured in EARNED points, which is
 * the whole point of the rim: it records what you have done on a hero, and
 * spending on card art can never walk it back.
 */
export const rimProgress = (
  earned: number | null,
  thresholds: number[],
): RimProgress => {
  if (earned === null) return { tier: null, nextThreshold: null, toGo: null, percent: 0 };
  const tier = thresholds.filter((threshold) => earned >= threshold).length;
  const nextThreshold = thresholds[tier] ?? null;
  if (nextThreshold === null) return { tier, nextThreshold: null, toGo: null, percent: 100 };
  const floor = tier > 0 ? (thresholds[tier - 1] ?? 0) : 0;
  // A producer that shipped a non-ascending ladder would divide by zero or
  // flip the bar; the span is floored and the percent clamped so the worst
  // case is a bar in the wrong place, never a broken one.
  const span = Math.max(1, nextThreshold - floor);
  return {
    tier,
    nextThreshold,
    toGo: Math.max(0, nextThreshold - earned),
    percent: Math.max(0, Math.min(100, Math.round(((earned - floor) / span) * 100))),
  };
};

// --- the equip wire (#615) ---------------------------------------------------

/**
 * One hero's loadout, projected into what the JOIN_ROOM encoder wants
 * (`lib/pro/cosmeticsWire.ts`).
 *
 * Two decisions live here rather than in the encoder, because both are facts
 * about what the API means rather than about the wire format:
 *
 * 1. **A rim the player switched OFF is not published.** `tokenRim.enabled` is
 *    exactly that opt-out, and honouring it client-side is what makes the
 *    /collection toggle mean something to the other seat.
 * 2. **`unlockedTier: null` publishes nothing.** During a telemetry outage the
 *    API says "we don't know" rather than a number (see (2) in the header), and
 *    claiming a rim we could not confirm is the one way this could show someone
 *    a tier they had not earned. Card rows are the API's own storage and
 *    survive the outage, so they still publish.
 *
 * A `<hero>-spice` remix falls back to its base hero's row, matching the rest
 * of the client's spice convention (a remix shares its base hero's display name
 * and art) and the debug registry's own fallback — so a player who upgraded
 * Thetis wears those rims on Thetis-spice too. Deliberately NOT folded into the
 * hook's `heroFor`, which is the /collection page's own lookup and must keep
 * treating a remix as its own row.
 *
 * Answers null when there is nothing to publish, which is what keeps a
 * JOIN_ROOM byte-identical to a pre-#392 one.
 */
export const wireLoadoutFor = (
  heroes: readonly HeroCosmetics[] | null | undefined,
  heroId: string | null | undefined,
): CosmeticLoadout | null => {
  if (!heroes || !heroId) return null;
  const id = heroId.trim().toLowerCase();
  const hero =
    heroes.find((row) => row.heroId.trim().toLowerCase() === id) ??
    (id.endsWith("-spice")
      ? heroes.find((row) => row.heroId.trim().toLowerCase() === id.slice(0, -6))
      : undefined);
  if (!hero) return null;
  const tokenRimTier = hero.tokenRim.enabled ? (hero.tokenRim.unlockedTier ?? 0) : 0;
  if (tokenRimTier <= 0 && hero.cards.length === 0) return null;
  return { tokenRimTier, cards: hero.cards };
};
