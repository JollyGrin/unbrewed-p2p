import { heroToken, heroTokenSources } from "./heroToken";

const IMG = "https://cdn.example/hero.webp";
const fighter = (over = {}) => ({ name: "Alice", tokenImageUrl: IMG, ...over });

describe("heroTokenSources", () => {
  it("is empty without an image (button hidden)", () => {
    expect(heroTokenSources(undefined)).toEqual([]);
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: undefined }) })).toEqual([]);
  });

  it("rejects non-https and relative art", () => {
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: "http://x/a.png" }) })).toEqual([]);
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: "/evergreen-decks/a.webp" }) })).toEqual([]);
    expect(heroTokenSources({ hero: fighter({ tokenImageUrl: "javascript:alert(1)" }) })).toEqual([]);
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
