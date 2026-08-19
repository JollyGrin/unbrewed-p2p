/**
 * The equip WIRE (#615, design doc §3/§4b) — how one seat's cosmetic loadout
 * crosses to the other player.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what a card LOOKS like and nothing
 * else. The engine reads an upgraded card byte-for-byte identically to a plain
 * one. No cosmetic may change any game state, any legal move, any bot decision,
 * any log line, any replay outcome, any balance number, or any card identity —
 * ever.
 *
 * The blob is **ids only** — never a URL, never inline data, never anything the
 * engine parses. Its ENTIRE relationship with the server is "store it, echo it,
 * cap it" (engine #392, `validateCosmetics`): 512 bytes of UTF-8, echoed
 * verbatim on `ViewPlayer.cosmetics` and frozen into `ReplayPlayerSetup`.
 *
 * ## Encoding v1 (a fixed contract — read it as frozen)
 *
 *     c1;t<rimTier>;<hash><tier>,<hash><tier>,...
 *
 * - `c1` — the version tag. A blob whose FIRST field is anything else is
 *   ignored ENTIRELY: a v2 encoding is a different grammar, and guessing at
 *   half of it would paint the wrong rims rather than none.
 * - `t<rimTier>` — the fighter-token rim, present only when it is both unlocked
 *   and switched on. Optional field, so `c1;a1b2c31` (no token rim) and
 *   `c1;t3;a1b2c31` are both well-formed and the parser keys off the leading
 *   `t` rather than off a position.
 * - `<hash><tier>` — one card entry. `hash` is {@link cosmeticTitleHash}, tier
 *   is a single digit `1..4` indexing {@link COSMETIC_RIM_TIERS}. Cards at tier
 *   0 (base art) are simply absent.
 *
 * ## Why a title HASH and not a title, an index, or a card id
 *
 * `norm(title)` is already the art-matching key everywhere in the client
 * (`useProCardArt.ts`), so a hash of it is stable across snapshot bumps and
 * costs ~7 bytes instead of ~20. Crucially it degrades PER ENTRY: a hash this
 * client cannot match loses ONE card's rim, never the loadout — which is the
 * same "art is a nicety, never a dependency" contract the snapshot art already
 * has, extended one hop.
 *
 * A positional bitmask over snapshot card order would be smaller and is
 * deliberately NOT used: it couples cosmetics to card ordering, which the deck
 * digest lock does not protect, so a reordered snapshot would silently shift
 * every player's rims onto the wrong cards (design doc §4b).
 *
 * ## Resolution is by hash, both ways
 *
 * The receiver never reverses a hash. It hashes the `norm(title)` it is already
 * holding and looks THAT up, so decoding needs no snapshot, no manifest and no
 * fetch — an unmatched entry is simply an entry nobody asks about. A collision
 * (2^32 keyspace, ~30 titles per deck) would put the wrong metal on one card;
 * that is a cosmetic misfire with zero gameplay consequence, which is the
 * budget this whole encoding is allowed to spend.
 *
 * Nothing here throws. Every function's failure mode is "no cosmetic".
 */
import { norm } from "./cardAppearance";
import { COSMETIC_RIM_TIERS, CosmeticRimTier } from "./cosmetics";

/** The version tag this client writes, and the only one it reads. */
export const COSMETICS_WIRE_VERSION = "c1";

/**
 * Engine cap (server/identity.ts `COSMETICS_MAX_BYTES`), mirrored so we never
 * build a blob the join would REJECT. Unlike `displayName`, an over-cap
 * cosmetics field fails the whole message with BAD_MESSAGE — so the encoder
 * truncates itself rather than risk costing somebody their seat.
 */
export const COSMETICS_MAX_BYTES = 512;

/** Highest tier on the ladder; `COSMETIC_RIM_TIERS` is the ordering. */
export const MAX_COSMETIC_TIER = COSMETIC_RIM_TIERS.length;

/**
 * FNV-1a (32-bit) over the UTF-16 code units of `s`.
 *
 * Chosen for being tiny, dependency-free and already the family the engine uses
 * for its replay state hash — not for any cryptographic property. Nothing here
 * is a trust boundary: a hostile client can claim any loadout it likes, and the
 * worst outcome is that it renders rims it did not earn on its own screen and
 * one opponent's.
 */
