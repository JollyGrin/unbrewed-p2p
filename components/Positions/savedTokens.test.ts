import {
  BoardToken,
  DEFAULT_TOKEN_SIZE,
  SPAWN_ORIGIN,
  SavedToken,
  TOKEN_LABEL_MAX,
  canFlip,
  clampLabel,
  shownSheet,
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

describe("display fields (#1003)", () => {
  const piece: BoardToken = {
    id: "me#piece",
    x: 300,
    y: 200,
    imageUrl: "https://example.test/frisbee.png",
    size: 80,
    h: 80,
    sheet: { cols: 2, rows: 1, index: 0 },
    clip: "circle",
    label: "Frisbee",
    altIndex: 1,
    flipped: true,
    counter: { value: 2 },
  };

  it("round-trips clip, label and altIndex through toSavedToken and spawn", () => {
    const saved = toSavedToken(piece);
    expect(saved).toEqual({
      imageUrl: "https://example.test/frisbee.png",
      size: 80,
      h: 80,
      sheet: { cols: 2, rows: 1, index: 0 },
      clip: "circle",
      label: "Frisbee",
      altIndex: 1,
      counter: { value: 2 },
    });
    // through JSON, as a deck is stored in the bag
    const [spawned] = spawnSavedTokens(JSON.parse(JSON.stringify([saved])), "me");
    const { id, x, y, ...look } = spawned;
    expect(look).toEqual(saved);
  });

  it("saves the piece on its front face — `flipped` is per-game", () => {
    expect(toSavedToken(piece)).not.toHaveProperty("flipped");
  });

  it("spawns on the front face even when a deck carries `flipped`", () => {
    // e.g. saved by a client older than the strip in toSavedToken
    const stale = { ...toSavedToken(piece), flipped: true } as SavedToken;
    expect(spawnSavedTokens([stale], "me")[0]).not.toHaveProperty("flipped");
  });
});

describe("flip helpers", () => {
  const sheet = { cols: 2, rows: 1, index: 0 };

  it("only a sheet token with an altIndex can flip", () => {
    expect(canFlip({ sheet, altIndex: 1 })).toBe(true);
    expect(canFlip({ sheet, altIndex: 0 })).toBe(true);
    expect(canFlip({ sheet })).toBe(false);
    expect(canFlip({ altIndex: 1 })).toBe(false);
  });

  it("toggling flipped swaps the drawn cell and leaves sheet.index alone", () => {
    const token = { sheet, altIndex: 1, flipped: false };
    expect(shownSheet(token)).toEqual(sheet);
    const flipped = { ...token, flipped: !token.flipped };
    expect(shownSheet(flipped)).toEqual({ cols: 2, rows: 1, index: 1 });
    expect(flipped.sheet.index).toBe(0);
    expect(shownSheet({ ...flipped, flipped: !flipped.flipped })).toEqual(sheet);
  });

  it("clampLabel caps a label at TOKEN_LABEL_MAX", () => {
    expect(clampLabel("x".repeat(40))).toHaveLength(TOKEN_LABEL_MAX);
    expect(clampLabel("Dial")).toBe("Dial");
  });
});
