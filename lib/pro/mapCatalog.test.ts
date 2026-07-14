import {
  MAP_CATALOG,
  CUSTOM_MAP_ID,
  catalogEntry,
  customMapForEntry,
  defaultMapIdForFormat,
  eligibleFormats,
  ineligibleReason,
  mapEligibleForFormat,
  type CatalogMap,
} from "./mapCatalog";
import { normalizeMap } from "./normalizeMap";
import islandOfDespairJson from "./fixtures/island-of-despair.map.json";
import weathertopJson from "./fixtures/weathertop.map.json";

const island = catalogEntry("island-of-despair")!;
const mendedDrum = catalogEntry("mended-drum")!;
const cityDocks = catalogEntry("city-docks")!;
const polus = catalogEntry("polus")!;
const weathertop = catalogEntry("weathertop")!;
const arena = catalogEntry("multiplayer-arena-playtest")!;

describe("map catalog", () => {
  it("lists the built-in boards in order", () => {
    expect(MAP_CATALOG.map((e) => e.id)).toEqual([
      "mended-drum",
      "island-of-despair",
      "city-docks",
      "polus",
      "weathertop",
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
