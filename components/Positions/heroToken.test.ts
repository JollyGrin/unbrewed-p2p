import { heroToken, heroTokenSources } from "./heroToken";

const IMG = "https://cdn.example/hero.webp";
const fighter = (over = {}) => ({ name: "Alice", tokenImageUrl: IMG, ...over });

describe("heroTokenSources", () => {
  it("is empty without an image (button hidden)", () => {
    expect(heroTokenSources(undefined)).toEqual([]);
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: undefined }) })).toEqual([]);
  });

  it.each([
    "https://cdn.example/a.webp",
    "/evergreen-decks/art/appa/token-appa.webp",
    "  /evergreen-decks/a.webp  ",
  ])("accepts %j and keeps it as the deck has it", (url) => {
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: url }) })).toEqual([
      { kind: "hero", name: "Alice", imageUrl: url.trim() },
    ]);
  });

  it.each([
    "http://x/a.png",
    "data:image/png;base64,AAAA",
    "//evil.example/a.png",
    "/\\evil.example/a.png",
    "javascript:alert(1)",
    "evergreen-decks/a.webp",
    "   ",
    "",
  ])("refuses %j", (url) => {
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: url }) })).toEqual([]);
  });

  it("offers the hero", () => {
    expect(heroTokenSources({ hero: fighter() })).toEqual([
      { kind: "hero", name: "Alice", imageUrl: IMG },
    ]);
  });

  it("offers an enabled sidekick with its own image only", () => {
    const sidekick = { name: "Momo", hp: 5, quantity: 1, tokenImageUrl: "https://cdn.example/momo.webp" };
    expect(heroTokenSources({ hero: fighter(), sidekick }).map((s) => s.kind)).toEqual(["hero", "sidekick"]);
    expect(heroTokenSources({ hero: fighter(), sidekick: { ...sidekick, tokenImageUrl: undefined } })).toHaveLength(1);
    expect(heroTokenSources({ hero: fighter(), sidekick: { name: "Sidekick", quantity: 0, tokenImageUrl: IMG } })).toHaveLength(1);
  });
});

describe("heroToken", () => {
  it("is a round labelled image token carrying imageUrl", () => {
    expect(heroToken({ kind: "hero", name: "Alice", imageUrl: IMG })).toEqual({
      imageUrl: IMG,
      clip: "circle",
      label: "Alice",
      size: 72,
      h: 72,
    });
  });
});
