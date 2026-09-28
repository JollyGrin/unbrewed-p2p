import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import mendedDrum from "@/lib/pro/fixtures/mended-drum.map.json";
import {
  balancedFaces,
  CARD_STACK_RADIUS,
  catalogMapDef,
  composeTable,
  distance,
  faceJobs,
  FELT_HALF_X,
  FELT_HALF_Z,
  mapSize,
  PLACEMENT_CAP,
  SNAP_POINT_CAP,
  type CallerPlacement,
  type FaceIndex,
  type LobbyRequest,
} from ".";
import { FIXTURES, fakeFaces, tokenDeck } from "./fixtures/decks";

const DRUM = {
  imageUrl: "https://unbrewed.xyz/maps/legacy-the-mended-drum.webp",
  width: 1145,
  height: 857,
};
const plain = (ratio: number) => ({
  imageUrl: `https://x/plain-${ratio}.webp`,
  width: Math.round(1000 * ratio),
  height: 1000,
});

const { deck: oak } = FIXTURES["hollow-oak"];
const { deck: larry } = FIXTURES["larry-extra-characters"];

const compose = (
  map: typeof DRUM,
  seats: [DeckImportType, DeckImportType] = [oak, larry],
) => {
  const r = composeTable({ seats, map, faces: fakeFaces });
  expect(r.body).not.toBeNull();
  return r as { body: LobbyRequest; skipped: string[] };
};

const packOf = (body: LobbyRequest, p: CallerPlacement) =>
  body.packs.find((k) => k.id === p.pack)!;
/** A piece figure standing on the board rather than in a player area. */
const onBoard = (body: LobbyRequest, p: CallerPlacement) => {
  if (p.kind !== "piece") return false;
  const { width, height } = mapSize(DRUM.width / DRUM.height);
  const [x, z] = p.position;
  return (
    packOf(body, p).pieces![p.piece].kind === "token" &&
    Math.abs(x) < width / 2 &&
    Math.abs(z) < height / 2
  );
};

describe.each([
  ["Mended Drum (ProMapDef)", DRUM],
  ["plain 1.23", plain(1.23)],
  ["plain 1.54", plain(1.54)],
  ["plain 1.80", plain(1.8)],
])("%s", (_, map) => {
  const { body, skipped } = compose(map);
  const { width, height } = mapSize(map.width / map.height);

  it("fits both decks with nothing skipped", () => {
    expect(skipped).toEqual([]);
    expect(body.layout).toBe("duel-2p");
    expect(body.packs.map((p) => p.scope)).toEqual([
      "player",
      "player",
      "table",
    ]);
  });

  it("keeps every placement and snap point on the felt, as [x, z]", () => {
    for (const { position } of [...body.placements, ...body.snapPoints]) {
      expect(position).toHaveLength(2);
      expect(Math.abs(position[0])).toBeLessThanOrEqual(FELT_HALF_X);
      expect(Math.abs(position[1])).toBeLessThanOrEqual(FELT_HALF_Z);
    }
  });

  it("keeps every card pile clear of the map", () => {
    for (const p of body.placements.filter((p) => p.kind === "deck")) {
      const [x, z] = p.position;
      const clearX = Math.abs(x) - 0.7 > width / 2;
      const clearZ = Math.abs(z) - 1 > height / 2;
      expect(clearX || clearZ).toBe(true);
    }
  });

  it("places every pack piece exactly once, at its authored position", () => {
    for (const pack of body.packs.filter((p) => p.scope === "player")) {
      const placed = body.placements.filter(
        (p) => p.kind === "piece" && p.pack === pack.id,
      );
      expect(placed.map((p) => (p.kind === "piece" ? p.piece : -1))).toEqual(
        pack.pieces!.map((_, i) => i),
      );
      placed.forEach((p) =>
        expect(pack.pieces![(p as { piece: number }).piece].position).toEqual(
          p.position,
        ),
      );
    }
  });

  it("keeps everything 1.7 apart, bar the figures on the board", () => {
    const loose = body.placements.filter((p) => !onBoard(body, p));
    for (let i = 0; i < loose.length; i++) {
      for (let j = i + 1; j < loose.length; j++) {
        expect(
          distance(loose[i].position, loose[j].position),
        ).toBeGreaterThanOrEqual(CARD_STACK_RADIUS);
      }
    }
  });

  it("turns each seat's things to face it", () => {
    for (const p of body.placements) {
      expect(p.rotation).toBe(p.seat === 0 ? 0 : 180);
    }
  });
});

