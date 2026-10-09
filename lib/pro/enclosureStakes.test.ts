import { ISLA_NUBLAR_SPACES, ISLA_NUBLAR_SPACE_DIAMETER } from "../../test/pro/fixtures/islaNublarSpaces";
import { enclosureModel } from "./enclosures";
import {
  ADJACENT_CHIP,
  NEXT_CHIP,
  TIE_CHIP,
  wrapChip,
  enclosureStakes,
  placeStakeChips,
  rectHitsCircle,
  stakeChipText,
} from "./enclosureStakes";
import type { ProMapDef } from "./protocol";

const map = {
  schemaVersion: "1",
  id: "m",
  meta: { title: "M", minPlayers: 1, maxPlayers: 4, specialRules: false },
  zones: [],
  spaces: ["a", "b", "c", "d"].map((id, i) => ({ id, x: 0.1 + i * 0.2, y: 0.1, zones: [], adjacentTo: [], startsBlocked: id !== "d" })),
  scenario: { groups: [{ id: "enclosures", kind: "CONTAINS", spaces: ["a", "b", "c"], order: [1, 2, 3] }] },
} as unknown as ProMapDef;
const fighters = [{ id: "f1", name: "Gallimimus" }];
const sc = (over: object) => ({ threat: { position: 0, level: 0, overflows: 0, positions: [] }, objectives: [], ...over }) as never;

describe("enclosureStakes mapping", () => {
  it("absent scenario / contacts ⇒ no stakes (today's badges)", () => {
    expect(enclosureModel(map, ["a", "b", "c"])!.stakes).toEqual({});
    expect(enclosureModel(map, ["a", "b", "c"], sc({}), fighters)!.stakes).toEqual({});
  });

  it("adjacent and nextToOpen map to rings; follows the villain between snapshots", () => {
    const at = (adjacent: string[], nextToOpen: string[]) =>
      enclosureModel(map, ["a", "b", "c"], sc({ contacts: { adjacent, nextToOpen } }), fighters)!.stakes;
    expect(at(["a"], ["b"])).toEqual({
      a: { adjacent: true, next: false, tie: false },
      b: { adjacent: false, next: true, tie: false },
    });
    expect(at(["b"], ["b"]).b).toEqual({ adjacent: true, next: true, tie: false });
    expect(at([], [])).toEqual({});
  });

  it("2+ nextToOpen is a tie", () => {
    const st = enclosureModel(map, ["a", "b", "c"], sc({ contacts: { adjacent: [], nextToOpen: ["a", "c"] } }), fighters)!.stakes;
    expect(stakeChipText(st.a)).toEqual([TIE_CHIP]);
    expect(stakeChipText(st.c)).toEqual([TIE_CHIP]);
  });

  it("chip texts", () => {
    expect(stakeChipText({ adjacent: true, next: true, tie: false })).toEqual([ADJACENT_CHIP, NEXT_CHIP]);
  });

  it("a destroyed enclosure shows the released enemy (by space, or by printed label)", () => {
    const releases = [
      { round: 2, space: "a", fighter: "f1", enemyId: "gallimimus" },
      { round: 3, spaceLabel: "2", fighter: "zz", enemyId: "carnotaurus" },
    ];
    const st = enclosureModel(map, ["c"], sc({ releases, display: { markers: { carnotaurus: "Carnotaurus" } } }), fighters)!.stakes;
    expect(st.a.release).toEqual({ name: "Gallimimus", glyph: "Ga" });
    expect(st.b.release).toEqual({ name: "carnotaurus", glyph: "Ca" });
    expect(st.c).toBeUndefined();
  });

  it("ignores stakes for spaces that are not (any longer) closed", () => {
    const st = enclosureStakes(sc({ contacts: { adjacent: ["a"], nextToOpen: ["a"] } }), [], new Set(), new Set(["a"]), {});
    expect(st).toEqual({});
  });
});

// The fixture's y is a fraction of the image WIDTH; the client renders `top: y%` of the HEIGHT.
const ASPECT = 1728 / 2592;
const SPACES = ISLA_NUBLAR_SPACES.map((s) => ({ ...s, y: s.y / ASPECT }));

describe("chip placement vs spaces/tokens (#1135/#1139 rule)", () => {
  const hits = (frame: number, id: string, p: { dx: number; dy: number; w: number; h: number }) => {
    const me = SPACES.find((s) => s.id === id)!;
    const rc = {
      l: me.x * frame + p.dx - p.w / 2,
      t: me.y * frame * ASPECT + p.dy - p.h / 2,
      r: me.x * frame + p.dx + p.w / 2,
      b: me.y * frame * ASPECT + p.dy + p.h / 2,
    };
    const rad = (ISLA_NUBLAR_SPACE_DIAMETER * frame) / 2;
    return SPACES.filter((s) => rectHitsCircle(rc, s.x * frame, s.y * frame * ASPECT, rad)).map((s) => s.id);
  };

  it("probe detects a planted positive: a chip sitting on the space", () => {
    expect(hits(1500, "s23", { dx: 0, dy: 0, w: 150, h: 15 })).toContain("s23");
  });

  it.each([1500 - 336, 1920 - 336, 1500, 1920])("no chip touches any space at frame width %i", (frame) => {
    const reqs = SPACES.map((s) => ({ id: s.id, texts: [ADJACENT_CHIP, NEXT_CHIP] }));
    const out = placeStakeChips(reqs, SPACES, ISLA_NUBLAR_SPACE_DIAMETER, frame, ASPECT);
    let placed = 0;
    for (const [id, p] of Object.entries(out)) {
      if (!p) continue;
      placed++;
      expect(hits(frame, id, p)).toEqual([]);
    }
    expect(placed).toBeGreaterThan(0);
  });

  it("wraps a chip to fit a narrow gap, in balanced lines", () => {
    expect(wrapChip(NEXT_CHIP, 1)).toEqual([NEXT_CHIP]);
    expect(wrapChip(NEXT_CHIP, 2).join(" ")).toBe(NEXT_CHIP);
    expect(wrapChip(NEXT_CHIP, 3)).toHaveLength(3);
  });

  it("collapses to ring only when crowded", () => {
    const dense = [0, 1, 2, 3, 4, 5].flatMap((r) => [0, 1, 2, 3, 4, 5].map((c) => ({ id: `${r}${c}`, x: 0.1 + c * 0.05, y: 0.1 + r * 0.05 })));
    const out = placeStakeChips([{ id: "22", texts: [NEXT_CHIP] }], dense, 0.045, 1000, 1);
    expect(out["22"]).toBeNull();
  });
});
