/**
 * Unified hero-state flag registry (issues #329, #330). One HERO_STATE_FLAGS
 * entry per flag drives ALL surfaces — the HUD nameplate chip (flagChipsFor), the
 * fighter-token badge (fighterTokenBadgeFor), and the HERO-token portrait swap
 * (fighterTokenArtFor). These prove the resolvers are data-driven and generic:
 * the tide two-state flag and the exclusive druid-form group both light up
 * nameplate + token, tide additionally swaps its portrait art, and a
 * non-registered hero gets none of them.
 */
import {
  HERO_STATE_FLAGS,
  flagChipsFor,
  fighterTokenBadgeFor,
  fighterTokenArtFor,
  fighterTokenStateFor,
  fighterTokenStateByOwner,
} from "./heroStateFlags";

describe("HERO_STATE_FLAGS registry", () => {
  it("registers the tide flag for both Thetis heroes with both surfaces", () => {
    const tide = HERO_STATE_FLAGS.find((e) => e.flag === "HIGH_TIDE");
    expect(tide).toBeDefined();
    expect(tide!.heroes).toEqual(expect.arrayContaining(["thetis", "thetis-spice"]));
    expect(tide!.nameplate).toMatchObject({ onLabel: "HIGH TIDE", offLabel: "LOW TIDE", showWhenAbsent: true });
    expect(tide!.token?.on).toBeDefined();
    expect(tide!.token?.off).toBeDefined();
    // issue #330: tide also swaps the HERO-token portrait, and hides its badge.
    expect(tide!.tokenArt?.on).toMatch(/token-thetis-high\.webp$/);
    expect(tide!.tokenArt?.off).toMatch(/token-thetis-low\.webp$/);
    expect(tide!.hideBadgeWhenArt).toBe(true);
  });

  it("registers the three druid forms as an exclusive group with a default", () => {
    const forms = HERO_STATE_FLAGS.filter((e) => e.group === "druid-form");
    expect(forms.map((e) => e.flag)).toEqual([
      "DRUID_FORM_BEAR",
      "DRUID_FORM_MOONKIN",
      "DRUID_FORM_HUMAN",
    ]);
    expect(forms.every((e) => e.heroes.includes("malfurion-stormrage"))).toBe(true);
    expect(forms.filter((e) => e.isDefault).map((e) => e.flag)).toEqual(["DRUID_FORM_HUMAN"]);
    expect(forms.every((e) => e.nameplate && e.token)).toBe(true);
  });
});

describe("flagChipsFor (HUD nameplate)", () => {
  it("shows HIGH TIDE for a tide hero with the flag set", () => {
    const chips = flagChipsFor("thetis", { HIGH_TIDE: true });
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.flag).toBe("HIGH_TIDE");
    expect(chips[0].on).toBe(true);
  });

  it("shows LOW TIDE for a tide hero with the flag absent (showWhenAbsent)", () => {
    expect(flagChipsFor("thetis-spice", undefined)).toEqual([
      expect.objectContaining({ on: false }),
    ]);
    expect(flagChipsFor("thetis", { HIGH_TIDE: false })).toEqual([
      expect.objectContaining({ on: false }),
    ]);
  });

  it.each([
    ["DRUID_FORM_BEAR", "BEAR"],
    ["DRUID_FORM_MOONKIN", "MOONKIN"],
    ["DRUID_FORM_HUMAN", "HUMAN"],
  ])("shows exactly one druid-form chip (%s) for the active form", (flag, label) => {
    const chips = flagChipsFor("malfurion-stormrage", { [flag]: true });
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.flag).toBe(flag);
    expect(chips[0].chip.onLabel).toBe(label);
    expect(chips[0].on).toBe(true);
  });

  it("defaults Malfurion's nameplate to HUMAN when no form flag is set", () => {
    const chips = flagChipsFor("malfurion-stormrage", {});
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.flag).toBe("DRUID_FORM_HUMAN");
  });

  it("renders NO chip for a non-registered hero, even with a stray flag present", () => {
    expect(flagChipsFor("king-kong", undefined)).toEqual([]);
    expect(flagChipsFor("king-kong", { HIGH_TIDE: true })).toEqual([]);
  });
});

