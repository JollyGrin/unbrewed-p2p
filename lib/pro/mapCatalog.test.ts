import {
  MAP_CATALOG,
  CUSTOM_MAP_ID,
  catalogEntry,
  customMapForEntry,
  defaultMapIdForFormat,
  eligibleFormats,
  ineligibleReason,
  mapEligibleForFormat,
  mapHasItems,
  DUEL_RANDOM_MAX_PLAYERS,
  duelRandomEligible,
  RANDOM_MAP_ID,
  randomMapPool,
  rollRandomMap,
  type CatalogMap,
} from "./mapCatalog";
import { normalizeMap } from "./normalizeMap";
import islandOfDespairJson from "./fixtures/island-of-despair.map.json";
import weathertopJson from "./fixtures/weathertop.map.json";
import countsCastleJson from "./fixtures/counts-castle.map.json";
import uscssNostromoJson from "./fixtures/uscss-nostromo.map.json";
import theBogJson from "./fixtures/the-bog.map.json";
import weddingCrashersJson from "./fixtures/wedding-crashers.map.json";
import pyramidsJson from "./fixtures/pyramids.map.json";

const island = catalogEntry("island-of-despair")!;
const mendedDrum = catalogEntry("mended-drum")!;
const cityDocks = catalogEntry("city-docks")!;
const polus = catalogEntry("polus")!;
const weathertop = catalogEntry("weathertop")!;
const countsCastle = catalogEntry("counts-castle")!;
const nostromo = catalogEntry("uscss-nostromo")!;
const theBog = catalogEntry("the-bog")!;
const weddingCrashers = catalogEntry("wedding-crashers")!;
const pyramids = catalogEntry("pyramids")!;
const arena = catalogEntry("multiplayer-arena-playtest")!;