export const fnv1a32 = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // Multiply by the 32-bit FNV prime (16777619) without overflowing a double.
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/**
 * The wire key for one card title: the first 6 base36 digits of
 * `fnv1a32(norm(title))`.
 *
 * `norm` is the art index's own key, so a rim can never miss a card the art
 * matched (or match one the art didn't). Six digits is a deliberate truncation
 * of the full 32-bit value — it trades a sliver of keyspace for a fixed
 * per-entry cost, and the parser reads the tier off the LAST character rather
 * than off a fixed offset, so a short hash stays legible either way.
 */
export const cosmeticTitleHash = (title: string): string =>
  fnv1a32(norm(title)).toString(36).slice(0, 6);

/**
 * Tier digit (1-based, as it appears on the wire) -> ladder tier, or null.
 *
 * STRICT, and deliberately unlike `rimTierName` in lib/account/cosmetics, which
 * clamps a beyond-the-ladder tier UP to the top paint. That clamp is right
 * there and wrong here: it reads points the player provably earned, while this
 * reads a number a remote client asserted. Clamping would hand anyone who
 * writes `9` the best rim on the ladder, forever, on every screen. An unknown
 * digit therefore costs exactly its own entry — which is also what makes the
 * ladder extensible: a future tier 5 shows as base art on this client rather
 * than impersonating tier 4.
 */
export const tierFromDigit = (digit: number): CosmeticRimTier | null =>
  Number.isInteger(digit) && digit >= 1 && digit <= MAX_COSMETIC_TIER
    ? COSMETIC_RIM_TIERS[digit - 1]
    : null;

/** Ladder tier -> the 1-based digit the wire carries. */
export const digitFromTier = (tier: CosmeticRimTier): number =>
  COSMETIC_RIM_TIERS.indexOf(tier) + 1;

/**
 * One hero's loadout as `GET /me/cosmetics` reports it (lib/account/cosmetics).
 * Tiers are the api's 1-based numbers, NOT ladder names — the translation to
 * `CosmeticRimTier` happens here so the api layer never has to know the client
 * has four metals rather than N.
 */
export interface CosmeticLoadout {
  /** Token-rim tier to publish, or 0/absent for none. */
  tokenRimTier?: number;
  /** Per-card tiers, keyed by the card key the api stores (a norm'd title). */
  cards?: readonly { key: string; tier: number }[];
}

/** A decoded blob: exactly what a receiver needs to paint one seat. */
export interface WireCosmetics {
  /** The seat's fighter-token rim, or null when it published none. */
  tokenRim: CosmeticRimTier | null;
  /** Card rims by {@link cosmeticTitleHash}; `{}` when none were published. */
  cardsByHash: Record<string, CosmeticRimTier>;
}

/** The "this seat claimed nothing" value. Frozen — it is handed out shared. */
export const NO_COSMETICS: WireCosmetics = Object.freeze({
  tokenRim: null,
  cardsByHash: Object.freeze({}) as Record<string, CosmeticRimTier>,
});

/**
 * UTF-8 length in BYTES, counted by hand rather than through `TextEncoder`.
 *
 * The cap the engine enforces is a byte cap, and this module is imported by the
 * sandbox card path too — where `TextEncoder` is a jsdom polyfill (see
 * jest.setup.js) rather than a given. Ten lines of arithmetic beat an
 * environment assumption. Every character this encoder actually emits is ASCII,
 * so the multi-byte branches exist to keep the guard honest, not to run.
 */
const utf8Bytes = (s: string): number => {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: the pair is one 4-byte code point.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
};

/**
 * Build the blob for ONE hero's loadout, or `undefined` when there is nothing
 * to say (which is what keeps a guest's JOIN_ROOM byte-identical to a pre-#392
 * one — the field is absent, not empty).
 *
 * Entries are emitted HIGHEST TIER FIRST, which is also the truncation order:
 * if a loadout ever grew past the 512-byte cap, the cheapest rims are the ones
 * dropped. A fully-upgraded 60-card loadout is ~485 bytes, so this is a
 * guardrail rather than a live code path — but the cap REJECTS the join rather
 * than truncating server-side, so the guardrail has to exist somewhere.
 */
