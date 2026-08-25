/**
 * `previewLoadoutFor` (#623) — the pure half of the deck-preview loadout: which
 * of a player's OWN upgrades the hero-preview modal is allowed to paint.
 *
 * The rendered behaviour is pinned in HeroPreviewModal.cosmetics.test.tsx;
 * these cover the projection rules that are cheaper to state than to render —
 * and the one (spice remixes) no fixture deck exercises.
 */
import { HeroCosmetics } from "./cosmetics";
import { previewLoadoutFor } from "./useHeroPreviewLoadout";

const hero = (over: Partial<HeroCosmetics> = {}): HeroCosmetics => ({
  heroId: "thetis",
  earned: 900,
  spent: 200,
  adjusted: 0,
  available: 700,
  cards: [{ key: "feint", tier: 1 }],
  tokenRim: { unlockedTier: 2, enabled: true, selectedTier: null },
  cardRims: { enabled: true, selectedTier: null },
  ...over,
});

describe("previewLoadoutFor", () => {
  it("maps card tiers and the token rim into ladder names", () => {
    expect(previewLoadoutFor([hero()], "thetis")).toEqual({
      cardRims: { feint: "bronze" },
      tokenRim: "silver",
    });
  });

  it("keys card rims by norm(title), so every copy of a set shares the tier", () => {
    const loadout = previewLoadoutFor(
      [hero({ cards: [{ key: "  Hokuto: Bone Demolisher  ", tier: 3 }] })],
      "thetis",
    );
    expect(loadout?.cardRims).toEqual({ "hokuto: bone demolisher": "gold" });
  });

  it("clamps a tier past the client's ladder to the top paint", () => {
    // An API that grew a fifth tier should look like a very good rim on an old
    // client, not like a missing one — these are points the player DID spend.
    const loadout = previewLoadoutFor([hero({ cards: [{ key: "feint", tier: 9 }] })], "thetis");
    expect(loadout?.cardRims.feint).toBe("iridescent");
  });

  it("hides a token rim the player switched off, keeping their card rims", () => {
    expect(
      previewLoadoutFor([hero({ tokenRim: { unlockedTier: 2, enabled: false, selectedTier: null } })], "thetis"),
    ).toEqual({ cardRims: { feint: "bronze" }, tokenRim: null });
  });

  it("hides a token rim telemetry could not confirm", () => {
    // `unlockedTier: null` is "we don't know", never "tier 0" — and painting a
    // tier we could not confirm is the one way this could show an unearned one.
    expect(
      previewLoadoutFor([hero({ tokenRim: { unlockedTier: null, enabled: true, selectedTier: null } })], "thetis")
        ?.tokenRim,
    ).toBeNull();
  });

  it("paints the tier the player PICKED, not the one they unlocked (#705)", () => {
    // The preview's whole job is "what will the table see?", so it goes
    // through the same projection the wire does: pick silver on a gold hero
    // and the preview says silver, immediately.
    expect(
      previewLoadoutFor(
        [
          hero({
            cards: [{ key: "feint", tier: 3 }],
            tokenRim: { unlockedTier: 3, enabled: true, selectedTier: 2 },
            cardRims: { enabled: true, selectedTier: 2 },
          }),
        ],
        "thetis",
      ),
    ).toEqual({ cardRims: { feint: "silver" }, tokenRim: "silver" });
  });

  it("falls a -spice remix back to its base hero's row", () => {
    expect(previewLoadoutFor([hero()], "thetis-spice")).toEqual({
      cardRims: { feint: "bronze" },
      tokenRim: "silver",
    });
  });

  it("answers null when there is nothing to paint", () => {
    const nothing = { cards: [], tokenRim: { unlockedTier: 0, enabled: true, selectedTier: null } };
    expect(previewLoadoutFor([hero(nothing)], "thetis")).toBeNull();
    // Unknown hero, no hero, no ledger — all simply nothing.
    expect(previewLoadoutFor([hero()], "kenshiro")).toBeNull();
    expect(previewLoadoutFor([hero()], null)).toBeNull();
    expect(previewLoadoutFor(null, "thetis")).toBeNull();
  });

  it("answers null when every card row is off-ladder junk", () => {
    // A hand-built row at tier 0 is not a rim; a toggle over nothing to paint
    // is worse than no toggle. (`normalizeCosmetics` drops such rows too.)
    expect(
      previewLoadoutFor(
        [hero({ cards: [{ key: "feint", tier: 0 }], tokenRim: { unlockedTier: 0, enabled: true, selectedTier: null } })],
        "thetis",
      ),
    ).toBeNull();
  });
});