describe("seat 1 mirrors seat 0", () => {
  it.each([
    ["plain", plain(1.54)],
    ["Mended Drum", DRUM],
  ])("%s: every off-board placement is (-x, -z)", (_, map) => {
    const { body } = compose(map, [oak, oak]);
    const side = (seat: number) =>
      body.placements.filter((p) => p.seat === seat && !onBoard(body, p));
    const [a, b] = [side(0), side(1)];
    expect(a.length).toBeGreaterThan(0);
    expect(b).toHaveLength(a.length);
    a.forEach((p, i) => {
      const q = b[i];
      expect(q.kind).toBe(p.kind);
      expect(q.position[0]).toBeCloseTo(-p.position[0], 9);
      expect(q.position[1]).toBeCloseTo(-p.position[1], 9);
    });
    const strips = body.snapPoints.slice(0, 4);
    expect(strips.map((s) => s.position)).toEqual([
      [-1.2, 13.2],
      [1.2, 13.2],
      [1.2, -13.2],
      [-1.2, -13.2],
    ]);
  });

  it("puts the seat 0 player area to seat 0's right (+x)", () => {
    const { body } = compose(plain(1.54), [oak, oak]);
    const deck0 = body.placements.find(
      (p) => p.kind === "deck" && p.seat === 0 && p.slot === "deck",
    )!;
    expect(deck0.position[0]).toBeGreaterThan(17);
    expect(deck0.position[1]).toBeGreaterThan(0);
  });
});

describe("Mended Drum", () => {
  const def = catalogMapDef(DRUM.imageUrl)!;
  const { body } = compose(DRUM);

  it("finds its ProMapDef by image url", () => {
    expect(def.id).toBe(mendedDrum.id);
  });

  it("snaps to every printed space, plus four front-strip spots", () => {
    expect(body.snapPoints).toHaveLength(mendedDrum.spaces.length + 4);
    const { width } = mapSize(DRUM.width / DRUM.height);
    expect(body.snapPoints[4].radius).toBeCloseTo(
      (mendedDrum.meta.spaceDiameter * width) / 2,
      1,
    );
  });

  it("stands each hero on its start space and the sidekicks off spaces", () => {
    const spaces = body.snapPoints.slice(4);
    const space = (slot: number) =>
      spaces[mendedDrum.spaces.findIndex((s) => s.start?.slot === slot)];
    const figures = body.placements.filter((p) => onBoard(body, p));
    const names = figures.map(
      (p) => packOf(body, p).pieces![(p as { piece: number }).piece].name,
    );
    const hero0 = figures[names.indexOf("The Hollow Oak")];
    const hero1 = figures[names.indexOf(larry.deck_data.hero.name)];
    expect(hero0.seat).toBe(0);
    expect(hero0.position).toEqual(space(1).position);
    expect(hero1.seat).toBe(1);
    expect(hero1.position).toEqual(space(2).position);
    expect(hero0.position).not.toEqual(hero1.position);

    // hollow-oak's fox and Larry's four larries are beside their hero
    const sidekicks = figures.filter((p) => p !== hero0 && p !== hero1);
    expect(sidekicks).toHaveLength(5);
    const radius = (p: CallerPlacement) =>
      packOf(body, p).pieces![(p as { piece: number }).piece].radius!;
    for (let i = 0; i < figures.length; i++) {
      for (let j = i + 1; j < figures.length; j++) {
        expect(
          distance(figures[i].position, figures[j].position),
        ).toBeGreaterThanOrEqual(
          radius(figures[i]) + radius(figures[j]) - 1e-6,
        );
      }
    }
    for (const s of sidekicks) {
      expect(spaces.some((sp) => sp.position === s.position)).toBe(false);
    }
  });

  it("sizes the figures to the printed spaces", () => {
    const { width } = mapSize(DRUM.width / DRUM.height);
    const piece = body.packs[0].pieces!.find(
      (p) => p.name === "The Hollow Oak",
    );
    expect(piece!.radius).toBeCloseTo(
      Math.min(1.2, 0.45 * mendedDrum.meta.spaceDiameter * width),
      1,
    );
  });
});

