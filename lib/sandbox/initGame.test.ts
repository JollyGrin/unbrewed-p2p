/**
 * What a fresh table puts on the board: the deck's saved loadout when it has
 * one (#467), else the hero and sidekick medallions, else the starter disc.
 */
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { newPool } from "@/components/DeckPool/PoolFns";
import {
  BOARD_SIZE,
  BoardToken,
  DEFAULT_PLAYER_COLOR,
  FIGHTER_ROW_TOP,
  labelWidth,
  spawnFighterRow,
} from "@/components/Positions/position.type";
import { counterDisplay } from "@/components/Positions/tokenCounter";
import { fighterTokens } from "@/components/Positions/heroToken";
import { initPositionBlob, joinSeat, seatAmong, seatOnBoard } from "./initGame";

const deck = (over: Record<string, unknown> = {}, top: Record<string, unknown> = {}) =>
  ({
    user: "u",
    family_id: "f",
    name: "Deck",
    note: "",
    deck_data: {
      appearance: { borderColour: "#5fb94e", highlightColour: "#583300" },
      cards: [],
      hero: { name: "Appa", hp: 14, move: 2, isRanged: false, specialAbility: "", tokenImageUrl: "/art/appa.webp" },
      sidekick: { name: "Momo", hp: 6, quantity: 1, isRanged: true, quote: "", tokenImageUrl: "/art/momo.webp" },
      ...over,
    },
    ...top,
  }) as unknown as DeckImportType;

/** The space a piece takes on the board, its name pill included. */
const box = (t: BoardToken) => {
  const w = t.size ?? 72;
  const h = t.h ?? w;
  const lw = t.label ? labelWidth(t.label) : 0;
  const cx = t.x + w / 2;
  return {
    left: Math.min(t.x, cx - lw / 2),
    right: Math.max(t.x + w, cx + lw / 2),
    top: t.y,
    bottom: t.y + h + (t.label ? 21 : 0),
  };
};
const overlap = (a: BoardToken, b: BoardToken) => {
  const [p, q] = [box(a), box(b)];
  return p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
};
const expectTidy = (tokens: BoardToken[]) => {
  tokens.forEach((t, i) => {
    const b = box(t);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(BOARD_SIZE.w);
    expect(b.bottom).toBeLessThanOrEqual(BOARD_SIZE.h);
    tokens.slice(i + 1).forEach((u) => expect(overlap(t, u)).toBe(false));
  });
};