describe("map catalog", () => {
  it("lists the built-in boards in order", () => {
    expect(MAP_CATALOG.map((e) => e.id)).toEqual([
      "mended-drum",
      "island-of-despair",
      "city-docks",
      "polus",
      "weathertop",
      "counts-castle",
      "uscss-nostromo",
      "the-bog",
      "wedding-crashers",
      "pyramids",
      "multiplayer-arena-playtest",
    ]);
    expect(arena.title).toBe("Playtest Arena (synthetic)");
    // every entry carries a thumbnail (board image or the arena's data-URI svg)
    expect(MAP_CATALOG.every((e) => e.thumbnailUrl.length > 0)).toBe(true);
  });

  describe("eligibility per format", () => {
    it("Island of Despair supports all three formats via authored supportedFormats", () => {
      expect(eligibleFormats(island.map)).toEqual(["duel", "ffa-3", "team-2v2"]);
      expect(mapEligibleForFormat(island.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(island.map, "ffa-3")).toBe(true);
      expect(mapEligibleForFormat(island.map, "team-2v2")).toBe(true);
    });

    it("City Docks supports all three formats via authored supportedFormats", () => {
      expect(eligibleFormats(cityDocks.map)).toEqual(["duel", "ffa-3", "team-2v2"]);
      expect(mapEligibleForFormat(cityDocks.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(cityDocks.map, "ffa-3")).toBe(true);
      expect(mapEligibleForFormat(cityDocks.map, "team-2v2")).toBe(true);
    });

    it("Polus supports all three formats via authored supportedFormats", () => {
      expect(eligibleFormats(polus.map)).toEqual(["duel", "ffa-3", "team-2v2"]);
      expect(mapEligibleForFormat(polus.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(polus.map, "ffa-3")).toBe(true);
      expect(mapEligibleForFormat(polus.map, "team-2v2")).toBe(true);
    });

    it("Weathertop supports all three formats via authored supportedFormats", () => {
      expect(eligibleFormats(weathertop.map)).toEqual(["duel", "ffa-3", "team-2v2"]);
      expect(mapEligibleForFormat(weathertop.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(weathertop.map, "ffa-3")).toBe(true);
      expect(mapEligibleForFormat(weathertop.map, "team-2v2")).toBe(true);
    });

    it("Count's Castle supports all three formats via authored supportedFormats", () => {
      expect(eligibleFormats(countsCastle.map)).toEqual(["duel", "ffa-3", "team-2v2"]);
      expect(mapEligibleForFormat(countsCastle.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(countsCastle.map, "ffa-3")).toBe(true);
      expect(mapEligibleForFormat(countsCastle.map, "team-2v2")).toBe(true);
    });

    it("USCSS Nostromo is duel-only — an authored duel block, no 3rd/4th slot", () => {
      expect(eligibleFormats(nostromo.map)).toEqual(["duel"]);
      expect(mapEligibleForFormat(nostromo.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(nostromo.map, "ffa-3")).toBe(false);
      expect(mapEligibleForFormat(nostromo.map, "team-2v2")).toBe(false);
      expect(ineligibleReason(nostromo.map, "ffa-3")).toBe("needs 3 start slots");
      expect(ineligibleReason(nostromo.map, "team-2v2")).toBe("needs 4 start slots");
    });

    it("The Bog is duel-only — an authored duel block, no 3rd/4th slot", () => {
      expect(eligibleFormats(theBog.map)).toEqual(["duel"]);
      expect(mapEligibleForFormat(theBog.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(theBog.map, "ffa-3")).toBe(false);
      expect(mapEligibleForFormat(theBog.map, "team-2v2")).toBe(false);
      expect(ineligibleReason(theBog.map, "ffa-3")).toBe("needs 3 start slots");
      expect(ineligibleReason(theBog.map, "team-2v2")).toBe("needs 4 start slots");
    });

    it("Wedding Crashers is duel-only via the printed slots 1&2 fallback", () => {
      // no authored supportedFormats — the board prints start slots 1 and 2, so
      // the server's own duel fallback is what makes it eligible.
      expect((weddingCrashers.map as CatalogMap).supportedFormats).toBeUndefined();
      expect(eligibleFormats(weddingCrashers.map)).toEqual(["duel"]);
      expect(mapEligibleForFormat(weddingCrashers.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(weddingCrashers.map, "ffa-3")).toBe(false);
      expect(mapEligibleForFormat(weddingCrashers.map, "team-2v2")).toBe(false);
      expect(ineligibleReason(weddingCrashers.map, "ffa-3")).toBe("needs 3 start slots");
      expect(ineligibleReason(weddingCrashers.map, "team-2v2")).toBe("needs 4 start slots");
    });

    it("Pyramids supports all three formats via authored supportedFormats", () => {
      expect(eligibleFormats(pyramids.map)).toEqual(["duel", "ffa-3", "team-2v2"]);
      expect(mapEligibleForFormat(pyramids.map, "duel")).toBe(true);
      expect(mapEligibleForFormat(pyramids.map, "ffa-3")).toBe(true);
      expect(mapEligibleForFormat(pyramids.map, "team-2v2")).toBe(true);
    });

    it("The Mended Drum is duel-only via the printed slots 1&2 fallback", () => {
      // no authored supportedFormats — relies on the server's duel fallback
      expect((mendedDrum.map as CatalogMap).supportedFormats).toBeUndefined();
      expect(eligibleFormats(mendedDrum.map)).toEqual(["duel"]);
      expect(mapEligibleForFormat(mendedDrum.map, "ffa-3")).toBe(false);
      expect(mapEligibleForFormat(mendedDrum.map, "team-2v2")).toBe(false);
    });

    it("gives a start-slot reason for ineligible formats and null when eligible", () => {
      expect(ineligibleReason(mendedDrum.map, "duel")).toBeNull();
      expect(ineligibleReason(mendedDrum.map, "ffa-3")).toBe("needs 3 start slots");
      expect(ineligibleReason(mendedDrum.map, "team-2v2")).toBe("needs 4 start slots");
      expect(ineligibleReason(island.map, "team-2v2")).toBeNull();
    });

    it("a duel-only board (no slots 3/4) is ineligible for ffa-3 and 2v2", () => {
      const duelOnly: CatalogMap = {
        schemaVersion: "1.0",
        id: "tiny",
        meta: { title: "Tiny", minPlayers: 2, maxPlayers: 2, specialRules: false },
        zones: [],
        spaces: [
          { id: "a", x: 0, y: 0, zones: [], adjacentTo: ["b"], start: { slot: 1 } },
          { id: "b", x: 1, y: 1, zones: [], adjacentTo: ["a"], start: { slot: 2 } },
        ],
      };
      expect(mapEligibleForFormat(duelOnly, "duel")).toBe(true);
      expect(mapEligibleForFormat(duelOnly, "ffa-3")).toBe(false);
      expect(mapEligibleForFormat(duelOnly, "team-2v2")).toBe(false);
    });

    it("a board missing slot 2 is not duel-eligible", () => {
      const noSlot2: CatalogMap = {
        schemaVersion: "1.0",
        id: "half",
        meta: { title: "Half", minPlayers: 2, maxPlayers: 2, specialRules: false },
        zones: [],
        spaces: [{ id: "a", x: 0, y: 0, zones: [], adjacentTo: [], start: { slot: 1 } }],
      };
      expect(mapEligibleForFormat(noSlot2, "duel")).toBe(false);
    });
  });

  describe("default board per format", () => {
    it("duel -> Mended Drum, ffa-3 & 2v2 -> Island of Despair", () => {
      expect(defaultMapIdForFormat("duel")).toBe("mended-drum");
      expect(defaultMapIdForFormat("ffa-3")).toBe("island-of-despair");
      expect(defaultMapIdForFormat("team-2v2")).toBe("island-of-despair");
    });
  });

  describe("customMap wiring", () => {
    it("the server-default board (duel) sends no customMap", () => {
      expect(customMapForEntry(mendedDrum)).toBeUndefined();
    });

    it("Island of Despair sends its full board", () => {
      const sent = customMapForEntry(island);
      expect(sent).toBeDefined();
      expect(sent!.id).toBe("island-of-despair");
    });

    it("the custom sentinel id is not a real catalog entry", () => {
      expect(catalogEntry(CUSTOM_MAP_ID)).toBeUndefined();
    });

    it("the random sentinel id is not a real catalog entry", () => {
      expect(catalogEntry(RANDOM_MAP_ID)).toBeUndefined();
    });
  });
});

/**
 * The Random tile (#685) resolves at room-create time. The 1v1 pool is bounded
 * by the board's own `meta.maxPlayers`, NOT by a curated list: every catalog
 * board today is 2/2 or 2/4, so all ten are rollable for a duel, and a future
 * board authored for more than four players drops out on its own metadata.
 */
describe("random board pool", () => {
  it("duel rolls every visible board — all ten are <= 4 players", () => {
    expect(randomMapPool("duel").map((e) => e.id)).toEqual([
      "mended-drum",
      "island-of-despair",
      "city-docks",
      "polus",
      "weathertop",
      "counts-castle",
      "uscss-nostromo",
      "the-bog",
      "wedding-crashers",
      "pyramids",
    ]);
    // the big four are IN the pool — the "(1-4)" bound is a player count
    for (const id of ["weathertop", "counts-castle", "uscss-nostromo", "the-bog"]) {
      expect(randomMapPool("duel").map((e) => e.id)).toContain(id);
    }
  });

  it("excludes a board authored for more than four players, with no catalog edit", () => {
    // The rule's whole purpose: a future big board opts itself out by metadata.
    const bigBoard: CatalogMap = {
      schemaVersion: "1.0",
      id: "grand-melee",
      meta: {
        title: "Grand Melee",
        minPlayers: 2,
        maxPlayers: DUEL_RANDOM_MAX_PLAYERS + 1,
        specialRules: false,
      },
      zones: [],
      spaces: [
        { id: "a", x: 0, y: 0, zones: [], adjacentTo: ["b"], start: { slot: 1 } },
        { id: "b", x: 1, y: 1, zones: [], adjacentTo: ["a"], start: { slot: 2 } },
      ],
    };
    // it CAN host a duel (printed slots 1 & 2) — it's the size that rules it out
    expect(mapEligibleForFormat(bigBoard, "duel")).toBe(true);
    expect(duelRandomEligible(bigBoard)).toBe(false);
    // exactly at the bound it is back in
    expect(
      duelRandomEligible({
        ...bigBoard,
        meta: { ...bigBoard.meta, maxPlayers: DUEL_RANDOM_MAX_PLAYERS },
      }),
    ).toBe(true);
    // ...and a board that can't seat a duel at all is out regardless of size
    expect(duelRandomEligible({ ...bigBoard, meta: { ...bigBoard.meta, maxPlayers: 2 }, spaces: [] })).toBe(
      false,
    );
    // every real catalog board agrees with the pool
    for (const entry of MAP_CATALOG.filter((e) => !e.hidden)) {
      expect([entry.id, duelRandomEligible(entry.map)]).toEqual([
        entry.id,
        randomMapPool("duel").includes(entry),
      ]);
    }
  });

  it("ffa-3 and 2v2 roll every visible board eligible for the format", () => {
    for (const format of ["ffa-3", "team-2v2"] as const) {
      const pool = randomMapPool(format);
      expect(pool.map((e) => e.id)).toEqual([
        "island-of-despair",
        "city-docks",
        "polus",
        "weathertop",
        "counts-castle",
        "pyramids",
      ]);
      // every rolled board can actually seat the format, and none is hidden
      expect(pool.every((e) => mapEligibleForFormat(e.map, format))).toBe(true);
      expect(pool.some((e) => e.hidden)).toBe(false);
    }
  });

  it("never offers the hidden playtest arena", () => {
    for (const format of ["duel", "ffa-3", "team-2v2"] as const) {
      expect(randomMapPool(format).map((e) => e.id)).not.toContain("multiplayer-arena-playtest");
    }
  });

  it("rolls uniformly across the pool and stays in bounds at rng()→1", () => {
    const pool = randomMapPool("duel");
    expect(pool.map((_, i) => rollRandomMap("duel", () => i / pool.length).id)).toEqual(
      pool.map((e) => e.id),
    );
    // Math.random() is [0,1), but a degenerate rng must not index past the end
    expect(rollRandomMap("duel", () => 1).id).toBe(pool[pool.length - 1].id);
    expect(rollRandomMap("duel", () => 0).id).toBe(pool[0].id);
  });

  it("a rolled board carries the same customMap semantics as a clicked tile", () => {
    // Mended Drum is the server-default board — rolling it must still send nothing
    expect(customMapForEntry(rollRandomMap("duel", () => 0))).toBeUndefined();
    const lastRoll = rollRandomMap("duel", () => 0.99);
    expect(lastRoll.id).toBe("pyramids");
    expect(customMapForEntry(lastRoll)!.id).toBe("pyramids");
  });
});

/**
 * Every authored 2v2 board binds its seats to the format's TURN ORDER
 * (A1→1, B1→2, A2→3, B2→4) — engine #495 / client #682. Teammates therefore
 * start on adjacent slots instead of the old "diagonal / far apart" heuristic,
 * which seated fighters wherever the board author felt like. Catalog-wide on
 * purpose: a future [map] ticket that registers a board must satisfy it too.
 *
 * The seat KEY order is deliberately not constrained here (see the per-fixture
 * tests): the engine zips runtime players p1..p4 against `Object.keys(seats)`,
 * so key order decides the team split (#264) while `startSlot` decides where a
 * seat's fighter is placed.
 */
describe("2v2 seat bindings follow turn order (#682, engine #495)", () => {
  const TURN_ORDER: Record<string, number> = { A1: 1, B1: 2, A2: 3, B2: 4 };

  const teamSupports = MAP_CATALOG.flatMap((entry) =>
    (entry.map.supportedFormats ?? [])
      .filter((f) => f.formatId === "team-2v2")
      .map((support) => [entry.id, support] as const),
  );

  it("finds every authored 2v2 board in the catalog", () => {
    expect(teamSupports.map(([id]) => id)).toEqual([
      "island-of-despair",
      "city-docks",
      "polus",
      "weathertop",
      "counts-castle",
      "pyramids",
      "multiplayer-arena-playtest",
    ]);
  });

  it.each(teamSupports.map(([id]) => id))("%s binds A1→1, B1→2, A2→3, B2→4", (id) => {
    const support = teamSupports.find(([entryId]) => entryId === id)![1];
    // exactly the four format seats, and all four printed slots used once each
    expect(Object.keys(support.seats).slice().sort()).toEqual(["A1", "A2", "B1", "B2"]);
    expect(new Set(Object.values(support.seats).map((s) => s.startSlot))).toEqual(
      new Set([1, 2, 3, 4]),
    );
    for (const [seat, slot] of Object.entries(TURN_ORDER)) {
      expect([seat, support.seats[seat]?.startSlot]).toEqual([seat, slot]);
    }
  });
});

describe("island-of-despair fixture", () => {
  it("normalizes clean (engine-native pass-through)", () => {
    const map = normalizeMap(islandOfDespairJson);
    expect(map.id).toBe("island-of-despair");
    expect(map.meta.title).toBe("Island of Despair");
    expect(map.spaces).toHaveLength(34);
    const slots = new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));
    expect(slots).toEqual(new Set([1, 2, 3, 4]));
  });

  it("maps the four start slots to the expected spaces (s12/s28/s6/s2)", () => {
    const slotOf = (slot: number) =>
      islandOfDespairJson.spaces.find((s) => (s as { start?: { slot: number } }).start?.slot === slot)
        ?.id;
    expect(slotOf(1)).toBe("s12");
    expect(slotOf(2)).toBe("s28");
    expect(slotOf(3)).toBe("s6");
    expect(slotOf(4)).toBe("s2");
  });
});

describe("weathertop fixture", () => {
  it("normalizes clean (engine-native pass-through)", () => {
    const map = normalizeMap(weathertopJson);
    expect(map.id).toBe("weathertop");
    expect(map.meta.title).toBe("Weathertop");
    expect(map.spaces).toHaveLength(34);
    const slots = new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));
    expect(slots).toEqual(new Set([1, 2, 3, 4]));
  });

  it("preserves all 7 one-way (oneWayTo) edges through normalizeMap", () => {
    const map = normalizeMap(weathertopJson);
    const oneWay = map.spaces
      .filter((s) => s.oneWayTo && s.oneWayTo.length)
      .flatMap((s) => s.oneWayTo!.map((to) => `${s.id}->${to}`))
      .sort();
    expect(oneWay).toEqual(
      [
        "s2->s1",
        "s7->s34",
        "s9->s15",
        "s11->s6",
        "s20->s25",
        "s23->s27",
        "s23->s32",
      ].sort(),
    );
  });
});

describe("counts-castle fixture", () => {
  const spaces = countsCastleJson.spaces as Array<{
    id: string;
    zones: string[];
    passage?: boolean;
    start?: { slot: number };
  }>;

  it("normalizes clean (engine-native pass-through)", () => {
    const map = normalizeMap(countsCastleJson);
    expect(map.id).toBe("counts-castle");
    expect(map.meta.title).toBe("Count's Castle");
    expect(map.spaces).toHaveLength(76);
    const slots = new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));
    expect(slots).toEqual(new Set([1, 2, 3, 4]));
  });

  it("maps the four start slots to the expected spaces (s19/s70/s13/s63)", () => {
    const slotOf = (slot: number) => spaces.find((s) => s.start?.slot === slot)?.id;
    expect(slotOf(1)).toBe("s19");
    expect(slotOf(2)).toBe("s70");
    expect(slotOf(3)).toBe("s13");
    expect(slotOf(4)).toBe("s63");
  });

  it("declares 21 zones, every one of them used by at least one space", () => {
    const map = normalizeMap(countsCastleJson);
    expect(map.zones).toHaveLength(21);
    const used = new Set(spaces.flatMap((s) => s.zones));
    expect(new Set(map.zones.map((z) => z.id))).toEqual(used);
  });

  it("s74 is the three-zone meeting point (keep / crimson gallery / vault)", () => {
    const s74 = spaces.find((s) => s.id === "s74")!;
    expect(new Set(s74.zones)).toEqual(new Set(["z-keep", "z-redhall", "z-vault"]));
    expect(s74.zones).toHaveLength(3);
    // it's the only space carrying more than two zones
    expect(spaces.filter((s) => s.zones.length > 2).map((s) => s.id)).toEqual(["s74"]);
  });

  it("carries the 15 printed secret passages", () => {
    expect(spaces.filter((s) => s.passage).map((s) => s.id)).toEqual([
      "s4",
      "s5",
      "s13",
      "s15",
      "s22",
      "s25",
      "s26",
      "s44",
      "s45",
      "s47",
      "s50",
      "s56",
      "s67",
      "s71",
      "s72",
    ]);
  });

  it("has a fully symmetric, fully connected adjacency graph", () => {
    const byId = new Map(
      (countsCastleJson.spaces as Array<{ id: string; adjacentTo: string[] }>).map((s) => [s.id, s]),
    );
    for (const s of byId.values()) {
      for (const to of s.adjacentTo) {
        expect(byId.get(to)?.adjacentTo).toContain(s.id);
      }
    }
    const seen = new Set(["s1"]);
    const queue = ["s1"];
    while (queue.length) {
      for (const to of byId.get(queue.shift()!)!.adjacentTo) {
        if (!seen.has(to)) (seen.add(to), queue.push(to));
      }
    }
    expect(seen.size).toBe(76);
  });

  it("orders 2v2 seat keys A1, A2, B1, B2 (engine zips players against key order)", () => {
    const team = (countsCastle.map.supportedFormats ?? []).find(
      (f) => f.formatId === "team-2v2",
    )!;
    expect(Object.keys(team.seats)).toEqual(["A1", "A2", "B1", "B2"]);
    // slots follow the format's turn order A1→1, B1→2, A2→3, B2→4 (#682)
    expect(Object.values(team.seats).map((s) => s.startSlot)).toEqual([1, 3, 2, 4]);
  });
});

describe("uscss-nostromo fixture", () => {
  const spaces = uscssNostromoJson.spaces as Array<{
    id: string;
    zones: string[];
    adjacentTo: string[];
    start?: { slot: number };
  }>;

  it("normalizes clean (engine-native pass-through)", () => {
    const map = normalizeMap(uscssNostromoJson);
    expect(map.id).toBe("uscss-nostromo");
    expect(map.meta.title).toBe("USCSS Nostromo");
    expect(map.spaces).toHaveLength(29);
    const slots = new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));
    expect(slots).toEqual(new Set([1, 2]));
  });

  it("maps the two start slots to the expected spaces (s17/s21)", () => {
    const slotOf = (slot: number) => spaces.find((s) => s.start?.slot === slot)?.id;
    expect(slotOf(1)).toBe("s17");
    expect(slotOf(2)).toBe("s21");
  });

  it("declares 7 zones, every one of them used by at least one space", () => {
    const map = normalizeMap(uscssNostromoJson);
    expect(map.zones).toHaveLength(7);
    const used = new Set(spaces.flatMap((s) => s.zones));
    expect(new Set(map.zones.map((z) => z.id))).toEqual(used);
  });

  it("s15 is the three-zone meeting point (bridge / medbay / the nest)", () => {
    const s15 = spaces.find((s) => s.id === "s15")!;
    expect(new Set(s15.zones)).toEqual(new Set(["z3", "z6", "z5"]));
    // the only space carrying more than two zones; 7 others are split circles
    expect(spaces.filter((s) => s.zones.length > 2).map((s) => s.id)).toEqual(["s15"]);
    expect(spaces.filter((s) => s.zones.length === 2)).toHaveLength(7);
  });

  it("has a fully symmetric, fully connected adjacency graph", () => {
    const byId = new Map(spaces.map((s) => [s.id, s]));
    for (const s of byId.values()) {
      for (const to of s.adjacentTo) {
        expect(byId.get(to)?.adjacentTo).toContain(s.id);
      }
    }
    const seen = new Set(["s1"]);
    const queue = ["s1"];
    while (queue.length) {
      for (const to of byId.get(queue.shift()!)!.adjacentTo) {
        if (!seen.has(to)) (seen.add(to), queue.push(to));
      }
    }
    expect(seen.size).toBe(29);
  });

  it("serves its board image from the repo (no third-party host)", () => {
    expect(uscssNostromoJson.meta.imageUrl).toBe(
      "https://unbrewed.xyz/maps/community-uscss-nostromo.webp",
    );
  });

  it("authors a single duel format with A1/B1 on slots 1 and 2", () => {
    const formats = nostromo.map.supportedFormats ?? [];
    expect(formats.map((f) => f.formatId)).toEqual(["duel"]);
    expect(Object.keys(formats[0].seats)).toEqual(["A1", "B1"]);
    expect(Object.values(formats[0].seats).map((s) => s.startSlot)).toEqual([1, 2]);
  });
});

