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
  HERO_STATE_COUNTERS,
  flagChipsFor,
  counterChipsFor,
  fighterTokenBadgeFor,
  fighterTokenCounterBadgeFor,
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
    // issue #335: every form also swaps the HERO-token portrait. issue #385: the
    // rim badge stays ON alongside the portrait (hideBadgeWhenArt off/absent), so
    // the form reads on all three surfaces at once.
    expect(forms.every((e) => e.tokenArt?.on && !e.hideBadgeWhenArt)).toBe(true);
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
    ["DRUID_FORM_HUMAN", "NIGHT ELF"],
  ])("shows exactly one druid-form chip (%s) for the active form", (flag, label) => {
    const chips = flagChipsFor("malfurion-stormrage", { [flag]: true });
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.flag).toBe(flag);
    expect(chips[0].chip.onLabel).toBe(label);
    expect(chips[0].on).toBe(true);
  });

  it("defaults Malfurion's nameplate to NIGHT ELF when no form flag is set", () => {
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
    ["DRUID_FORM_HUMAN", "Night Elf", "✦"],
    ["DRUID_FORM_BEAR", "Bear", "🐾"],
    ["DRUID_FORM_MOONKIN", "Moonkin", "☾"],
  ])("maps Malfurion %s form flags to token badges", (flag, label, icon) => {
    expect(fighterTokenBadgeFor("malfurion-stormrage", { [flag]: true })).toMatchObject({
      label,
      title: `${label} Form`,
      icon,
    });
  });

  it("defaults Malfurion's token to Night Elf Form when form flags are absent", () => {
    expect(fighterTokenBadgeFor("malfurion-stormrage", {})).toMatchObject({ label: "Night Elf" });
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

  it.each([
    ["DRUID_FORM_BEAR", /token-malfurion-bear\.webp$/],
    ["DRUID_FORM_MOONKIN", /token-malfurion-moonkin\.webp$/],
    ["DRUID_FORM_HUMAN", /token-malfurion\.webp$/],
  ])("swaps Malfurion to the %s portrait bust (issue #335)", (flag, pattern) => {
    expect(fighterTokenArtFor("malfurion-stormrage", { [flag]: true })).toMatch(pattern);
  });

  it("defaults Malfurion's portrait to the Night Elf bust when no form flag is set", () => {
    expect(fighterTokenArtFor("malfurion-stormrage", {})).toMatch(/token-malfurion\.webp$/);
    expect(fighterTokenArtFor("malfurion-stormrage", undefined)).toMatch(/token-malfurion\.webp$/);
  });

  it("returns null for a hero/state with no tokenArt entry (fixed portrait kept)", () => {
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

  it("keeps Malfurion's form rim badge ALONGSIDE the portrait bust (issue #385)", () => {
    // Regression from #337: the rim badge (🐾 / ☾ / ✦) must render together with
    // the swapped portrait, not be suppressed by it. hideBadgeWhenArt is off here.
    expect(fighterTokenStateFor("malfurion-stormrage", { DRUID_FORM_BEAR: true })).toEqual({
      badge: expect.objectContaining({ icon: "🐾", label: "Bear", title: "Bear Form" }),
      heroArtUrl: expect.stringMatching(/token-malfurion-bear\.webp$/),
    });
    expect(fighterTokenStateFor("malfurion-stormrage", { DRUID_FORM_MOONKIN: true })).toEqual({
      badge: expect.objectContaining({ icon: "☾", label: "Moonkin", title: "Moonkin Form" }),
      heroArtUrl: expect.stringMatching(/token-malfurion-moonkin\.webp$/),
    });
    // No form flag → Night Elf bust (group default), rim badge still shown.
    expect(fighterTokenStateFor("malfurion-stormrage", {})).toEqual({
      badge: expect.objectContaining({ icon: "✦", label: "Night Elf", title: "Night Elf Form" }),
      heroArtUrl: expect.stringMatching(/token-malfurion\.webp$/),
    });
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
    expect(state.p1!.heroArtUrl).toMatch(/token-malfurion-bear\.webp$/);
    // #385: Malfurion keeps his rim badge alongside the portrait.
    expect(state.p1!.badge).toMatchObject({ icon: "🐾" });
    expect(state.p2!.heroArtUrl).toMatch(/token-thetis-high\.webp$/);
    // Thetis tide portrait is intentionally badge-free (hideBadgeWhenArt).
    expect(state.p2!.badge).toBeNull();
    expect(state.p3).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Counter-driven states (issue #420: Nancy Drew's CLUE economy). Same two render
// surfaces as flags, driven by the numeric PlayerView.counters field instead.
// ---------------------------------------------------------------------------

describe("HERO_STATE_COUNTERS registry", () => {
  it("registers Nancy's CLUE counter on the exact engine key (singular)", () => {
    const clue = HERO_STATE_COUNTERS.find((e) => e.heroes.includes("nancy-drew"));
    expect(clue).toBeDefined();
    // Engine emits the counter under key `CLUE` (nancy-drew.rules.ts:
    // { name: 'CLUE', max: 5 }) — NOT the "CLUES" flavor plural.
    expect(clue!.counter).toBe("CLUE");
    expect(clue!.nameplate?.labelTemplate).toBe("CLUES: {n}");
    expect(clue!.token).toMatchObject({ title: "CLUES" });
  });
});

describe("counterChipsFor (HUD nameplate)", () => {
  it("shows a CLUES pill with the live value when Nancy has clues", () => {
    const chips = counterChipsFor("nancy-drew", { CLUE: 3 });
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.onLabel).toBe("CLUES: 3");
    expect(chips[0].on).toBe(true);
    // namespaced flag key so it can't collide with a boolean-flag glyph
    expect(chips[0].chip.flag).toBe("counter:CLUE");
  });

  it("hides the pill at 0 (and when the counter is absent)", () => {
    expect(counterChipsFor("nancy-drew", { CLUE: 0 })).toEqual([]);
    expect(counterChipsFor("nancy-drew", {})).toEqual([]);
    expect(counterChipsFor("nancy-drew", undefined)).toEqual([]);
  });

  it("renders on EITHER seat's plate — the function is owner-agnostic (counters are public)", () => {
    // same resolver drives self and opponent plates; both show the opponent's clues
    expect(counterChipsFor("nancy-drew", { CLUE: 5 })[0].chip.onLabel).toBe("CLUES: 5");
  });

  it("renders no counter chip for a non-registered hero, even with a stray counter", () => {
    expect(counterChipsFor("king-kong", { CLUE: 4 })).toEqual([]);
  });
});

describe("fighterTokenCounterBadgeFor (board token)", () => {
  it("badges Nancy's token with the numeric CLUE count", () => {
    expect(fighterTokenCounterBadgeFor("nancy-drew", { CLUE: 4 })).toMatchObject({
      icon: "🔍",
      label: "4",
      title: "CLUES: 4",
    });
  });

  it("hides the badge at 0 / absent", () => {
    expect(fighterTokenCounterBadgeFor("nancy-drew", { CLUE: 0 })).toBeNull();
    expect(fighterTokenCounterBadgeFor("nancy-drew", {})).toBeNull();
    expect(fighterTokenCounterBadgeFor("nancy-drew", undefined)).toBeNull();
  });

  it("does not badge non-registered heroes", () => {
    expect(fighterTokenCounterBadgeFor("king-kong", { CLUE: 3 })).toBeNull();
    expect(fighterTokenCounterBadgeFor(undefined, { CLUE: 3 })).toBeNull();
  });
});

describe("fighterTokenStateByOwner with counters", () => {
  it("resolves Nancy's CLUE badge from counters for any owner, hidden at 0", () => {
    const state = fighterTokenStateByOwner([
      { id: "p1", heroId: "nancy-drew", counters: { CLUE: 2 } }, // self
      { id: "p2", heroId: "nancy-drew", counters: { CLUE: 0 } }, // absent at 0
      { id: "p3", heroId: "thetis", flags: { HIGH_TIDE: true } }, // flag hero unaffected
    ]);
    expect(state.p1!.badge).toMatchObject({ label: "2", title: "CLUES: 2" });
    expect(state.p1!.heroArtUrl).toBeNull();
    expect(state.p2).toBeUndefined(); // 0 clues → no badge, omitted
    expect(state.p3!.heroArtUrl).toMatch(/token-thetis-high\.webp$/);
  });

  it("gives a flag-driven badge precedence over a counter badge if a hero had both", () => {
    // Academic today (no hero declares both), but keeps the single badge slot
    // deterministic. Malfurion's rim badge wins over any counter.
    const state = fighterTokenStateByOwner([
      { id: "p1", heroId: "malfurion-stormrage", flags: { DRUID_FORM_BEAR: true }, counters: { CLUE: 9 } },
    ]);
    expect(state.p1!.badge).toMatchObject({ icon: "🐾" });
  });
});
