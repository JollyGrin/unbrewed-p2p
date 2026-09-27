import { resolveTokenSrc } from "./heroToken";

describe("resolveTokenSrc", () => {
  it("makes our own absolute URLs root-relative and keeps relative ones", () => {
    expect(resolveTokenSrc("https://unbrewed.xyz/evergreen-decks/art/lDOM/token-mandalorian.webp")).toBe(
      "/evergreen-decks/art/lDOM/token-mandalorian.webp",
    );
    expect(resolveTokenSrc("/evergreen-decks/art/DOPE/token-jason-voorhees.webp")).toBe(
      "/evergreen-decks/art/DOPE/token-jason-voorhees.webp",
    );
  });

  it("keeps a foreign absolute URL", () => {
    expect(resolveTokenSrc("https://cdn.example.com/t.webp")).toBe("https://cdn.example.com/t.webp");
  });

  it("treats a missing, junk or stub token as no art", () => {
    expect(resolveTokenSrc(undefined)).toBeNull();
    expect(resolveTokenSrc("  ")).toBeNull();
    expect(resolveTokenSrc("javascript:alert(1)")).toBeNull();
    expect(resolveTokenSrc("/evergreen-decks/art/xBvn/token-specter-knight.webp")).toBeNull();
    expect(resolveTokenSrc("https://unbrewed.xyz/evergreen-decks/art/xBvn/token-specter-knight.webp")).toBeNull();
  });
});
