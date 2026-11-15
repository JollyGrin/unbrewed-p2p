import { migrateBlob, DEFAULT_TOKEN_SIZE } from "./position.type";

describe("migrateBlob", () => {
  it("returns an empty blob for garbage", () => {
    expect(migrateBlob(undefined)).toEqual({ tokens: [] });
    expect(migrateBlob(null)).toEqual({ tokens: [] });
    expect(migrateBlob("nope")).toEqual({ tokens: [] });
    expect(migrateBlob({})).toEqual({ tokens: [] });
  });

  it("passes through new-format blobs", () => {
    const tokens = [{ id: "dean#1", x: 10, y: 20, icon: "GiFireShield" }];
    const blob = migrateBlob({ color: "#48284F", tokens });
    expect(blob.color).toBe("#48284F");
    expect(blob.tokens).toBe(tokens);
  });

  it("flattens legacy hero + sidekicks, hero color becomes player color", () => {
    const legacy = {
      id: "dean",
      x: 1,
      y: 2,
      color: "#f00",
      sidekicks: [
        { id: "dean_0", x: 3, y: 4, r: 50, color: "#f00" },
        { id: "dean_1", x: 5, y: 6, imageUrl: "/tokens/Alien.svg" },
      ],
    };
    const blob = migrateBlob(legacy);
    expect(blob.color).toBe("#f00");
    expect(blob.tokens).toHaveLength(3);
    expect(blob.tokens[0]).toMatchObject({
      id: "dean",
      x: 1,
      y: 2,
      size: DEFAULT_TOKEN_SIZE,
    });
    expect(blob.tokens[1]).toMatchObject({ id: "dean_0", size: 50 });
    expect(blob.tokens[2]).toMatchObject({
      id: "dean_1",
      imageUrl: "/tokens/Alien.svg",
      size: DEFAULT_TOKEN_SIZE,
    });
  });
});

describe("card token sizes", () => {
  const {
    CARD_TOKEN_MAX_WIDTH,
    CARD_TOKEN_MIN_WIDTH,
    COMPACT_CARD_TOKEN_WIDTH,
    DEFAULT_CARD_TOKEN_WIDTH,
    cardTokenHeight,
    cardTokenSizeRange,
  } = jest.requireActual("./position.type");

  it("lands a played card at 180, the middle of the slider", () => {
    expect(DEFAULT_CARD_TOKEN_WIDTH).toBe(180);
    expect(cardTokenHeight(DEFAULT_CARD_TOKEN_WIDTH)).toBe(251);
    expect((CARD_TOKEN_MIN_WIDTH + CARD_TOKEN_MAX_WIDTH) / 2).toBe(
      DEFAULT_CARD_TOKEN_WIDTH,
    );
    expect(cardTokenSizeRange(DEFAULT_CARD_TOKEN_WIDTH)).toEqual({
      min: 90,
      max: 270,
    });
  });

  it("keeps reference cards smaller than played ones, inside the slider", () => {
    expect(COMPACT_CARD_TOKEN_WIDTH).toBe(130);
    expect(COMPACT_CARD_TOKEN_WIDTH).toBeLessThan(DEFAULT_CARD_TOKEN_WIDTH);
    expect(COMPACT_CARD_TOKEN_WIDTH).toBeGreaterThanOrEqual(
      CARD_TOKEN_MIN_WIDTH,
    );
  });

  it("holds the old default and the old slider's extremes without resizing them", () => {
    // 260 was the default before; 50 was the old slider's minimum
    expect(cardTokenSizeRange(260)).toEqual({ min: 90, max: 270 });
    expect(cardTokenSizeRange(50)).toEqual({ min: 50, max: 270 });
    expect(cardTokenSizeRange(400)).toEqual({ min: 90, max: 400 });
  });
});