describe("fighterTokenBadgeFor (board token)", () => {
  it("gives a tide hero a token badge in BOTH tide states", () => {
    expect(fighterTokenBadgeFor("thetis", { HIGH_TIDE: true })).toMatchObject({ title: "High Tide" });
    expect(fighterTokenBadgeFor("thetis", { HIGH_TIDE: false })).toMatchObject({ title: "Low Tide" });
    expect(fighterTokenBadgeFor("thetis-spice", undefined)).toMatchObject({ title: "Low Tide" });
  });

  it.each([
    ["DRUID_FORM_HUMAN", "Human", "✦"],
    ["DRUID_FORM_BEAR", "Bear", "🐾"],
    ["DRUID_FORM_MOONKIN", "Moonkin", "☾"],
  ])("maps Malfurion %s form flags to token badges", (flag, label, icon) => {
    expect(fighterTokenBadgeFor("malfurion-stormrage", { [flag]: true })).toMatchObject({
      label,
      title: `${label} Form`,
      icon,
    });
  });

  it("defaults Malfurion's token to Human Form when form flags are absent", () => {
    expect(fighterTokenBadgeFor("malfurion-stormrage", {})).toMatchObject({ label: "Human" });
  });

  it("does not badge non-registered heroes", () => {
    expect(fighterTokenBadgeFor("achilles", { DRUID_FORM_BEAR: true })).toBeNull();
    expect(fighterTokenBadgeFor(undefined, { HIGH_TIDE: true })).toBeNull();
  });
});

describe("fighterTokenArtFor (portrait swap)", () => {
  it("swaps Thetis to the high-tide portrait when HIGH_TIDE is set", () => {
    expect(fighterTokenArtFor("thetis", { HIGH_TIDE: true })).toMatch(/token-thetis-high\.webp$/);
    expect(fighterTokenArtFor("thetis-spice", { HIGH_TIDE: true })).toMatch(/token-thetis-high\.webp$/);
  });

  it("swaps Thetis to the low-tide portrait when the flag is absent", () => {
    expect(fighterTokenArtFor("thetis", { HIGH_TIDE: false })).toMatch(/token-thetis-low\.webp$/);
    expect(fighterTokenArtFor("thetis-spice", undefined)).toMatch(/token-thetis-low\.webp$/);
  });

  it("returns null for a hero/state with no tokenArt entry (fixed portrait kept)", () => {
    // Malfurion forms declare badges but no art yet — resolution must not invent one.
    expect(fighterTokenArtFor("malfurion-stormrage", { DRUID_FORM_BEAR: true })).toBeNull();
    expect(fighterTokenArtFor("king-kong", { HIGH_TIDE: true })).toBeNull();
    expect(fighterTokenArtFor(undefined, { HIGH_TIDE: true })).toBeNull();
  });
});

describe("fighterTokenStateFor (badge + portrait, shared entry)", () => {
  it("suppresses the tide badge in favor of the portrait (hideBadgeWhenArt)", () => {
    expect(fighterTokenStateFor("thetis", { HIGH_TIDE: true })).toEqual({
      badge: null,
      heroArtUrl: expect.stringMatching(/token-thetis-high\.webp$/),
    });
    expect(fighterTokenStateFor("thetis", { HIGH_TIDE: false })).toEqual({
      badge: null,
      heroArtUrl: expect.stringMatching(/token-thetis-low\.webp$/),
    });
  });

  it("keeps the badge and no art override for a badge-only state (Malfurion)", () => {
    const st = fighterTokenStateFor("malfurion-stormrage", { DRUID_FORM_BEAR: true });
    expect(st.badge).toMatchObject({ label: "Bear" });
    expect(st.heroArtUrl).toBeNull();
  });

  it("returns an empty state for a non-registered hero", () => {
    expect(fighterTokenStateFor("king-kong", {})).toEqual({ badge: null, heroArtUrl: null });
  });
});

describe("fighterTokenStateByOwner", () => {
  it("keys resolved badge+art by owner and omits owners with neither", () => {
    const state = fighterTokenStateByOwner([
      { id: "p1", heroId: "malfurion-stormrage", flags: { DRUID_FORM_BEAR: true } },
      { id: "p2", heroId: "thetis", flags: { HIGH_TIDE: true } },
      { id: "p3", heroId: "king-kong", flags: {} },
    ]);
    expect(state.p1).toMatchObject({ badge: { label: "Bear" }, heroArtUrl: null });
    expect(state.p2!.heroArtUrl).toMatch(/token-thetis-high\.webp$/);
    expect(state.p2!.badge).toBeNull();
    expect(state.p3).toBeUndefined();
  });
});
