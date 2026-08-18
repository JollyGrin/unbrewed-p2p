/**
 * The cosmetic rim ladder — shared tier grammar for the card rim (#612) and the
 * fighter-token rim (#613), plus the local debug equip registry both read.
 *
 * Design doc §5 ("metallic frame ladder"), verdicts §9c (cards) and §10b
 * (tokens): four ORDERED tiers that read as a progression at a glance —
 * bronze → silver → antiqued gold → static iridescent.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what something LOOKS like and nothing
 * else. Nothing here reaches the engine, a log line, a legal action, a bot, a
 * replay outcome, or a token's hitbox/position/badges. Every consumer renders
 * additive chrome with `pointerEvents: none` and falls silently back to the
 * plain surface when no tier is equipped.
 *
 * Two vocabulary rules from §9b/§10a are baked into the values below and must
 * survive any re-tune:
 *
 *   1. **Material, never signal.** Game state speaks in FLAT single hues at or
 *      outside the edge (seat colours `#E0A82E`/`#3B8BEB`/`#2F9E68`/`#C0449E`,
 *      the white selection ring, the teal ally halo, pulsing gold targets).
 *      Cosmetics speak in multi-stop metallic gradients INSIDE the edge. Every
 *      ladder value here is a multi-stop conic gradient for exactly that
 *      reason — a single-colour rim would be indistinguishable from a signal.
 *   2. **No hue cycling, ever.** These are static paints. The tier-4 rim is
 *      "static iridescent": many hues frozen in place, never an animated sweep
 *      (an animated hue passes through every signal colour each loop).
 *
 * The tier-3 gold is deliberately ANTIQUED — darker, browner, lower-chroma than
 * seat gold `#E0A82E` — so a p1 hero's rim can never be mistaken for the seat
 * disc or the pulsing gold target ring.
 */

/** The ladder, in ascending order. Index = rank; the array IS the ordering. */
export const COSMETIC_RIM_TIERS = ["bronze", "silver", "gold", "iridescent"] as const;

export type CosmeticRimTier = (typeof COSMETIC_RIM_TIERS)[number];

export interface CosmeticRimPaint {
  /** Human label for debug UI / tooltips. Never shown as game information. */
  label: string;
  /** The ring paint: a multi-stop conic gradient (see rule 1 above). */
  ring: string;
}

/**
 * The four rims. Consumers paint `ring` on a disc/rect and mask it down to a
 * band — the gradient is shared so the card ladder and the token ladder are
 * visibly the SAME four rewards on two surfaces.
 */
export const COSMETIC_RIM_PAINTS: Record<CosmeticRimTier, CosmeticRimPaint> = {
  bronze: {
    label: "Bronze",
    ring: "conic-gradient(from 218deg, #4a2a12 0deg, #b4763f 34deg, #f0c99a 70deg, #8a5127 108deg, #3c2210 150deg, #a86a37 196deg, #e8bd8b 232deg, #7a4622 274deg, #33200f 312deg, #4a2a12 360deg)",
  },
  silver: {
    label: "Silver",
    ring: "conic-gradient(from 218deg, #5c636d 0deg, #b9c2cc 34deg, #ffffff 70deg, #8d959f 108deg, #4a5058 150deg, #aeb7c1 196deg, #f2f6fa 232deg, #7d858f 274deg, #454b53 312deg, #5c636d 360deg)",
  },
  gold: {
    label: "Antiqued gold",
    ring: "conic-gradient(from 218deg, #3b3113 0deg, #8f7c33 34deg, #d8c88c 70deg, #6d5c22 108deg, #2e2710 150deg, #a08c45 196deg, #c9b878 232deg, #5c4d1c 274deg, #262009 312deg, #3b3113 360deg)",
  },
  iridescent: {
    label: "Iridescent",
    ring: "conic-gradient(from 218deg, #7fb6d9 0deg, #cfa9e8 42deg, #f7b6cd 84deg, #f6e2a8 126deg, #a8e6c4 168deg, #8fc6e8 210deg, #d5b9f0 252deg, #ffd0e0 294deg, #eaf3ff 330deg, #7fb6d9 360deg)",
  },
};

export const isCosmeticRimTier = (v: unknown): v is CosmeticRimTier =>
  typeof v === "string" && (COSMETIC_RIM_TIERS as readonly string[]).includes(v);

/**
 * What one hero has equipped. Slots are OPTIONAL and independent — the token
 * rim (#613) and the card rim (#612) each read only their own key, so the two
 * tickets extend this shape side by side without colliding.
 */
export interface CosmeticEquip {
  /** Rim on the hero's fighter token on the /pro board (#613). */
  tokenRim?: CosmeticRimTier;
  /** Rim on the hero's cards (#612). */
  cardRim?: CosmeticRimTier;
}

/**
 * Local debug equip registry — the ONLY source of equipped cosmetics until the
 * account/unlock plumbing lands (design doc §3/§4b: the real source is an
 * opaque per-seat blob the engine stores and echoes, never interprets).
 *
 * Shape: `{ [heroId]: { tokenRim?: tier, cardRim?: tier } }`, e.g.
 *
 *     localStorage.setItem("pro:cosmetics:debug",
 *       JSON.stringify({ "thetis": { tokenRim: "gold" } }))
 *
 * It is DEBUG-ONLY and local: it never crosses the wire, so an opponent sees
 * nothing. Malformed JSON, unknown heroes and unknown tier names all resolve to
 * "no cosmetic" — the surface falls silently back to plain.
 */
export const COSMETICS_DEBUG_KEY = "pro:cosmetics:debug";

type EquipRegistry = Record<string, CosmeticEquip>;

// Memoized on first read, like lib/flags' store: this is consulted per fighter
// per render, and re-parsing JSON on every board frame would be silly. A debug
// equip therefore takes effect on reload — documented, and the test reset below
// is what lets a test change it mid-suite.
let cache: EquipRegistry | null = null;

const parseRegistry = (raw: string | null): EquipRegistry => {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: EquipRegistry = {};
    for (const [heroId, slots] of Object.entries(parsed as Record<string, unknown>)) {
      if (!slots || typeof slots !== "object") continue;
      const { tokenRim, cardRim } = slots as Record<string, unknown>;
      const equip: CosmeticEquip = {};
      if (isCosmeticRimTier(tokenRim)) equip.tokenRim = tokenRim;
      if (isCosmeticRimTier(cardRim)) equip.cardRim = cardRim;
      if (equip.tokenRim || equip.cardRim) out[heroId.trim().toLowerCase()] = equip;
    }
    return out;
  } catch {
    return {};
  }
};

/** The parsed registry ({} on the server, on malformed JSON, or when unset). */
export const readCosmeticsDebug = (): EquipRegistry => {
  if (cache) return cache;
  if (typeof window === "undefined") return {};
  cache = parseRegistry(window.localStorage.getItem(COSMETICS_DEBUG_KEY));
  return cache;
};

/** Drops the memoized registry so a test (or a debug console) can re-seed it. */
export const __resetCosmeticsForTest = () => {
  cache = null;
};

/**
 * What a hero has equipped. A `<hero>-spice` remix falls back to its base hero's
 * entry, matching the rest of the client's spice convention (a remix shares its
 * base hero's display name and art), so equipping "thetis" rims both.
 */
export const cosmeticEquipFor = (heroId?: string | null): CosmeticEquip => {
  if (!heroId) return {};
  const registry = readCosmeticsDebug();
  const id = heroId.trim().toLowerCase();
  return registry[id] ?? (id.endsWith("-spice") ? (registry[id.slice(0, -6)] ?? {}) : {});
};
