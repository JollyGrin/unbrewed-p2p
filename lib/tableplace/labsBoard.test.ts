import { describe, expect, it } from "@jest/globals";
import lucy from "@/lib/labs/fixtures/set-by-slug.lucy-piper.json";
import lucySave from "@/lib/labs/fixtures/tts-save.lucy-piper.json";
import {
  buildLabsImport,
  parseLabsTtsMap,
  parseLabsTtsSave,
  type LabsSetRow,
} from "@/lib/labs";
import type { MapLayout } from "@/lib/hooks/useLocalStorage";
import { composeTable } from "./composeTable";
import { boardGeometry, distance, mapSize } from "./layout";
import type { CallerPlacement, LobbyRequest } from "./types";

// Lucy & Piper on the backyard (#1056): the real set row and hosted save.
const LUCY_ID = "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3";
const imported = buildLabsImport(
  {
    row: (lucy as unknown as LabsSetRow[])[0],
    ttsModels: parseLabsTtsSave(lucySave),
    ttsMap: parseLabsTtsMap(lucySave),
  },
  LUCY_ID,
);
const deck = imported.deck;
const bagMap = imported.map!.map;
const layout = bagMap.layout!;
// the hosted render's size
const BACKYARD = { imageUrl: bagMap.imgUrl, width: 3072, height: 1705 };
const board = boardGeometry(layout, BACKYARD.width / BACKYARD.height);

const compose = (mapDef?: MapLayout) => {
  const r = composeTable({
    seats: [deck, deck],
    map: BACKYARD,
    faces: () => null,
    ...(mapDef ? { mapDef } : {}),
  });
  expect(r.body).not.toBeNull();
  return r.body as LobbyRequest;
};

const heroOf = (body: LobbyRequest, seat: number) =>
  body.placements.find(
    (p): p is Extract<CallerPlacement, { kind: "piece" }> =>
      p.kind === "piece" &&
      p.seat === seat &&
      body.packs.find((k) => k.id === p.pack)!.pieces![p.piece].kind ===
        "token" &&
      body.packs.find((k) => k.id === p.pack)!.pieces![p.piece].name ===
        deck.deck_data.hero.name,
  )!;

describe("Lucy & Piper's backyard on /table", () => {
  const body = compose(layout);

  it("snaps to all 34 printed spaces plus the 4 combat spots", () => {
    expect(body.snapPoints).toHaveLength(4 + 34);
    const radii = body.snapPoints.slice(4).map((s) => s.radius);
    expect(new Set(radii)).toEqual(new Set([board.spaceRadius]));
  });

  it("puts each hero on its own start circle: seat 0 on slot 1, seat 1 on slot 2", () => {
    const slot = (n: number) => board.spaces.find((s) => s.start === n)!;
    expect(heroOf(body, 0).position).toEqual(slot(1).position);
    expect(heroOf(body, 1).position).toEqual(slot(2).position);
    // seat 0 sits at +z: its start is on its own half
    expect(slot(1).position[1]).toBeGreaterThan(0);
    expect(slot(2).position[1]).toBeLessThan(0);
  });

  it("keeps every space on the map", () => {
    const { width, height } = mapSize(BACKYARD.width / BACKYARD.height);
    for (const s of board.spaces) {
      expect(Math.abs(s.position[0])).toBeLessThan(width / 2);
      expect(Math.abs(s.position[1])).toBeLessThan(height / 2);
    }
    // neighbouring spaces never overlap: they are a space apart or more
    for (const a of board.spaces)
      for (const b of board.spaces)
        if (a !== b)
          expect(distance(a.position, b.position)).toBeGreaterThanOrEqual(
            2 * board.spaceRadius - 0.01,
          );
  });

  it("a map with no layout works as before: combat spots only, figures off the board", () => {
    const plain = compose();
    expect(plain.snapPoints).toHaveLength(4);
    const { width, height } = mapSize(BACKYARD.width / BACKYARD.height);
    const [x, z] = heroOf(plain, 0).position;
    expect(Math.abs(x) > width / 2 || Math.abs(z) > height / 2).toBe(true);
  });

  it("a board with no start slots snaps every space and keeps the heroes off it", () => {
    const noStarts: MapLayout = {
      ...layout,
      spaces: layout.spaces.map(({ start: _start, ...s }) => s),
    };
    const b = compose(noStarts);
    expect(b.snapPoints).toHaveLength(4 + 34);
    const { width, height } = mapSize(BACKYARD.width / BACKYARD.height);
    for (const seat of [0, 1]) {
      const [x, z] = heroOf(b, seat).position;
      expect(Math.abs(x) > width / 2 || Math.abs(z) > height / 2).toBe(true);
    }
  });
});
