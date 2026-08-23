import {
  MAP_CATALOG,
  CUSTOM_MAP_ID,
  catalogEntry,
  customMapForEntry,
  defaultMapIdForFormat,
  eligibleFormats,
  ineligibleReason,
  mapEligibleForFormat,
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

const island = catalogEntry("island-of-despair")!;
const mendedDrum = catalogEntry("mended-drum")!;
const cityDocks = catalogEntry("city-docks")!;
const polus = catalogEntry("polus")!;
const weathertop = catalogEntry("weathertop")!;
const countsCastle = catalogEntry("counts-castle")!;
const nostromo = catalogEntry("uscss-nostromo")!;
const theBog = catalogEntry("the-bog")!;
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
 * The Random tile (#685) resolves at room-create time. 1v1 deliberately rolls
 * only the SMALLER boards — the big four (Weathertop, Count's Castle, USCSS
 * Nostromo, The Bog) stay hand-pickable but never land on a duel by chance.
 */
describe("random board pool", () => {
  const BIG_BOARDS = ["weathertop", "counts-castle", "uscss-nostromo", "the-bog"];

  it("duel rolls only the four flagged small boards", () => {
    expect(randomMapPool("duel").map((e) => e.id)).toEqual([
      "mended-drum",
      "island-of-despair",
      "city-docks",
      "polus",
    ]);
  });

  it("duel never rolls a big board", () => {
    for (const id of BIG_BOARDS) {
      expect(randomMapPool("duel").map((e) => e.id)).not.toContain(id);
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
    const polusRoll = rollRandomMap("duel", () => 0.99);
    expect(polusRoll.id).toBe("polus");
    expect(customMapForEntry(polusRoll)!.id).toBe("polus");
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