describe("initPositionBlob", () => {
  it("no deck: the lone starter disc, as always", () => {
    const blob = initPositionBlob(undefined, "dean");
    expect(blob.color).toBe(DEFAULT_PLAYER_COLOR);
    expect(blob.tokens).toEqual([{ id: expect.stringMatching(/^dean#/), x: 150, y: 100 }]);
  });

  it("spawns the hero and sidekick with art, rim and linked health", () => {
    const blob = initPositionBlob(deck(), "dean");
    expect(blob.color).toBe(DEFAULT_PLAYER_COLOR);
    expect(blob.tokens).toHaveLength(2);
    const [hero, sidekick] = blob.tokens;
    expect(hero).toMatchObject({
      x: 150,
      y: FIGHTER_ROW_TOP,
      imageUrl: "/art/appa.webp",
      clip: "circle",
      label: "Appa",
      rim: "#5fb94e",
      counter: { link: "hero" },
    });
    expect(sidekick).toMatchObject({
      imageUrl: "/art/momo.webp",
      label: "Momo",
      counter: { link: "sidekick" },
    });
    expect(new Set(blob.tokens.map((t) => t.id)).size).toBe(2);
    blob.tokens.forEach((t) => expect(t.id).toMatch(/^dean#/));
    expectTidy(blob.tokens);
  });

  it("the pieces read the same health the HUD does", () => {
    const d = deck();
    const pool = newPool(d);
    const [hero, sidekick] = initPositionBlob(d, "dean").tokens;
    expect(counterDisplay(hero.counter, pool)).toBe(14);
    expect(counterDisplay(sidekick.counter, pool)).toBe(6);
    pool.hero.hp = 9;
    expect(counterDisplay(hero.counter, pool)).toBe(9);
  });

  it("a saved loadout (#467) wins outright: no fighters on top", () => {
    const savedTokens = [{ icon: "GiFireShield", size: 72 }, { imageUrl: "https://x.test/a.png", size: 100 }];
    const blob = initPositionBlob(deck({}, { savedTokens, savedTokenColor: "#123456" }), "dean");
    expect(blob.color).toBe("#123456");
    expect(blob.tokens).toHaveLength(2);
    expect(blob.tokens.map(({ id, x, y, ...rest }) => rest)).toEqual(savedTokens);
    expect(blob.tokens.some((t) => t.rim || t.counter)).toBe(false);
  });

  it("a deck with no art still gets its fighters, as monograms", () => {
    const blob = initPositionBlob(
      deck({
        hero: { name: "DARTH VADER", hp: 18 },
        sidekick: { name: "STORMTROOPERS", hp: null, quantity: 3 },
      }),
      "dean",
    );
    expect(blob.tokens).toHaveLength(4);
    expect(blob.tokens.every((t) => !t.imageUrl && t.rim === "#5fb94e")).toBe(true);
    expect(blob.tokens.map((t) => t.initials)).toEqual(["DV", "S", "S", "S"]);
    expectTidy(blob.tokens);
  });

  it("a second seat lands in the opposite corner, clear of the first", () => {
    const first = initPositionBlob(deck(), "offline", 0).tokens;
    const second = initPositionBlob(deck(), "Opponent", 1).tokens;
    expectTidy([...first, ...second]);
    // the 180° turn of the first seat's row (hotseat "Rotate board")
    second.forEach((t, i) => {
      const size = t.size ?? 72;
      expect(t.x).toBe(BOARD_SIZE.w - first[i].x - size);
    });
    expect(second[0].y).toBe(BOARD_SIZE.h - FIGHTER_ROW_TOP - 88);
  });
});

describe("spawnFighterRow", () => {
  const long = fighterTokens({
    hero: { name: "The Piper of the Underroads", hp: 13 },
    sidekick: { name: "Veyra the Tempest Whisper", hp: 7, quantity: 1 },
  });
  const many = fighterTokens({
    hero: { name: "Clone Troopers", hp: 2 },
    sidekick: { name: "", hp: null, quantity: 40 },
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])("seat %i: on the map, nothing overlapping", (seat) => {
    expectTidy(spawnFighterRow(long, "p", seat));
    expectTidy(spawnFighterRow(many, "p", seat));
  });

  it("eight seats with the fullest row never share a spot", () => {
    const all = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((seat) => spawnFighterRow(long, `p${seat}`, seat));
    expectTidy(all);
  });

  it("stands pieces of different sizes on one line", () => {
    const [hero, sidekick] = spawnFighterRow(long, "p", 0);
    expect(hero.y + (hero.h ?? 0)).toBe(sidekick.y + (sidekick.h ?? 0));
  });
});

describe("seatAmong — every client picks its own seat at the same moment", () => {
  it("is the rank among the names at the table, whoever asks", () => {
    const table = ["zed", "amy", "bob"];
    expect(table.map((name) => seatAmong(table, name))).toEqual([2, 0, 1]);
    // a different key order on another client changes nothing
    expect(seatAmong(["bob", "zed", "amy"], "zed")).toBe(2);
  });

  it("counts a player once, and counts me even before I have a board", () => {
    expect(seatAmong(["amy", "amy", "bob"], "bob")).toBe(1);
    expect(seatAmong(["bob"], "amy")).toBe(0);
    expect(seatAmong([], "amy")).toBe(0);
  });

  it("two players re-seeding together land in different corners", () => {
    const table = ["alice", "bob"];
    const boards = table.map(
      (name) => initPositionBlob(deck(), name, seatAmong(table, name)).tokens,
    );
    expect(boards[0][0]).toMatchObject({ x: 150, y: FIGHTER_ROW_TOP });
    expect(boards[1][0].x).toBe(BOARD_SIZE.w - 150 - 88);
    expectTidy(boards.flat());
  });
});

describe("joinSeat — the board's join seed", () => {
  it("is one past the boards already there, as before", () => {
    expect(joinSeat([], ["amy"], "amy")).toBe(0);
    expect(joinSeat(["zed"], ["zed", "amy"], "amy")).toBe(1);
    // a late joiner never sorts in ahead of someone seated
    expect(joinSeat(["zed", "bob"], ["zed", "bob", "amy"], "amy")).toBe(2);
    // my own board (a re-seed racing its echo) is not a seat taken
    expect(joinSeat(["amy", "zed"], ["amy", "zed"], "amy")).toBe(1);
  });

  it("two players entering an empty room together get different seats on both clients", () => {
    const table = ["bob", "amy"];
    expect(joinSeat([], table, "amy")).toBe(0);
    expect(joinSeat([], table, "bob")).toBe(1);
    // the same once one of the two seeds has landed
    expect(joinSeat(["amy"], table, "bob")).toBe(1);
    // and behind someone already seated
    expect(joinSeat(["zed"], ["zed", ...table], "amy")).toBe(1);
    expect(joinSeat(["zed"], ["zed", ...table], "bob")).toBe(2);
  });

  it("counts me even before the table lists me", () => {
    expect(joinSeat([], [], "amy")).toBe(0);
    expect(joinSeat(["zed"], ["zed"], "amy")).toBe(1);
  });
});

describe("seatOnBoard — a deck change keeps the corner", () => {
  it("gives back the seat a fresh board was laid out for", () => {
    for (let seat = 0; seat < 8; seat += 1)
      expect(seatOnBoard(initPositionBlob(deck(), "amy", seat).tokens)).toBe(seat);
  });

  it("re-seeding from it lands the new deck's hero on the old one's spot", () => {
    const before = initPositionBlob(deck(), "bob", 1).tokens;
    const after = initPositionBlob(
      deck({ sidekick: { name: "Sidekick", hp: null, quantity: 0 } }),
      "bob",
      seatOnBoard(before),
    ).tokens;
    expect(after[0]).toMatchObject({ x: before[0].x, y: before[0].y });
  });

  it("a hero that was moved gives the corner of the map it stands in", () => {
    const [hero, ...rest] = initPositionBlob(deck(), "amy", 0).tokens;
    const at = (x: number, y: number) => seatOnBoard([{ ...hero, x, y }, ...rest]);
    expect(at(300, 320)).toBe(0);
    expect(at(900, 700)).toBe(1);
    expect(at(900, 200)).toBe(2);
    expect(at(200, 800)).toBe(3);
  });

  it("is undefined without fighter pieces", () => {
    expect(seatOnBoard(undefined)).toBeUndefined();
    expect(seatOnBoard([{ id: "a", x: 150, y: 100 }])).toBeUndefined();
    expect(
      seatOnBoard(initPositionBlob(deck({}, { savedTokens: [{ icon: "skull" }] }), "amy").tokens),
    ).toBeUndefined();
  });
});
