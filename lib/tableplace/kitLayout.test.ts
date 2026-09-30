import { describe, expect, it } from "@jest/globals";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import bob from "@/lib/labs/fixtures/set-by-slug.bob-the-bee.json";
import brigade from "@/lib/labs/fixtures/set-by-slug.dumbass-brigade.json";
import lucy from "@/lib/labs/fixtures/set-by-slug.lucy-piper.json";
import bobSave from "@/lib/labs/fixtures/tts-save.bob-the-bee.json";
import brigadeSave from "@/lib/labs/fixtures/tts-save.dumbass-brigade.json";
import lucySave from "@/lib/labs/fixtures/tts-save.lucy-piper.json";
import { buildLabsImport, parseLabsTtsSave, type LabsSetRow } from "@/lib/labs";
import balanced from "../../public/evergreen-decks/hollow-oak.json";
import { composeTable } from "./composeTable";
import { FIXTURES, fakeFaces, ruleCardsDeck } from "./fixtures/decks";
import {
  CARD_STACK_RADIUS,
  CARD_ORDER,
  CARD_ROW_CELLS,
  distance,
  forSeat,
  FRONT_ROW_Z,
  isRuleSlot,
  mapSize,
  PIECE_ROW_Z,
  pileX,
  ruleCardSplit,
  ruleSlot,
  seatArea,
  TOKEN_RADIUS,
  VIEW,
  type XZ,
} from "./layout";
import type { CallerPlacement, LobbyRequest } from "./types";

const labsDeck = (row: unknown, save: unknown, id: string) =>
  buildLabsImport(
    { row: (row as LabsSetRow[])[0], ttsModels: parseLabsTtsSave(save) },
    id,
  ).deck;
const lucyDeck = () =>
  labsDeck(lucy, lucySave, "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3");
const elliotDeck = () =>
  labsDeck(brigade, brigadeSave, "char_0848bf26-989a-44f4-95c2-ce67373b146d");
const bobDeck = () =>
  labsDeck(bob, bobSave, "char_3018fbe4-0fb5-4fe0-81f5-18736d2afbfe");
const balancedDeck = () =>
  JSON.parse(JSON.stringify(balanced)) as unknown as DeckImportType;

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

// Labs decks answer no faces on /table; the rest take the fake renderer
const faces = (deck: DeckImportType) =>
  deck.id.startsWith("char_") || deck.id.startsWith("labs")
    ? () => null
    : fakeFaces;

const compose = (seats: [DeckImportType, DeckImportType], map: typeof DRUM) => {
  const r = composeTable({
    seats,
    map,
    faces: [faces(seats[0]), faces(seats[1])],
  });
  expect(r.body).not.toBeNull();
  return r as { body: LobbyRequest; skipped: string[] };
};

type Shape = { seat: number; kind: string; at: XZ } & (
  { rect: [number, number] } | { r: number }
);

/** Every off-board thing with its footprint: a card is 1.4 × 2. */
const shapes = (body: LobbyRequest, map: typeof DRUM): Shape[] => {
  const { width, height } = mapSize(map.width / map.height);
  return body.placements.flatMap((p: CallerPlacement): Shape[] => {
    if (p.kind === "deck") {
      return [{ seat: p.seat!, kind: "deck", at: p.position, rect: [0.7, 1] }];
    }
    if (p.kind !== "piece") return [];
    const piece = body.packs.find((k) => k.id === p.pack)!.pieces![p.piece];
    const [x, z] = p.position;
    // a figure standing on the board is the map's business, not the kit's
    if (
      piece.kind === "token" &&
      Math.abs(x) < width / 2 &&
      Math.abs(z) < height / 2
    ) {
      return [];
    }
    return [
      {
        seat: p.seat!,
        kind: piece.kind,
        at: p.position,
        r: piece.radius ?? TOKEN_RADIUS,
      },
    ];
  });
};
const half = (s: Shape): [number, number] =>
  "rect" in s ? s.rect : [s.r, s.r];

const EPS = 1e-9;

