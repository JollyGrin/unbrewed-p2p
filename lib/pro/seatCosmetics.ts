/**
 * The RECEIVING half of the equip wire (#615): every seat's `cosmetics` blob,
 * decoded once per snapshot into the two lookups the render tickets need.
 *
 * ⛔ THE INVARIANT — a cosmetic changes what a card LOOKS like and nothing
 * else. Nothing resolved here reaches the engine, a log line, a legal action, a
 * bot, a replay outcome, or a card's identity. Every failure mode — an
 * unparseable blob, an unknown hash, a seat that published nothing — is "base
 * art", never an error.
 *
 * ## Two lookups, keyed differently on purpose
 *
 * - **`bySeat`** — the fighter-token rim. `ViewFighter` carries an OWNER, so the
 *   token can be exact: seat p1's rim comes from seat p1's blob.
 * - **`byHero`** — the card rims. A resolved card knows only its `(heroId,
 *   title)` — instance ids are `heroId/card#n` and carry no seat — so card
 *   cosmetics can only be hero-keyed. In a MIRROR match (both seats on one
 *   hero) the two loadouts collapse onto one key, and YOUR OWN seat wins:
 *   seeing the rims you earned on the cards you play beats seeing the
 *   opponent's on both halves of the table. This is the one place the wire is
 *   lossy, it is cosmetic-only, and it is the price of never letting a cosmetic
 *   fork card identity (design doc, structural enforcement §3).
 *
 * ## Precedence over the debug registry
 *
 * A seat that published a blob is resolved ENTIRELY from that blob — the local
 * `pro:cosmetics:debug` registry does not top it up. The wire is what the other
 * player sees, so letting local state add rims on top would put a player's own
 * screen out of step with every other screen at the table. The debug registry
 * stays exactly as it was for seats with no wire loadout, which is what keeps
 * it usable while signed out (design doc §3, "ship it unsigned as a local
 * dev/debug toggle").
 */
import { norm } from "./cardAppearance";
import { CosmeticRimTier, cosmeticEquipFor } from "./cosmetics";
import {
  NO_COSMETICS,
  WireCosmetics,
  decodeCosmetics,
  wireCardRim,
} from "./cosmeticsWire";

/** The seat fields this resolver reads — a structural subset of `ViewPlayer`. */
export interface CosmeticSeat {
  id: string;
  heroId: string;
  you?: boolean;
  /** Opaque, verbatim from the engine; absent when the seat claimed none. */
  cosmetics?: string;
}

/**
 * Decoded loadouts for one snapshot. A MISSING key means "this seat/hero has no
 * wire loadout" and falls back to the debug registry; a key holding
 * {@link NO_COSMETICS} means "resolved, and the answer is nothing" — which is
 * how a hidden opponent stays hidden even when the local registry has an opinion
 * about their hero.
 */
export interface SeatCosmetics {
  bySeat: Record<string, WireCosmetics>;
  byHero: Record<string, WireCosmetics>;
  /** True when at least one OTHER seat published something (drives the toggle chip). */
  hasOpponentCosmetics: boolean;
}

export const NO_SEAT_COSMETICS: SeatCosmetics = {
  bySeat: {},
  byHero: {},
  hasOpponentCosmetics: false,
};

/**
 * Decode every seat's blob.
 *
 * `hideOthers` is the "Hide opponent cosmetics" setting: other seats resolve to
 * {@link NO_COSMETICS} while your own is untouched, so turning it on never
 * costs you the rewards you equipped. It is applied here, at the single decode
 * point, rather than at each render site — a surface that forgot to ask would
 * otherwise leak an opponent's cosmetics through with the setting on.
 *
 * `hasOpponentCosmetics` reports what the SEATS carried, before hiding, so the
 * HUD can keep offering the toggle that is currently hiding them.
 */
export const seatCosmetics = (
  seats: readonly CosmeticSeat[] | null | undefined,
  opts: { hideOthers?: boolean } = {},
): SeatCosmetics => {
  if (!seats || seats.length === 0) return NO_SEAT_COSMETICS;
  const bySeat: Record<string, WireCosmetics> = {};
  const byHero: Record<string, WireCosmetics> = {};
  let hasOpponentCosmetics = false;

  // Own seat(s) first, so a mirror match resolves its shared hero key to the
  // local player's loadout (see the note above).
  const ordered = [...seats].sort((a, b) => Number(!!b.you) - Number(!!a.you));
  for (const seat of ordered) {
    const mine = !!seat.you;
    const claimed = typeof seat.cosmetics === "string" && seat.cosmetics !== "";
    if (!mine && claimed) hasOpponentCosmetics = true;
    // Hiding pins the seat to "nothing" rather than leaving it unresolved, so
    // the debug registry cannot paint an opponent the setting is hiding.
    const hidden = !mine && !!opts.hideOthers;
    if (!claimed && !hidden) continue; // unresolved -> debug registry
    const decoded = hidden ? NO_COSMETICS : decodeCosmetics(seat.cosmetics);
    bySeat[seat.id] = decoded;
    if (seat.heroId && !byHero[seat.heroId]) byHero[seat.heroId] = decoded;
  }
  return { bySeat, byHero, hasOpponentCosmetics };
};

/**
 * The rim on one card, wire first and the debug registry second.
 *
 * This is what `useProCardArt` consults for every render path, so it is the
 * single point where "what the table sees" beats "what this browser was told to
 * pretend". A hero with no wire loadout falls through to the local registry
 * unchanged.
 */
export const cardRimForSeats = (
  cosmetics: SeatCosmetics | null | undefined,
  heroId: string | null | undefined,
  title: string,
): CosmeticRimTier | null => {
  if (!heroId) return null;
  const wire = cosmetics?.byHero[heroId];
  if (wire) return wireCardRim(wire, title);
  return cosmeticEquipFor(heroId).cards?.[norm(title)] ?? null;
};

/**
 * The token rim for one seat, wire first and the debug registry second — the
 * seat-exact counterpart of {@link cardRimForSeats}.
 */
export const tokenRimForSeat = (
  cosmetics: SeatCosmetics | null | undefined,
  seatId: string | null | undefined,
  heroId: string | null | undefined,
): CosmeticRimTier | null => {
  const wire = seatId ? cosmetics?.bySeat[seatId] : undefined;
  if (wire) return wire.tokenRim;
  return cosmeticEquipFor(heroId).tokenRim ?? null;
};

/**
 * The per-seat blobs frozen into a replay bundle (`ReplayPlayerSetup.cosmetics`,
 * engine #392), so an old replay re-renders with the skins it was actually
 * played with rather than today's.
 *
 * RENDER-ONLY on this side too: the value is read off `config.players` purely to
 * paint, exactly as the engine strips it before the setup reaches its reducer.
 * Pre-#392 bundles carry none and render base art.
 */
export const replayCosmetics = (
  bundle: { config?: { players?: Record<string, { cosmetics?: string }> } } | null | undefined,
): Record<string, string> => {
  const players = bundle?.config?.players;
  if (!players || typeof players !== "object") return {};
  const out: Record<string, string> = {};
  for (const [seatId, setup] of Object.entries(players)) {
    const blob = setup?.cosmetics;
    if (typeof blob === "string" && blob !== "") out[seatId] = blob;
  }
  return out;
};
