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

  it("carries the Doppelgänger's EQUILIBRIUM badge with no portrait override", () => {
    const state = fighterTokenStateByOwner([
      { id: "p1", heroId: "doppelganger", flags: { EQUILIBRIUM: true } },
      { id: "p2", heroId: "doppelganger", flags: {} },
    ]);
    expect(state.p1!.badge).toMatchObject({ icon: "⚖" });
    // Single hero portrait — the deck's fixed tokenImageUrl stands.
    expect(state.p1!.heroArtUrl).toBeNull();
    // No badge and no art off the stance ⇒ the owner is omitted entirely.
    expect(state.p2).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The Doppelgänger's EQUILIBRIUM stance (issue #545 ↔ engine #303). A standalone
// ONE-SIDED flag: both surfaces render only while the stance is held. Nancy's
// CLUE counter is the "both surfaces from one entry" template; this is the flag
// equivalent, and unlike Thetis's tide it has no ABSENT variant to draw.
// ---------------------------------------------------------------------------

describe("EQUILIBRIUM (Doppelgänger)", () => {
  it("registers on the exact engine flag key, with both surfaces", () => {
    const eq = HERO_STATE_FLAGS.find((e) => e.flag === "EQUILIBRIUM");
    expect(eq).toBeDefined();
    // The engine flag key is the raw `EQUILIBRIUM` the deck's two COMBAT_RESOLVED
    // triggers set/clear — NOT the "STILL WATERS" flavour name of the resolver.
    expect(eq!.flag).toBe("EQUILIBRIUM");
    expect(eq!.heroes).toEqual(["doppelganger"]);
    expect(eq!.nameplate).toMatchObject({ onLabel: "EQUILIBRIUM", showWhenAbsent: false });
    expect(eq!.token?.on).toBeDefined();
    // One-sided: nothing renders for the (default) absent stance.
    expect(eq!.token?.off).toBeUndefined();
    expect(eq!.group).toBeUndefined();
    expect(eq!.tokenArt).toBeUndefined();
  });

  it("shows the nameplate pill only while the stance is held", () => {
    const chips = flagChipsFor("doppelganger", { EQUILIBRIUM: true });
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.flag).toBe("EQUILIBRIUM");
    expect(chips[0].chip.onLabel).toBe("EQUILIBRIUM");
    expect(chips[0].on).toBe(true);
    // Broken by any decided combat — and an older snapshot may omit the key.
    expect(flagChipsFor("doppelganger", { EQUILIBRIUM: false })).toEqual([]);
    expect(flagChipsFor("doppelganger", {})).toEqual([]);
    expect(flagChipsFor("doppelganger", undefined)).toEqual([]);
  });

  it("shows the board-token badge only while the stance is held", () => {
    expect(fighterTokenBadgeFor("doppelganger", { EQUILIBRIUM: true })).toMatchObject({
      icon: "⚖",
      title: expect.stringContaining("Equilibrium"),
    });
    expect(fighterTokenBadgeFor("doppelganger", { EQUILIBRIUM: false })).toBeNull();
    expect(fighterTokenBadgeFor("doppelganger", {})).toBeNull();
  });

  it("never leaks onto another hero carrying the same flag key", () => {
    expect(flagChipsFor("king-kong", { EQUILIBRIUM: true })).toEqual([]);
    expect(fighterTokenBadgeFor("king-kong", { EQUILIBRIUM: true })).toBeNull();
  });

  it("leaves the Doppelgänger's other surfaces untouched", () => {
    // No portrait swap (one hero bust), and no counter/pile economy.
    expect(fighterTokenArtFor("doppelganger", { EQUILIBRIUM: true })).toBeNull();
    expect(counterChipsFor("doppelganger", {})).toEqual([]);
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

  it("registers Cairne's RAGE counter on the exact engine key", () => {
    const rage = HERO_STATE_COUNTERS.find((e) => e.heroes.includes("cairne-bloodhoof"));
    expect(rage).toBeDefined();
    // Engine emits the counter under key `RAGE` (cairne-bloodhoof.rules.ts:
    // counters: [{ name: 'RAGE' }]).
    expect(rage!.counter).toBe("RAGE");
    expect(rage!.nameplate?.labelTemplate).toBe("RAGE: {n}");
    expect(rage!.token).toMatchObject({ icon: "😡", title: "RAGE" });
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

  it("shows a RAGE pill with the live value when Cairne has rage", () => {
    const chips = counterChipsFor("cairne-bloodhoof", { RAGE: 2 });
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.onLabel).toBe("RAGE: 2");
    expect(chips[0].on).toBe(true);
    expect(chips[0].chip.flag).toBe("counter:RAGE");
  });

  it("hides Cairne's RAGE pill at 0 (and when absent)", () => {
    expect(counterChipsFor("cairne-bloodhoof", { RAGE: 0 })).toEqual([]);
    expect(counterChipsFor("cairne-bloodhoof", {})).toEqual([]);
    expect(counterChipsFor("cairne-bloodhoof", undefined)).toEqual([]);
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

  it("badges Cairne's token with the numeric RAGE count (😡)", () => {
    expect(fighterTokenCounterBadgeFor("cairne-bloodhoof", { RAGE: 3 })).toMatchObject({
      icon: "😡",
      label: "3",
      title: "RAGE: 3",
    });
  });

  it("hides Cairne's RAGE badge at 0 / absent", () => {
    expect(fighterTokenCounterBadgeFor("cairne-bloodhoof", { RAGE: 0 })).toBeNull();
    expect(fighterTokenCounterBadgeFor("cairne-bloodhoof", {})).toBeNull();
    expect(fighterTokenCounterBadgeFor("cairne-bloodhoof", undefined)).toBeNull();
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

// ---------------------------------------------------------------------------
// Pile-driven states (issue #539 ↔ engine #293/#294: Luke Skywalker's TRAINING
// pile). Same registry, same two render surfaces — but the value is the LENGTH
// of a PlayerView.piles card list (protocol v25) rather than a counters int, and
// the nameplate chip additionally carries the tucked card ids so the pill can
// open the inspection overlay. The zone is public, so every assertion below is
// deliberately owner-agnostic.
// ---------------------------------------------------------------------------

const LUKE_TRAINING = [
  "luke-skywalker/training-that-is-why-you-fail#1",
  "luke-skywalker/training-size-matters-not#1",
];

describe("HERO_STATE_COUNTERS registry — Luke's TRAINING pile", () => {
  const luke = () => HERO_STATE_COUNTERS.find((e) => e.heroes.includes("luke-skywalker"));

  it("registers the pile on the exact engine pile name, with no counters key", () => {
    const e = luke();
    expect(e).toBeDefined();
    // Engine tucks into pile `TRAINING` (luke-skywalker.rules.ts: const PILE =
    // 'TRAINING'). It is a card zone, NOT a counter — `counter` must stay unset
    // or the projection would read the wrong protocol field.
    expect(e!.pile).toBe("TRAINING");
    expect(e!.counter).toBeUndefined();
  });

  it("declares BOTH client surfaces (nameplate pill + token badge)", () => {
    expect(luke()!.nameplate?.labelTemplate).toBe("TRAINING: {n}");
    expect(luke()!.token).toMatchObject({ title: "TRAINING" });
  });
});

describe("counterChipsFor — pile-sourced (HUD nameplate)", () => {
  it("shows a TRAINING pill counting the tucked cards", () => {
    const chips = counterChipsFor("luke-skywalker", undefined, { TRAINING: LUKE_TRAINING });
    expect(chips).toHaveLength(1);
    expect(chips[0].chip.onLabel).toBe("TRAINING: 2");
    expect(chips[0].on).toBe(true);
    // namespaced `pile:` (not `counter:`) so it can never collide with a
    // boolean-flag glyph or a same-named counter
    expect(chips[0].chip.flag).toBe("pile:TRAINING");
  });

  it("carries the tucked card ids so the pill can open the inspection overlay", () => {
    const chips = counterChipsFor("luke-skywalker", undefined, { TRAINING: LUKE_TRAINING });
    expect(chips[0].chip.pile).toBe("TRAINING");
    expect(chips[0].chip.cards).toEqual(LUKE_TRAINING);
  });

  it("renders identically for EITHER seat — the pile is public, so the projection is owner-agnostic", () => {
    const self = counterChipsFor("luke-skywalker", undefined, { TRAINING: LUKE_TRAINING });
    const opponent = counterChipsFor("luke-skywalker", undefined, { TRAINING: LUKE_TRAINING });
    expect(opponent).toEqual(self);
  });

  it("hides the pill when nothing is tucked (engine prunes the emptied pile key)", () => {
    expect(counterChipsFor("luke-skywalker", undefined, { TRAINING: [] })).toEqual([]);
    expect(counterChipsFor("luke-skywalker", undefined, {})).toEqual([]);
    // pre-v25 server: no `piles` field at all
    expect(counterChipsFor("luke-skywalker", undefined, undefined)).toEqual([]);
    expect(counterChipsFor("luke-skywalker", {})).toEqual([]);
  });

  it("renders no pile chip for a non-registered hero, even with a stray TRAINING pile", () => {
    expect(counterChipsFor("king-kong", undefined, { TRAINING: LUKE_TRAINING })).toEqual([]);
  });

  it("leaves counter-sourced chips (Nancy) with no pile/cards — only piles are inspectable", () => {
    const chips = counterChipsFor("nancy-drew", { CLUE: 3 });
    expect(chips[0].chip.pile).toBeUndefined();
    expect(chips[0].chip.cards).toBeUndefined();
  });
});

describe("fighterTokenCounterBadgeFor — pile-sourced (board token)", () => {
  it("badges Luke's token with the live tucked count and asks to draw it", () => {
    expect(
      fighterTokenCounterBadgeFor("luke-skywalker", undefined, { TRAINING: LUKE_TRAINING })
    ).toMatchObject({
      icon: "🌱",
      label: "2",
      title: "TRAINING: 2",
      // the count must read off the BOARD, not just the badge tooltip
      showLabel: true,
    });
  });

  it("hides the badge when nothing is tucked / on a pre-v25 server", () => {
    expect(fighterTokenCounterBadgeFor("luke-skywalker", undefined, { TRAINING: [] })).toBeNull();
    expect(fighterTokenCounterBadgeFor("luke-skywalker", undefined, {})).toBeNull();
    expect(fighterTokenCounterBadgeFor("luke-skywalker", undefined, undefined)).toBeNull();
  });

  it("does not badge non-registered heroes", () => {
    expect(fighterTokenCounterBadgeFor("king-kong", undefined, { TRAINING: LUKE_TRAINING })).toBeNull();
    expect(fighterTokenCounterBadgeFor(undefined, undefined, { TRAINING: LUKE_TRAINING })).toBeNull();
  });

  it("draws the numeric label for counter-sourced badges too (Nancy/Cairne)", () => {
    expect(fighterTokenCounterBadgeFor("nancy-drew", { CLUE: 4 })).toMatchObject({ showLabel: true });
  });
});

describe("fighterTokenStateByOwner with piles", () => {
  it("resolves Luke's TRAINING badge for BOTH seats of a mirror, hidden when untucked", () => {
    const state = fighterTokenStateByOwner([
      { id: "p1", heroId: "luke-skywalker", piles: { TRAINING: LUKE_TRAINING } },
      { id: "p2", heroId: "luke-skywalker", piles: { TRAINING: [LUKE_TRAINING[0]] } },
      { id: "p3", heroId: "luke-skywalker" }, // nothing tucked yet → no `piles` key
    ]);
    expect(state.p1!.badge).toMatchObject({ label: "2", title: "TRAINING: 2" });
    expect(state.p2!.badge).toMatchObject({ label: "1", title: "TRAINING: 1" });
    expect(state.p3).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Kenshiro (issue #596 ↔ engine #362, on the #359/#360 lab train). Four states
// across BOTH registries: three boolean buff/condition flags that are nameplate
// ONLY, and two counters — the HOKUTO chain (both surfaces) and the
// YOU ARE ALREADY DEAD! value preview (nameplate only, ungated by hero).
//
// The Cairne RAGE lesson drives every assertion here: the view is registry-driven,
// so a state with no entry — or an entry on the wrong key — renders NOWHERE.
// ---------------------------------------------------------------------------

describe("HERO_STATE_FLAGS — Kenshiro's buff + condition pills", () => {
  const entry = (flag: string) => HERO_STATE_FLAGS.find((e) => e.flag === flag);

  it.each([
    ["NUNCHAKU", "NUNCHAKU +1"],
    ["DRAGON_FORM", "DRAGON FORM +2"],
  ])("registers %s on the exact engine key, gated to kenshiro", (flag, label) => {
    const e = entry(flag);
    expect(e).toBeDefined();
    expect(e!.heroes).toEqual(["kenshiro"]);
    expect(e!.nameplate).toMatchObject({ onLabel: label, showWhenAbsent: false });
  });

  it("keeps both OFF the board token — nameplate-only, even with the badge slot free", () => {
    // Both buffs are TURN-scoped and only matter while their owner picks an attack,
    // where the two pills already state them; a rim badge could carry only one of the
    // two and would imply the other was off. Engine #377 emptied the counter slot they
    // used to defer to, and the answer stayed the same (see the registry comment).
    for (const flag of ["NUNCHAKU", "DRAGON_FORM"]) {
      expect(entry(flag)!.token).toBeUndefined();
      expect(entry(flag)!.tokenArt).toBeUndefined();
    }
  });

  it("registers NO entry for the three retired keys — kenshiro owns no counter at all", () => {
    // #368's ledger rotation turned both carry-forwards into live LAST_TURN reads, and
    // #377 replaced the chain ledger with a direct discard-pile query (DSL v0.40.1 can
    // resolve CARDS_IN_DISCARD in a predicate, so Hundred-Fist Rush asks the printed
    // question straight off the pile). kenshiro.rules.ts now declares no `counters` at
    // all, and his seat's counters map is empty for the whole game. A registry entry for
    // any of these would be permanently dead — and dead rows are how a live state gets
    // mis-keyed later.
    expect(HERO_STATE_FLAGS.find((e) => e.flag === "ALLY_DAMAGED_LAST_TURN")).toBeUndefined();
    expect(HERO_STATE_COUNTERS.find((e) => e.counter === "DMG_LAST_TURN")).toBeUndefined();
    expect(HERO_STATE_COUNTERS.filter((e) => e.heroes.includes("kenshiro"))).toEqual([]);
  });

  it("renders no counter surface for kenshiro, however stale the state it is handed", () => {
    // Registry-driven, and gated by HERO ID before any key is read: with no kenshiro
    // row, NOTHING in a `counters` map can conjure a pill or a badge — not the retired
    // Hundred-Fist ledger a pre-#377 server or an old replay bundle still banks, not
    // #368's damage carry-forward, not another hero's live key.
    const stale = { RETIRED_LEDGER: 3, DMG_LAST_TURN: 6, CLUE: 2, RAGE: 4 };
    expect(counterChipsFor("kenshiro", stale)).toEqual([]);
    expect(fighterTokenCounterBadgeFor("kenshiro", stale)).toBeNull();
    // …so the seat contributes no token state at all and is omitted from the map.
    const state = fighterTokenStateByOwner([
      { id: "p1", heroId: "kenshiro", counters: stale },
      { id: "p2", heroId: "nancy-drew", counters: { CLUE: 1 } },
    ]);
    expect(state.p1).toBeUndefined();
    expect(state.p2!.badge).toMatchObject({ title: "CLUES: 1" });
  });

  it("shows only the pills whose flags are set, and nothing at all when none are", () => {
    expect(flagChipsFor("kenshiro", { NUNCHAKU: true }).map((c) => c.chip.onLabel)).toEqual([
      "NUNCHAKU +1",
    ]);
    expect(
      flagChipsFor("kenshiro", { NUNCHAKU: true, DRAGON_FORM: true }).map((c) => c.chip.onLabel)
    ).toEqual(["NUNCHAKU +1", "DRAGON FORM +2"]);
    // a retired key never conjures a pill, whatever the server sends
    expect(flagChipsFor("kenshiro", { ALLY_DAMAGED_LAST_TURN: true })).toEqual([]);
    // One-sided states: no "off" pill, unlike Thetis's LOW TIDE.
    expect(flagChipsFor("kenshiro", {})).toEqual([]);
    expect(flagChipsFor("kenshiro", undefined)).toEqual([]);
  });

  it("never leaks Kenshiro's flags onto another hero's plate", () => {
    expect(flagChipsFor("thetis", { NUNCHAKU: true, DRAGON_FORM: true })).toEqual([
      // thetis keeps its own two-state tide pill and nothing else
      expect.objectContaining({ chip: expect.objectContaining({ flag: "HIGH_TIDE" }) }),
    ]);
  });

  it("leaves the board token untouched — no badge, no portrait swap", () => {
    expect(fighterTokenStateFor("kenshiro", { NUNCHAKU: true, DRAGON_FORM: true })).toEqual({
      badge: null,
      heroArtUrl: null,
    });
  });
});

// ---------------------------------------------------------------------------
// Skull Kid's TIME dial (issue #663 ↔ engine #449) — the registry's first DOWN
// counter, and the first with a declared ceiling. It is the deck's whole public
// state, so both surfaces must read it for BOTH seats, including at 0 (the
// instant of the Clock Tower strike).
// ---------------------------------------------------------------------------

describe("Skull Kid's TIME counter (down counter, 5 → 0)", () => {
  it("registers TIME on the exact engine key, with both surfaces and the declared max", () => {
    const time = HERO_STATE_COUNTERS.find((e) => e.heroes.includes("skull-kid"));
    expect(time).toBeDefined();
    // skull-kid.rules.ts: counters: [{ name: 'TIME', max: 5 }, { name: 'MITIGATION', max: 5 }]
    expect(time!.counter).toBe("TIME");
    expect(time!.outOf).toBe(5);
    expect(time!.showAtZero).toBe(true);
    expect(time!.nameplate?.labelTemplate).toBe("TIME {n}/{max}");
    expect(time!.token).toMatchObject({ title: "TIME" });
  });

  it("never registers MITIGATION — engine bookkeeping, suppressed by omission", () => {
    // The registry is opt-in, so "no row" IS the suppression: a MITIGATION value
    // mid-strike must not reach either surface.
    expect(HERO_STATE_COUNTERS.some((e) => e.counter === "MITIGATION")).toBe(false);
    expect(counterChipsFor("skull-kid", { TIME: 0, MITIGATION: 3 })).toEqual([
      expect.objectContaining({ chip: expect.objectContaining({ onLabel: "TIME 0/5" }) }),
    ]);
    expect(fighterTokenCounterBadgeFor("skull-kid", { TIME: 0, MITIGATION: 3 })).toMatchObject({
      label: "0/5",
    });
  });

  it("reads the live clock on the nameplate pill as n/max", () => {
    expect(counterChipsFor("skull-kid", { TIME: 5, MITIGATION: 0 })[0].chip.onLabel).toBe("TIME 5/5");
    expect(counterChipsFor("skull-kid", { TIME: 3, MITIGATION: 0 })[0].chip.onLabel).toBe("TIME 3/5");
    expect(counterChipsFor("skull-kid", { TIME: 1, MITIGATION: 0 })[0].chip.flag).toBe("counter:TIME");
  });

  it("reads the live clock on the board token as n/max", () => {
    expect(fighterTokenCounterBadgeFor("skull-kid", { TIME: 2 })).toMatchObject({
      icon: "⏳",
      label: "2/5",
      title: "TIME: 2/5",
      showLabel: true,
    });
  });

  it("KEEPS both surfaces at 0 — the strike is the moment they matter most", () => {
    expect(counterChipsFor("skull-kid", { TIME: 0 })).toHaveLength(1);
    expect(fighterTokenCounterBadgeFor("skull-kid", { TIME: 0 })).not.toBeNull();
  });

  it("reads an ABSENT TIME key as 0 — that is how an emptied dial reaches the wire", () => {
    // The engine deletes a counter key the moment it hits zero, so the whole Clock
    // Tower strike is broadcast with no TIME at all. Reading that as "no clock" would
    // blank both surfaces at exactly the wrong moment.
    expect(counterChipsFor("skull-kid", { MITIGATION: 3 })[0].chip.onLabel).toBe("TIME 0/5");
    expect(fighterTokenCounterBadgeFor("skull-kid", {})).toMatchObject({ label: "0/5" });
  });

  it("leaves every other counter deck hiding at 0 (showAtZero is opt-in)", () => {
    expect(counterChipsFor("nancy-drew", { CLUE: 0 })).toEqual([]);
    expect(counterChipsFor("cairne-bloodhoof", { RAGE: 0 })).toEqual([]);
    expect(fighterTokenCounterBadgeFor("nancy-drew", { CLUE: 0 })).toBeNull();
  });

  it("renders the clock on EITHER seat's token — the counter is public", () => {
    const state = fighterTokenStateByOwner([
      { id: "p1", heroId: "skull-kid", counters: { TIME: 4, MITIGATION: 0 } },
      { id: "p2", heroId: "king-kong", counters: {} },
    ]);
    expect(state.p1!.badge).toMatchObject({ label: "4/5", title: "TIME: 4/5" });
    expect(state.p2).toBeUndefined();
  });

  it("never leaks TIME onto another hero's surfaces", () => {
    expect(counterChipsFor("king-kong", { TIME: 3 })).toEqual([]);
    expect(fighterTokenCounterBadgeFor("king-kong", { TIME: 3 })).toBeNull();
  });
});