export const encodeCosmetics = (
  loadout: CosmeticLoadout | null | undefined,
): string | undefined => {
  if (!loadout) return undefined;
  const tokenTier = tierFromDigit(loadout.tokenRimTier ?? 0);
  const entries = (loadout.cards ?? [])
    .map(({ key, tier }) => ({ key, tier: tierFromDigit(tier) }))
    // Tier 0 / off-ladder / malformed rows are simply not cosmetics.
    .filter((c): c is { key: string; tier: CosmeticRimTier } => !!c.tier && !!c.key)
    .sort((a, b) => digitFromTier(b.tier) - digitFromTier(a.tier))
    .map(({ key, tier }) => `${cosmeticTitleHash(key)}${digitFromTier(tier)}`);
  // A duplicate key would waste bytes saying the same thing twice.
  const unique = [...new Set(entries)];

  const head = tokenTier
    ? `${COSMETICS_WIRE_VERSION};t${digitFromTier(tokenTier)}`
    : COSMETICS_WIRE_VERSION;
  if (unique.length === 0) return tokenTier ? head : undefined;

  let blob = `${head};${unique.join(",")}`;
  while (unique.length > 0 && utf8Bytes(blob) > COSMETICS_MAX_BYTES) {
    unique.pop(); // lowest tier last, so this drops the cheapest rim first
    blob = unique.length ? `${head};${unique.join(",")}` : head;
  }
  return utf8Bytes(blob) > COSMETICS_MAX_BYTES ? undefined : blob;
};

// A card entry: 1-6 base36 hash digits then the tier digit. Anchored, so
// anything with a stray character in it is one dropped entry, not a thrown
// parse.
const ENTRY = /^([0-9a-z]{1,6})([0-9])$/;
const TOKEN_FIELD = /^t([0-9])$/;

/**
 * Parse a seat's blob. NEVER throws, for any input — including one no client of
 * ours wrote, since this reads a field a hostile peer controls completely.
 *
 * Degradation is per entry and per field: an unknown version tag ignores the
 * whole blob (a different grammar is not a damaged one), while inside a
 * recognised `c1` blob a malformed entry costs exactly that entry.
 */
export const decodeCosmetics = (
  blob: string | null | undefined,
): WireCosmetics => {
  if (typeof blob !== "string" || blob === "") return NO_COSMETICS;
  // Over-cap blobs cannot come from the engine (it rejects the join), so one
  // here is a peer talking to us directly. Refuse it whole rather than parse an
  // unbounded string.
  if (blob.length > COSMETICS_MAX_BYTES) return NO_COSMETICS;

  const [version, ...fields] = blob.split(";");
  if (version !== COSMETICS_WIRE_VERSION) return NO_COSMETICS;

  let tokenRim: CosmeticRimTier | null = null;
  const cardsByHash: Record<string, CosmeticRimTier> = {};

  for (const field of fields) {
    if (field === "") continue; // `c1;;a1b2c31` — an empty field says nothing
    const token = TOKEN_FIELD.exec(field);
    if (token) {
      // Last one wins; an off-ladder digit leaves the seat with no token rim
      // rather than failing the blob.
      tokenRim = tierFromDigit(Number(token[1]));
      continue;
    }
    for (const entry of field.split(",")) {
      const m = ENTRY.exec(entry);
      if (!m) continue;
      const tier = tierFromDigit(Number(m[2]));
      if (tier) cardsByHash[m[1]] = tier;
    }
  }

  return { tokenRim, cardsByHash };
};

/**
 * The rim a decoded blob puts on one card title, or null for base art.
 *
 * Hashing at LOOKUP time rather than reversing the hash is what makes this
 * total: an entry nobody asks about is inert, and a title nobody published is
 * simply absent. No snapshot, no manifest, no fetch.
 */
export const wireCardRim = (
  wire: WireCosmetics | null | undefined,
  title: string,
): CosmeticRimTier | null =>
  wire?.cardsByHash[cosmeticTitleHash(title)] ?? null;
