import { mapImageSrc } from "./mapImage";

const meta = { title: "t", minPlayers: 1, maxPlayers: 4, specialRules: false };

describe("mapImageSrc", () => {
  it("returns a hosted image untouched", () => {
    expect(mapImageSrc({ ...meta, imageUrl: "/a.png", imageWidth: 10, imageHeight: 10 })).toBe("/a.png");
  });
  it("never returns empty: an image-less map gets a placeholder at its stated size", () => {
    const src = decodeURIComponent(mapImageSrc({ ...meta, imageWidth: 2592, imageHeight: 1728 }));
    expect(src).toMatch(/^data:image\/svg\+xml/);
    expect(src).toContain('width="2592" height="1728"');
  });
  it("falls back to a neutral size when the map states none", () => {
    expect(decodeURIComponent(mapImageSrc(meta))).toContain('width="1600" height="1000"');
  });
});