describe("a board with no ProMapDef", () => {
  const { body } = compose(plain(1.54));
  it("has only the front-strip snap points", () => {
    expect(body.snapPoints).toHaveLength(4);
  });
  it("stands the figures in their own player area", () => {
    const figures = body.placements.filter(
      (p) =>
        p.kind === "piece" &&
        packOf(body, p).pieces![p.piece].kind === "token" &&
        Math.abs(p.position[0]) < 17,
    );
    expect(figures).toEqual([]);
  });
});

describe("caps", () => {
  const DIR = path.join(process.cwd(), "public/evergreen-decks");
  const decks = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .map(
      (f) =>
        JSON.parse(
          fs.readFileSync(path.join(DIR, f), "utf8"),
        ) as DeckImportType,
    );
  const faces = (deck: DeckImportType) => {
    const index: FaceIndex = {
      version: 1,
      decks: {
        [deck.id]: Object.fromEntries(
          faceJobs(deck).map((j) => [
            j.key,
            { path: `${deck.id}/${j.key}.webp`, hash: j.hash },
          ]),
        ),
      },
    };
    return balancedFaces(index, deck);
  };
  const size = (deck: DeckImportType) => {
    const { body } = composeTable({
      seats: [deck, deck],
      map: DRUM,
      faces: faces(deck),
    });
    return body!.placements.length;
  };

  it("fits the largest balanced deck against itself", () => {
    const largest = decks.reduce((a, b) => (size(b) > size(a) ? b : a));
    const { body, skipped } = composeTable({
      seats: [largest, largest],
      map: DRUM,
      faces: faces(largest),
    });
    expect(skipped).toEqual([]);
    expect(body!.placements.length).toBeLessThanOrEqual(PLACEMENT_CAP);
    expect(body!.snapPoints.length).toBeLessThanOrEqual(SNAP_POINT_CAP);
  });

  it("drops saved tokens from the end rather than sending a 413", () => {
    const hoard = tokenDeck();
    hoard.savedTokens = Array.from({ length: 60 }, (_, i) => ({
      imageUrl: `https://unbrewed.xyz/tokens/t${i}.png`,
      size: 72,
    }));
    const { body, skipped } = composeTable({
      seats: [hoard, hoard],
      map: DRUM,
      faces: fakeFaces,
    });
    expect(body!.placements).toHaveLength(PLACEMENT_CAP);
    expect(skipped.length).toBeGreaterThan(0);
    expect(skipped[0]).toMatch(/Token 60/);
    // every piece that stayed in a pack is still placed
    for (const pack of body!.packs.filter((p) => p.scope === "player")) {
      expect(
        body!.placements.filter(
          (p) => p.kind === "piece" && p.pack === pack.id,
        ),
      ).toHaveLength(pack.pieces!.length);
      expect(pack.pieces!.some((p) => p.name === "Token 1")).toBe(true);
    }
  });

  it("refuses a deck with a missing face before composing anything", () => {
    const r = composeTable({
      seats: [oak, oak],
      map: DRUM,
      faces: [fakeFaces, (c) => (c.title === "Foxfire" ? null : fakeFaces(c))],
    });
    expect(r.body).toBeNull();
    expect(r.skipped).toEqual(["Seat 1: Foxfire: no finished face"]);
  });
});
