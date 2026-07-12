/**
 * FLAG_HUD_CHIPS registry + flagChipsFor selection (issue #233). The HUD renders
 * public engine `flags` as always-visible player-card pills; this proves the
 * gate is data-driven and that a non-flag hero never renders a stray "off" pill.
 */
import { FLAG_HUD_CHIPS, flagChipsFor } from "./useProCardArt";

describe("FLAG_HUD_CHIPS registry", () => {
  it("registers the tide chip for both Thetis heroes", () => {
    const tide = FLAG_HUD_CHIPS.find((c) => c.flag === "HIGH_TIDE");
    expect(tide).toBeDefined();
    expect(tide!.heroes).toEqual(expect.arrayContaining(["thetis", "thetis-spice"]));
    expect(tide!.onLabel).toBe("HIGH TIDE");
    expect(tide!.offLabel).toBe("LOW TIDE");
    expect(tide!.showWhenAbsent).toBe(true);
  });
});

describe("flagChipsFor", () => {
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

  it("renders NO chip for a non-tide hero, even if a stray flag is present", () => {
    expect(flagChipsFor("king-kong", undefined)).toEqual([]);
    expect(flagChipsFor("king-kong", { HIGH_TIDE: true })).toEqual([]);
  });
});