describe("the-bog fixture", () => {
  const spaces = theBogJson.spaces as Array<{
    id: string;
    zones: string[];
    adjacentTo: string[];
    oneWayTo?: string[];
    start?: { slot: number };
  }>;

  /** The six printed arrows, `from->to`. Sand spaces drain INTO the bog only. */
  const PRINTED_ARROWS = [
    "s22->s16",
    "s22->s17",
    "s28->s18",
    "s30->s19",
    "s30->s23",
    "s32->s23",
  ];

  it("normalizes clean (engine-native pass-through)", () => {
    const map = normalizeMap(theBogJson);
    expect(map.id).toBe("the-bog");
    expect(map.meta.title).toBe("The Bog");
    expect(map.spaces).toHaveLength(32);
    const slots = new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));
    expect(slots).toEqual(new Set([1, 2]));
  });

  it("maps the two start slots to the expected spaces (s9/s14)", () => {
    const slotOf = (slot: number) => spaces.find((s) => s.start?.slot === slot)?.id;
    expect(slotOf(1)).toBe("s9");
    expect(slotOf(2)).toBe("s14");
  });

  it("declares 7 zones, every one of them used by at least one space", () => {
    const map = normalizeMap(theBogJson);
    expect(map.zones).toHaveLength(7);
    const used = new Set(spaces.flatMap((s) => s.zones));
    expect(new Set(map.zones.map((z) => z.id))).toEqual(used);
  });

  it("carries the six one-way arrows through catalog load, unmirrored", () => {
    // the board the picker actually ships as `customMap` — not a re-parse
    const map = customMapForEntry(theBog)!;
    const arrows = map.spaces
      .filter((s) => s.oneWayTo?.length)
      .flatMap((s) => s.oneWayTo!.map((to) => `${s.id}->${to}`))
      .sort();
    expect(arrows).toEqual([...PRINTED_ARROWS].sort());

    // an arrow is strictly one-way: the destination must NOT list the source in
    // its `adjacentTo` (that would make it a normal two-way edge) and must not
    // point an arrow back either.
    const byId = new Map(map.spaces.map((s) => [s.id, s]));
    for (const arrow of PRINTED_ARROWS) {
      const [from, to] = arrow.split("->");
      expect(byId.get(to)!.adjacentTo).not.toContain(from);
      expect(byId.get(to)!.oneWayTo ?? []).not.toContain(from);
      // ...and the source doesn't double-list it as a two-way edge
      expect(byId.get(from)!.adjacentTo).not.toContain(to);
    }
  });

  it("only the four drop-in spaces carry arrows (s22/s28/s30/s32)", () => {
    expect(spaces.filter((s) => s.oneWayTo?.length).map((s) => s.id)).toEqual([
      "s22",
      "s28",
      "s30",
      "s32",
    ]);
    // three of them are the printed sandbars, each straddling the bog water
    // they drain into; s32 is the deadfall drop on the east shore.
    for (const id of ["s22", "s28", "s30"]) {
      expect(spaces.find((s) => s.id === id)!.zones).toEqual(
        expect.arrayContaining(["z3", "z4"]),
      );
    }
    expect(spaces.find((s) => s.id === "s32")!.zones).toEqual(["z5", "z7"]);
  });

  it("has a fully symmetric, fully connected two-way adjacency graph", () => {
    const byId = new Map(spaces.map((s) => [s.id, s]));
    for (const s of byId.values()) {
      for (const to of s.adjacentTo) {
        expect(byId.get(to)?.adjacentTo).toContain(s.id);
      }
    }
    const seen = new Set(["s1"]);
    const queue = ["s1"];
    while (queue.length) {
      for (const to of byId.get(queue.shift()!)!.adjacentTo) {
        if (!seen.has(to)) (seen.add(to), queue.push(to));
      }
    }
    // the arrows are a shortcut, not a lifeline: the board is already connected
    // without them, so no seat can be stranded behind a one-way drop.
    expect(seen.size).toBe(32);
  });

  it("serves its board image from the repo (no third-party host)", () => {
    expect(theBogJson.meta.imageUrl).toBe("https://unbrewed.xyz/maps/community-the-bog.webp");
  });

  it("authors a single duel format with A1/B1 on slots 1 and 2", () => {
    const formats = theBog.map.supportedFormats ?? [];
    expect(formats.map((f) => f.formatId)).toEqual(["duel"]);
    expect(Object.keys(formats[0].seats)).toEqual(["A1", "B1"]);
    expect(Object.values(formats[0].seats).map((s) => s.startSlot)).toEqual([1, 2]);
  });
});

