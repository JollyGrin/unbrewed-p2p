import {
  BoardToken,
  DEFAULT_TOKEN_SIZE,
  SPAWN_ORIGIN,
  SavedToken,
  spawnSavedTokens,
  toSavedToken,
} from "./position.type";

describe("toSavedToken", () => {
  it("drops the per-game fields and keeps the look of the token", () => {
    const token: BoardToken = {
      id: "me#abc",
      x: 400,
      y: 250,
      icon: "GiFireShield",
      cutout: true,
      size: 48,
      counter: { value: 3 },
    };

    expect(toSavedToken(token)).toEqual({
      icon: "GiFireShield",
      cutout: true,
      size: 48,
      counter: { value: 3 },
    });
  });

  it("never carries a played card into a deck's loadout", () => {
    const saved = toSavedToken({
      id: "me#1",
      x: 0,
      y: 0,
      card: { title: "Feint" } as BoardToken["card"],
      faceDown: true,
      fromReveal: true,
      size: 260,
    });

    expect(saved).toEqual({ size: 260 });
  });
});

describe("spawnSavedTokens", () => {
  const disc = (size?: number): SavedToken => ({ size });

  it("gives every token a unique id and lays them out in a row", () => {
    const placed = spawnSavedTokens([disc(), disc(), disc()], "grin");

    expect(new Set(placed.map((t) => t.id)).size).toBe(3);
    expect(placed.every((t) => t.id.startsWith("grin#"))).toBe(true);
    expect(placed.map((t) => t.y)).toEqual([
      SPAWN_ORIGIN.y,
      SPAWN_ORIGIN.y,
      SPAWN_ORIGIN.y,
    ]);
    expect(placed[0].x).toBe(SPAWN_ORIGIN.x);
    expect(placed[1].x).toBeGreaterThan(placed[0].x);
    expect(placed[2].x).toBeGreaterThan(placed[1].x);
  });

  it("wraps onto a new row instead of running off the map", () => {
    const placed = spawnSavedTokens(Array(12).fill(disc()), "grin");

    expect(placed.every((t) => t.x + DEFAULT_TOKEN_SIZE <= 1200)).toBe(true);
    const rows = new Set(placed.map((t) => t.y));
    expect(rows.size).toBeGreaterThan(1);
  });

  it("preserves each token's appearance", () => {
    const [placed] = spawnSavedTokens(
      [{ imageUrl: "https://x/minion.png", size: 96, h: 96 }],
      "grin",
    );

    expect(placed).toMatchObject({
      imageUrl: "https://x/minion.png",
      size: 96,
      h: 96,
    });
  });

  it("spawns nothing for a deck with no saved tokens", () => {
    expect(spawnSavedTokens([], "grin")).toEqual([]);
  });
});
