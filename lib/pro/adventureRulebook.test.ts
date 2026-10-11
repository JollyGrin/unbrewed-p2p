import { rulebookFor, rulebookPageAlt, rulebookPageUrls, stepPage } from "./adventureRulebook";

describe("adventure rulebook data (#1371)", () => {
  it("resolves the Jurassic booklet to 14 CDN URLs with the uploaded keys", () => {
    const urls = rulebookPageUrls(rulebookFor("isla-nublar")!);
    const B = "https://cdn.unbrewed.xyz/p2p/adventures/jurassic-park/rulebook";
    expect(urls).toHaveLength(14);
    expect(urls[0]).toBe(`${B}/cover.webp`);
    expect(urls[1]).toBe(`${B}/page-01.webp`);
    expect(urls[13]).toBe(`${B}/page-13.webp`);
  });

  it("has no booklet for other scenarios", () => {
    expect(rulebookFor("clockwork-heist")).toBeNull();
    expect(rulebookFor("toString")).toBeNull();
    expect(rulebookFor(null)).toBeNull();
    expect(rulebookFor(undefined)).toBeNull();
  });

  it("clamps paging at both ends", () => {
    expect(stepPage(0, -1, 14)).toBe(0);
    expect(stepPage(13, 1, 14)).toBe(13);
    expect(stepPage(3, 1, 14)).toBe(4);
  });

  it("labels the cover and numbered pages", () => {
    expect(rulebookPageAlt(0)).toBe("Rulebook cover");
    expect(rulebookPageAlt(3)).toBe("Rulebook page 3");
  });
});