/**
 * Wedding Crashers (#727) — the first catalog board that prints battlefield
 * items, and so the first reachable board for the 🎁 ITEMS chip and the
 * `CREATE_ROOM.itemsEnabled` opt-out (#725 ↔ engine #519).
 *
 * The shipped file is the REPAIRED board: `components/MapEditor/schemeItems.test.ts`
 * pins it byte-for-byte against what the map editor emits from the reporter's
 * original export, so there is one committed copy and no second one to drift.
 * These tests guard the half that file cannot see — that the catalog ships it,
 * that its items survive catalog load, and that none of them is the `ops: []`
 * shape the server answers `BAD_MAP` on.
 */
describe("wedding-crashers fixture", () => {
  const spaces = weddingCrashersJson.spaces as Array<{
    id: string;
    zones: string[];
    adjacentTo: string[];
    item?: string;
    start?: { slot: number };
  }>;

  /** The four printed items, `space -> item`. */
  const PRINTED_ITEMS: Record<string, string> = {
    s2: "item1", // Rose Bouquet (combat 2)
    s5: "item3", // Hand Gun (combat 1)
    s13: "item4", // Wedding Gifts (scheme: search discard)
    s16: "item2", // Wedding Cake (scheme: heal 2)
  };

  it("normalizes clean (engine-native pass-through)", () => {
    const map = normalizeMap(weddingCrashersJson);
    expect(map.id).toBe("wedding-crashers");
    expect(map.meta.title).toBe("Wedding Crashers");
    expect(map.spaces).toHaveLength(29);
    const slots = new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));
    expect(slots).toEqual(new Set([1, 2]));
  });

  it("maps the two start slots to the expected spaces (s8/s26)", () => {
    const slotOf = (slot: number) => spaces.find((s) => s.start?.slot === slot)?.id;
    expect(slotOf(1)).toBe("s8");
    expect(slotOf(2)).toBe("s26");
  });

  it("carries all four items through catalog load, each on its printed space", () => {
    // the board the picker actually ships as `customMap` — not a re-parse
    const map = customMapForEntry(weddingCrashers)!;
    expect((map.items ?? []).map((i) => i.id)).toEqual(["item1", "item2", "item3", "item4"]);

    const placed = Object.fromEntries(
      map.spaces.filter((s) => s.item).map((s) => [s.id, s.item]),
    );
    expect(placed).toEqual(PRINTED_ITEMS);
    // every declared item is spawned exactly once — the raw reporter export left
    // item4 unplaced, which the engine rejects as dead content (#693).
    expect(new Set(Object.values(placed))).toEqual(new Set((map.items ?? []).map((i) => i.id)));
  });

  it("ships the REPAIRED items — no scheme item with the BAD_MAP `ops: []`", () => {
    const items = customMapForEntry(weddingCrashers)!.items ?? [];
    const schemes = items.filter((i) => i.kind === "scheme");
    expect(schemes.map((i) => i.id)).toEqual(["item2", "item4"]);
    for (const item of schemes) {
      expect(Array.isArray(item.ops) && item.ops.length > 0).toBe(true);
      expect(item.text).toEqual(expect.any(String));
      expect(item.text).not.toBe("");
    }
    // the combat pair is untouched by the repair
    expect(items.filter((i) => i.kind === "combat").map((i) => [i.id, i.value])).toEqual([
      ["item1", 2],
      ["item3", 1],
    ]);
  });

  it("declares 7 zones, 6 of them printed on the board", () => {
    const map = normalizeMap(weddingCrashersJson);
    expect(map.zones).toHaveLength(7);
    const used = new Set(spaces.flatMap((s) => s.zones));
    // z7 is an unused leftover from the author's palette — harmless (the engine
    // accepted this board in the #693 live check), pinned here so a future
    // cleanup is a deliberate edit rather than a surprise.
    expect(new Set(map.zones.map((z) => z.id))).toEqual(new Set([...used, "z7"]));
    expect(used).toEqual(new Set(["z1", "z2", "z3", "z4", "z5", "z6"]));
  });

  it("has a fully symmetric, fully connected adjacency graph (no arrows)", () => {
    const byId = new Map(spaces.map((s) => [s.id, s]));
    for (const s of byId.values()) {
      for (const to of s.adjacentTo) {
        expect(byId.get(to)?.adjacentTo).toContain(s.id);
      }
    }
    const seen = new Set(["s1"]);
    const queue = ["s1"];
    while (queue.length) {
      for (const to of byId.get(queue.shift()!)!.adjacentTo) {
        if (!seen.has(to)) (seen.add(to), queue.push(to));
      }
    }
    expect(seen.size).toBe(29);
  });

  it("serves its board image from the repo (no third-party host)", () => {
    // it shipped pointing at i.ibb.co — a lobby board must not lose its tile to
    // someone else's CDN (#727).
    expect(weddingCrashersJson.meta.imageUrl).toBe(
      "https://unbrewed.xyz/maps/community-wedding-crashers.webp",
    );
    expect(weddingCrashers.thumbnailUrl).toBe(weddingCrashersJson.meta.imageUrl);
  });
});