type Deck = () => DeckImportType;
describe.each<[string, [Deck, Deck], typeof DRUM]>([
  ["Balanced vs Lucy & Piper, Mended Drum", [balancedDeck, lucyDeck], DRUM],
  [
    "Balanced vs Lucy & Piper, widest map",
    [balancedDeck, lucyDeck],
    plain(1.625),
  ],
  [
    "Elliot Becker vs Bob the Bee, widest map",
    [elliotDeck, bobDeck],
    plain(1.625),
  ],
  ["Elliot Becker vs Bob the Bee, Mended Drum", [elliotDeck, bobDeck], DRUM],
  [
    "Elliot Becker vs Bob the Bee, narrow map",
    [elliotDeck, bobDeck],
    plain(1.23),
  ],
  ["Bob the Bee vs Elliot Becker, flat map", [bobDeck, elliotDeck], plain(2.2)],
  [
    "Oak vs Larry's extra characters",
    [
      () => FIXTURES["hollow-oak"].deck,
      () => FIXTURES["larry-extra-characters"].deck,
    ],
    plain(1.54),
  ],
  [
    "Three rule cards each, Mended Drum",
    [() => ruleCardsDeck(3), () => ruleCardsDeck(3)],
    DRUM,
  ],
  [
    "More rule cards than the card row holds, widest map",
    [() => ruleCardsDeck(6), () => ruleCardsDeck(6)],
    plain(1.625),
  ],
])("%s", (_, [a, b], map) => {
  const { body, skipped } = compose([a(), b()], map);
  const all = shapes(body, map);
  const { width, height } = mapSize(map.width / map.height);

  it("fits everything, nothing left off for lack of room", () => {
    expect(skipped).toEqual([]);
    for (const seat of [0, 1]) {
      const mine = all.filter((s) => s.seat === seat);
      expect(mine.filter((s) => "rect" in s).length).toBeGreaterThan(2);
      expect(mine.filter((s) => "r" in s).length).toBeGreaterThan(0);
    }
  });

  it("keeps each seat's kit on that player's right half", () => {
    for (const s of all) {
      const right = s.seat === 0 ? s.at[0] : -s.at[0];
      expect(right - half(s)[0]).toBeGreaterThan(0);
    }
  });

  it("keeps the whole kit off the map and inside VIEW", () => {
    for (const s of all) {
      const [hx, hz] = half(s);
      const [x, z] = s.at;
      expect(
        Math.abs(x) - hx >= width / 2 - EPS ||
          Math.abs(z) - hz >= height / 2 - EPS,
      ).toBe(true);
      expect(Math.abs(x) + hx).toBeLessThanOrEqual(VIEW.halfX + EPS);
      expect(Math.abs(z) + hz).toBeLessThanOrEqual(VIEW.halfZ + EPS);
    }
  });

  it("keeps every two card piles apart, and nothing overlapping", () => {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [p, q] = [all[i], all[j]];
        if ("rect" in p && "rect" in q) {
          expect(distance(p.at, q.at)).toBeGreaterThanOrEqual(
            CARD_STACK_RADIUS,
          );
        }
        const [px, pz] = half(p);
        const [qx, qz] = half(q);
        const dx = Math.abs(p.at[0] - q.at[0]) - px - qx;
        const dz = Math.abs(p.at[1] - q.at[1]) - pz - qz;
        if ("r" in p && "r" in q) {
          expect(distance(p.at, q.at)).toBeGreaterThanOrEqual(p.r + q.r - EPS);
        } else {
          expect(dx >= -EPS || dz >= -EPS).toBe(true);
        }
      }
    }
  });

  it("puts the first dial right beside the hero card", () => {
    for (const seat of [0, 1]) {
      const dial = all.find((s) => s.seat === seat && s.kind === "counter")!;
      const hero = body.placements.find(
        (p) => p.seat === seat && p.kind === "deck" && p.slot === "hero",
      )!;
      const sign = seat === 0 ? 1 : -1;
      expect(dial.at).toEqual([hero.position[0], sign * PIECE_ROW_Z]);
    }
  });
});

describe("seat 1 is seat 0's mirror image", () => {
  it.each<[string, Deck, typeof DRUM]>([
    ["Elliot Becker, no board", elliotDeck, plain(1.625)],
    ["Bob the Bee, Mended Drum", bobDeck, DRUM],
    ["Balanced, Mended Drum", balancedDeck, DRUM],
  ])("%s", (_, deck, map) => {
    const { body } = compose([deck(), deck()], map);
    const all = shapes(body, map);
    const [a, b] = [0, 1].map((seat) => all.filter((s) => s.seat === seat));
    expect(a.length).toBeGreaterThan(0);
    expect(b).toHaveLength(a.length);
    a.forEach((p, i) => {
      expect(b[i].kind).toBe(p.kind);
      expect(b[i].at[0]).toBeCloseTo(-p.at[0], 9);
      expect(b[i].at[1]).toBeCloseTo(-p.at[1], 9);
    });
  });
});

describe("each seat's card piles", () => {
  it.each<[string, Deck, number]>([
    ["every pile", () => FIXTURES["larry-extra-characters"].deck, 6],
    ["no sidekick or extras card", elliotDeck, 4],
  ])(
    "%s: from the draw deck, by the boost, to the rules, with no gaps",
    (_, deck, count) => {
      const { body } = compose([deck(), deck()], DRUM);
      for (const seat of [0, 1]) {
        const sign = seat === 0 ? 1 : -1;
        const row = body.placements
          .filter((p) => p.kind === "deck" && p.seat === seat)
          .sort((p, q) => sign * (p.position[0] - q.position[0]))
          .map((p) => [(p as { slot: string }).slot, p.position]);
        expect(row).toHaveLength(count);
        expect(row).toEqual(
          CARD_ORDER.filter((slot) => row.some(([s]) => s === slot)).map(
            (slot, i) => [slot, [sign * pileX(i), sign * FRONT_ROW_Z]],
          ),
        );
      }
      // clear of the boost spot at x 1.3
      expect(pileX(0) - 1.3).toBeGreaterThanOrEqual(CARD_STACK_RADIUS);
    },
  );
});

