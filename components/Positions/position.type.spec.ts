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