/**
 * Pyramids (#758) — a community board by AndSushi via the-unmatched.club
 * (#755), registered like City Docks / The Bog before it: a generated
 * `ProMapDef` with an authored `supportedFormats` block for all three formats.
 * The board also prints a fifth start slot no format uses, so none encodes one.
 */
describe("pyramids fixture", () => {
  const spaces = pyramidsJson.spaces as Array<{
    id: string;
    zones: string[];
    adjacentTo: string[];
    start?: { slot: number };
  }>;

  it("normalizes clean (engine-native pass-through)", () => {
    const map = normalizeMap(pyramidsJson);
    expect(map.id).toBe("pyramids");
    expect(map.meta.title).toBe("Pyramids");
    expect(map.spaces).toHaveLength(49);
    const slots = new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));
    expect(slots).toEqual(new Set([1, 2, 3, 4]));
  });

  it("maps the four start slots to the expected spaces (s14/s36/s37/s12)", () => {
    const slotOf = (slot: number) => spaces.find((s) => s.start?.slot === slot)?.id;
    expect(slotOf(1)).toBe("s14");
    expect(slotOf(2)).toBe("s36");
    expect(slotOf(3)).toBe("s37");
    expect(slotOf(4)).toBe("s12");
  });

  it("declares 9 zones, every one of them used by at least one space", () => {
    const map = normalizeMap(pyramidsJson);
    expect(map.zones).toHaveLength(9);
    const used = new Set(spaces.flatMap((s) => s.zones));
    expect(new Set(map.zones.map((z) => z.id))).toEqual(used);
  });

  it("has a fully symmetric, fully connected adjacency graph", () => {
    const byId = new Map(spaces.map((s) => [s.id, s]));
    for (const s of byId.values()) {
      for (const to of s.adjacentTo) {
        expect(byId.get(to)?.adjacentTo).toContain(s.id);
      }
    }
    const seen = new Set(["s1"]);
    const queue = ["s1"];
    while (queue.length) {
      for (const to of byId.get(queue.shift()!)!.adjacentTo) {
        if (!seen.has(to)) (seen.add(to), queue.push(to));
      }
    }
    expect(seen.size).toBe(49);
  });

  it("serves its board image from the repo, attribution intact (no third-party host)", () => {
    expect(pyramidsJson.meta.imageUrl).toBe(
      "https://unbrewed.xyz/maps/community-pyramids-289.webp",
    );
    expect(pyramids.thumbnailUrl).toBe(pyramidsJson.meta.imageUrl);
    // AndSushi / the-unmatched.club credit must survive any future edit (#755)
    expect(pyramidsJson.meta.source).toBe("https://www.the-unmatched.club/c/maps/pyramids.289");
    expect(pyramidsJson.meta.license).toContain("AndSushi");
    expect(pyramidsJson.meta.license).toContain("the-unmatched.club");
  });
});