describe("rule cards in the card row", () => {
  const PILES = ["deck", "discard", "hero", "sidekick", "extras"];
  const slots = (rules: number) => [
    ...PILES,
    ...Array.from({ length: rules }, (_, n) => ruleSlot(n)),
  ];
  const width = mapSize(DRUM.width / DRUM.height).width;
  /** The kit's piece cells that lie in the card row. */
  const rowCells = (seat: 0 | 1, s: string[]) =>
    Array.from(seatArea(seat, width, s).kit()).filter(
      ([, z]) => Math.abs(z) === FRONT_ROW_Z,
    );

  it("holds nine cells, the last a whole card inside VIEW", () => {
    expect(CARD_ROW_CELLS).toBe(9);
    expect(pileX(CARD_ROW_CELLS - 1) + 0.7).toBeLessThanOrEqual(VIEW.halfX);
    expect(pileX(CARD_ROW_CELLS) + 0.7).toBeGreaterThan(VIEW.halfX);
  });

  it.each([0, 1] as const)(
    "seat %i: a cell each, 1.8 on from the last pile, then the piece cells",
    (seat) => {
      const area = seatArea(seat, width, slots(3));
      const at = (n: number) => forSeat(seat, [pileX(n), FRONT_ROW_Z]);
      expect(area.card("extras")).toEqual(at(4));
      const cards = [0, 1, 2].map((n) => area.card(ruleSlot(n)));
      expect(cards).toEqual([at(5), at(6), at(7)]);
      expect(distance(cards[0], area.card("extras"))).toBeCloseTo(1.8, 9);
      expect(distance(cards[1], cards[0])).toBeCloseTo(1.8, 9);
      expect(distance(cards[2], cards[1])).toBeCloseTo(1.8, 9);
      expect(1.8).toBeGreaterThan(CARD_STACK_RADIUS);
      for (const [x, z] of cards) {
        expect(Math.abs(x) + 0.7).toBeLessThanOrEqual(VIEW.halfX);
        expect(Math.abs(z) + 1).toBeLessThanOrEqual(VIEW.halfZ);
      }
      // one cell is left past the last rule card
      expect(rowCells(seat, slots(3))).toEqual([at(8)]);
      // a missing pile leaves no gap before the rule cards either
      const few = seatArea(seat, width, ["deck", "discard", "hero", "rules"]);
      expect(few.card("rules")).toEqual(at(3));
      expect(rowCells(seat, ["deck", "discard", "hero", "rules"])[0]).toEqual(
        at(4),
      );
    },
  );

  it.each([0, 1] as const)(
    "seat %i: the ones with no cell share the last one, and no piece does",
    (seat) => {
      expect(ruleCardSplit(5, 4)).toEqual({ loose: 4, piled: 0 });
      expect(ruleCardSplit(5, 5)).toEqual({ loose: 3, piled: 2 });
      expect(ruleCardSplit(5, 6)).toEqual({ loose: 3, piled: 3 });
      expect(ruleCardSplit(3, 6)).toEqual({ loose: 6, piled: 0 });

      const area = seatArea(seat, width, slots(6));
      const at = (n: number) => forSeat(seat, [pileX(n), FRONT_ROW_Z]);
      expect([0, 1, 2, 3, 4, 5].map((n) => area.card(ruleSlot(n)))).toEqual([
        at(5),
        at(6),
        at(7),
        at(8),
        at(8),
        at(8),
      ]);
      expect(rowCells(seat, slots(6))).toEqual([]);
      expect(rowCells(seat, slots(4))).toEqual([]);
    },
  );

  it.each<[number, number]>([
    [1, 1],
    [3, 3],
    [6, 4],
  ])(
    "%i rule cards compose to %i placements in a row, both seats",
    (count, placed) => {
      const { body } = compose(
        [ruleCardsDeck(count), ruleCardsDeck(count)],
        DRUM,
      );
      for (const seat of [0, 1] as const) {
        const row = body.placements.filter(
          (p) => p.kind === "deck" && p.seat === seat && isRuleSlot(p.slot),
        );
        expect(row.map((p) => p.position)).toEqual(
          Array.from({ length: placed }, (_, n) =>
            forSeat(seat, [pileX(5 + n), FRONT_ROW_Z]),
          ),
        );
      }
    },
  );
});
