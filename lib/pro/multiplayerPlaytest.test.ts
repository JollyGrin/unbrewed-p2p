import { MULTIPLAYER_PLAYTEST_MAP, PRO_FORMATS, formatChoice, teamComposition } from "./multiplayerPlaytest";

describe("multiplayer playtest helpers", () => {
  it("offers duel plus the manual-playtest multiplayer formats", () => {
    expect(PRO_FORMATS.map((f) => [f.id, f.requiredPlayers])).toEqual([
      ["duel", 2],
      ["ffa-3", 3],
      ["team-2v2", 4],
    ]);
    expect(formatChoice("unknown").id).toBe("duel");
  });

  it("ships a custom arena map with enough starts and support for selected multiplayer formats", () => {
    const starts = new Set(
      MULTIPLAYER_PLAYTEST_MAP.spaces.flatMap((space) =>
        space.start ? [space.start.slot] : []
      )
    );

    expect(MULTIPLAYER_PLAYTEST_MAP.meta.title).toBe("Multiplayer Arena Playtest");
    expect(MULTIPLAYER_PLAYTEST_MAP.meta.imageWidth).toBe(2400);
    expect(MULTIPLAYER_PLAYTEST_MAP.meta.imageHeight).toBe(1560);
    expect(decodeURIComponent(MULTIPLAYER_PLAYTEST_MAP.meta.imageUrl ?? "")).toContain(
      'width="2400" height="1560"'
    );
    expect(starts).toEqual(new Set([1, 2, 3, 4]));
    expect(MULTIPLAYER_PLAYTEST_MAP.supportedFormats.map((f) => f.formatId)).toEqual([
      "duel",
      "ffa-3",
      "team-2v2",
    ]);
  });

  it("splits team-2v2 into fixed runtime seat teams, and nothing else", () => {
    expect(teamComposition("team-2v2")).toEqual([
      { team: "A", seats: ["p1", "p3"] },
      { team: "B", seats: ["p2", "p4"] },
    ]);
    expect(teamComposition("duel")).toBeNull();
    expect(teamComposition("ffa-3")).toBeNull();
    expect(teamComposition(undefined)).toBeNull();
  });

  it("keeps the arena graph internally consistent", () => {
    const zones = new Set(MULTIPLAYER_PLAYTEST_MAP.zones.map((zone) => zone.id));
    const spacesById = new Map(
      MULTIPLAYER_PLAYTEST_MAP.spaces.map((space) => [space.id, space])
    );

    expect(spacesById.size).toBe(MULTIPLAYER_PLAYTEST_MAP.spaces.length);
    expect(MULTIPLAYER_PLAYTEST_MAP.spaces.length).toBeGreaterThanOrEqual(35);

    for (const space of MULTIPLAYER_PLAYTEST_MAP.spaces) {
      expect(space.x).toBeGreaterThanOrEqual(0);
      expect(space.x).toBeLessThanOrEqual(1);
      expect(space.y).toBeGreaterThanOrEqual(0);
      expect(space.y).toBeLessThanOrEqual(1);
      expect(space.zones.every((zone) => zones.has(zone))).toBe(true);

      for (const neighborId of space.adjacentTo) {
        const neighbor = spacesById.get(neighborId);
        expect(neighbor).toBeTruthy();
        expect(neighbor?.adjacentTo).toContain(space.id);
      }
    }
  });
});
