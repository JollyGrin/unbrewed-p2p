import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import {
  catalogMapDef,
  composeTable,
  distance,
  MAP_SPACES,
  mapSize,
  printedSpaces,
  VIEW,
  type LobbyRequest,
} from ".";
import { FIXTURES, fakeFaces } from "./fixtures/decks";
import { buildMapList } from "./mapList";

/** A webp's pixel size, from its RIFF header (VP8, VP8L or VP8X). */
const webpSize = (file: string) => {
  const b = fs.readFileSync(file);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8 ") {
    return {
      width: b.readUInt16LE(26) & 0x3fff,
      height: b.readUInt16LE(28) & 0x3fff,
    };
  }
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
};

const mapFor = (url: string) => ({
  imageUrl: url,
  ...webpSize(path.join(process.cwd(), "public", url)),
});

const compose = (url: string) => {
  const { body } = composeTable({
    seats: [
      FIXTURES["hollow-oak"].deck,
      FIXTURES["larry-extra-characters"].deck,
    ],
    map: mapFor(url),
    faces: fakeFaces,
  });
  expect(body).not.toBeNull();
  return body as LobbyRequest;
};

/** The front-strip snap points every table has, before any space. */
const STRIPS = 4;

const CLUB = "/maps/community-cuartel-moncada-161.webp";
const CV = "/maps/legacy-pharohs-tomb.webp";

describe.each([
  ["club", CLUB],
  ["cv", CV],
])("a %s map", (source, url) => {
  const entry = MAP_SPACES[url];
  const body = compose(url);
  const map = mapFor(url);
  const { width, height } = mapSize(map.width / map.height);

  it("has an entry from that source", () => {
    expect(entry.source).toBe(source);
  });

  it("snaps to every printed space, inside the map's footprint", () => {
    const spaces = body.snapPoints.slice(STRIPS);
    expect(spaces).toHaveLength(entry.spaces.length);
    for (const s of spaces) {
      expect(Math.abs(s.position[0])).toBeLessThanOrEqual(width / 2);
      expect(Math.abs(s.position[1])).toBeLessThanOrEqual(height / 2);
      expect(s.radius).toBeCloseTo((entry.spaceDiameter * width) / 2, 1);
    }
  });

  it("starts each hero on a start space on its own half", () => {
    const starts = new Set(
      entry.starts!.map((s) =>
        [(s.x - 0.5) * width, (s.y - 0.5) * height]
          .map((n) => Math.round(n * 100) / 100)
          .join(),
      ),
    );
    const heroes = body.placements.filter(
      (p) => p.kind === "piece" && starts.has(p.position.join()),
    );
    expect(heroes.map((p) => p.seat).sort()).toEqual([0, 1]);
  });

  it("resolves from a relative or an absolute url", () => {
    expect(printedSpaces(url)).not.toBeNull();
    expect(printedSpaces(`https://unbrewed.xyz${url}`)).toEqual(
      printedSpaces(url),
    );
  });
});

it("a map with no entry gets no space snap points", () => {
  const { body } = composeTable({
    seats: [
      FIXTURES["hollow-oak"].deck,
      FIXTURES["larry-extra-characters"].deck,
    ],
    map: { imageUrl: "/maps/uploaded-board.webp", width: 1300, height: 1000 },
    faces: fakeFaces,
  });
  expect(printedSpaces("/maps/uploaded-board.webp")).toBeNull();
  expect(body!.snapPoints).toHaveLength(STRIPS);
});

it("a Pro def wins over mapSpaces.json, and no entry shadows one", () => {
  for (const url of Object.keys(MAP_SPACES)) {
    expect(catalogMapDef(url)).toBeNull();
  }
  expect(MAP_CATALOG.length).toBeGreaterThan(0);
});

describe.each(Object.entries(MAP_SPACES))("%s", (url, entry) => {
  const body = compose(url);
  const map = mapFor(url);
  const { width } = mapSize(map.width / map.height);
  const spaces = body.snapPoints.slice(STRIPS).map((s) => s.position);

  it("puts a snap point on every space, all inside the VIEW box", () => {
    expect(spaces).toHaveLength(entry.spaces.length);
    for (const [x, z] of spaces) {
      expect(Math.abs(x)).toBeLessThanOrEqual(VIEW.halfX);
      expect(Math.abs(z)).toBeLessThanOrEqual(VIEW.halfZ);
    }
  });

  it("keeps every two space centres at least 0.8 space diameters apart", () => {
    const min = 0.8 * entry.spaceDiameter * width;
    for (let i = 0; i < spaces.length; i++) {
      for (let j = i + 1; j < spaces.length; j++) {
        expect(distance(spaces[i], spaces[j])).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it("prints start slots 1 and 2 on its spaces, or none", () => {
    if (!entry.starts) return;
    const slots = entry.starts.map((s) => s.slot);
    expect(slots).toEqual(expect.arrayContaining([1, 2]));
    expect(new Set(slots).size).toBe(slots.length);
    for (const s of entry.starts) {
      expect(entry.spaces).toContainEqual({ x: s.x, y: s.y });
    }
  });

  it("is marked as a board with spaces in the picker", () => {
    const option = buildMapList().find((m) => m.imgUrl === url);
    if (option) expect(option.spaces).toBe(true);
  });
});