/**
 * mapHasItems (#725 ↔ engine #519) — the gate for the lobby's 🎁 ITEMS chip and
 * the CREATE_ROOM.itemsEnabled opt-out. The load-bearing property is that every
 * item-less shipped board, the Random tile, and any garbage in the paste box
 * read FALSE: hidden chip ⇒ absent field ⇒ a create on an item-less board stays
 * byte-identical. Wedding Crashers (#727) is the first catalog board that reads
 * TRUE — the chip's first reachable board through the picker.
 */
describe("mapHasItems — the 🎁 ITEMS chip gate (#725)", () => {
  /** A minimal engine-native board carrying one combat + one scheme item. */
  const ITEMS_MAP = {
    schemaVersion: "1.0",
    id: "wedding-crashers",
    meta: { title: "Wedding Crashers", minPlayers: 2, maxPlayers: 2, specialRules: false },
    zones: [{ id: "z", color: "#fff", label: "Z" }],
    items: [
      { id: "gift", kind: "scheme", label: "Gift Bomb", ops: [{ op: "dealDamage", amount: 1 }] },
      { id: "cake", kind: "combat", label: "Cake Knife", value: 2 },
    ],
    spaces: [
      { id: "a", x: 0.1, y: 0.1, zones: ["z"], adjacentTo: ["b"], start: { slot: 1 }, item: "gift" },
      { id: "b", x: 0.2, y: 0.2, zones: ["z"], adjacentTo: ["a"], start: { slot: 2 }, item: "cake" },
    ],
  };

  it("is TRUE for Wedding Crashers — the catalog's item board (#727)", () => {
    expect(mapHasItems("wedding-crashers", "")).toBe(true);
    // and it is the entry's OWN items array doing it, not the paste box
    expect(weddingCrashers.map.items).toHaveLength(4);
  });

  it("is false for every other shipped catalog board — none carries items", () => {
    for (const entry of MAP_CATALOG.filter((e) => e.id !== "wedding-crashers")) {
      expect(mapHasItems(entry.id, "")).toBe(false);
      expect(entry.map.items ?? []).toHaveLength(0);
    }
  });

  it("is false for the Random tile — the roll resolves at create time", () => {
    expect(mapHasItems(RANDOM_MAP_ID, "")).toBe(false);
    // …even with an items map sitting in the paste box from an earlier Custom pick
    expect(mapHasItems(RANDOM_MAP_ID, JSON.stringify(ITEMS_MAP))).toBe(false);
  });

  it("is false for Custom with a blank paste (falls back to a default board)", () => {
    expect(mapHasItems(CUSTOM_MAP_ID, "")).toBe(false);
    expect(mapHasItems(CUSTOM_MAP_ID, "   ")).toBe(false);
  });

  it("is true for a pasted engine-native map with items", () => {
    expect(mapHasItems(CUSTOM_MAP_ID, JSON.stringify(ITEMS_MAP))).toBe(true);
  });

  it("is false for a pasted map WITHOUT items", () => {
    const plain = JSON.stringify({ ...ITEMS_MAP, items: undefined, spaces: ITEMS_MAP.spaces.map(({ item: _item, ...s }) => s) });
    expect(mapHasItems(CUSTOM_MAP_ID, plain)).toBe(false);
    // an explicit empty array is just as item-less
    expect(mapHasItems(CUSTOM_MAP_ID, JSON.stringify({ ...ITEMS_MAP, items: [] }))).toBe(false);
  });

  it("swallows malformed custom JSON — no throw, chip hidden", () => {
    expect(mapHasItems(CUSTOM_MAP_ID, "{not json")).toBe(false);
    expect(mapHasItems(CUSTOM_MAP_ID, "[1,2,3]")).toBe(false);
    expect(mapHasItems(CUSTOM_MAP_ID, '{"spaces":[]}')).toBe(false); // parseable, but not a map
  });

  it("is false for an unknown board id (defensive — picker ids are catalog ids)", () => {
    expect(mapHasItems("no-such-board", "")).toBe(false);
  });
});
