/**
 * #1538: the paste bar works out the source itself. Each input form lands on
 * its panel; garbage is "not a deck we recognise", never a throw.
 */
import ttsSave from "@/lib/labs/fixtures/tts-save.pink-panther.json";
import { detectDeckPaste } from "./detectPaste";

const DECK = { id: "abc", name: "Mine", deck_data: { cards: [] } };

describe("detectDeckPaste", () => {
  it("empty", () => {
    expect(detectDeckPaste("   ")).toEqual({ kind: "empty" });
  });

  it("Unmatched Labs: set link, character link, bare slug, labs: id", () => {
    expect(detectDeckPaste("https://www.unmatchedlabs.com/shared/abc123def456abc123def456")).toMatchObject({
      kind: "labs",
      input: { kind: "set", slug: "abc123def456abc123def456" },
    });
    expect(
      detectDeckPaste(
        " https://www.unmatchedlabs.com/shared/s1?character=char_ce316d14-1111-2222-3333-444444444444 ",
      ),
    ).toMatchObject({ kind: "labs", input: { kind: "character" } });
    expect(detectDeckPaste("abc123def456abc123def456")).toMatchObject({ kind: "labs" });
    expect(detectDeckPaste("labs:char_ce316d14-1111-2222-3333-444444444444")).toMatchObject({
      kind: "labs",
    });
  });

  it("unmatched.cards: deck URL (with a version), bare code, codes with _ and -", () => {
    expect(detectDeckPaste("https://unmatched.cards/decks/p82X/versions/EZYf44")).toEqual({
      kind: "code",
      code: "p82X",
    });
    expect(detectDeckPaste("pk1x")).toEqual({ kind: "code", code: "pk1x" });
    expect(detectDeckPaste("x2_V")).toEqual({ kind: "code", code: "x2_V" });
    expect(detectDeckPaste("lB-k")).toEqual({ kind: "code", code: "lB-k" });
    expect(detectDeckPaste("DOPE")).toEqual({ kind: "code", code: "DOPE" });
    expect(detectDeckPaste("NQ5XP")).toEqual({ kind: "code", code: "NQ5XP" });
  });

  it("a plain word is not a code: no fetch, no failed add (review)", () => {
    for (const word of ["hello", "Medusa", "garbage", "medusa", "deck", "abcdef"]) {
      expect(detectDeckPaste(word)).toEqual({ kind: "unknown", looksLikeJson: false });
    }
  });

  it("`shared/` counts as Labs only on the Labs host (review)", () => {
    expect(detectDeckPaste("https://drive.google.com/drive/shared/abc")).toEqual({
      kind: "url",
      url: "https://drive.google.com/drive/shared/abc",
    });
    expect(detectDeckPaste("https://www.unmatchedlabs.com/shared/abc")).toMatchObject({ kind: "labs" });
  });

  it("any other http(s) link is fetched in case it serves deck JSON (the old From URL import)", () => {
    expect(detectDeckPaste("https://example.com/decks/mine.json")).toEqual({
      kind: "url",
      url: "https://example.com/decks/mine.json",
    });
    expect(detectDeckPaste("example.com/mine.json")).toEqual({ kind: "unknown", looksLikeJson: false });
  });

  it("JSON: single deck, deck array, backup bundle", () => {
    expect(detectDeckPaste(JSON.stringify(DECK))).toMatchObject({
      kind: "bundle",
      bundle: { decks: [DECK], maps: [] },
    });
    expect(detectDeckPaste(JSON.stringify([DECK, DECK]))).toMatchObject({
      kind: "bundle",
      bundle: { decks: [DECK, DECK] },
    });
    expect(
      detectDeckPaste(JSON.stringify({ decks: [DECK], maps: [{ imgUrl: "https://x/m.png" }] })),
    ).toMatchObject({ kind: "bundle", bundle: { decks: [DECK], maps: [{ imgUrl: "https://x/m.png" }] } });
  });

  it("JSON that is a Tabletop Simulator export (how club decks arrive)", () => {
    const found = detectDeckPaste(JSON.stringify(ttsSave));
    expect(found).toMatchObject({ kind: "tts" });
    expect((found as { cardCount: number }).cardCount).toBeGreaterThan(0);
  });

  it("a the-unmatched.club hero link carries its id; any slug, www or not, /export/ too", () => {
    expect(detectDeckPaste("https://www.the-unmatched.club/c/heroes/ellen-ripley.2304")).toEqual({
      kind: "club",
      id: "2304",
    });
    expect(detectDeckPaste("the-unmatched.club/c/heroes/x.2304/")).toEqual({ kind: "club", id: "2304" });
    expect(
      detectDeckPaste("https://www.the-unmatched.club/c/heroes/ellen-ripley.2304/export/__data.json"),
    ).toEqual({ kind: "club", id: "2304" });
    expect(detectDeckPaste("https://the-unmatched.club/c/heroes/2304?x=1")).toEqual({
      kind: "club",
      id: "2304",
    });
  });

  it("another the-unmatched.club link has no deck id", () => {
    expect(detectDeckPaste("https://the-unmatched.club/decks/123")).toEqual({ kind: "club", id: undefined });
  });

  it("garbage is not a deck", () => {
    expect(detectDeckPaste("hi")).toEqual({ kind: "unknown", looksLikeJson: false });
    expect(detectDeckPaste("not a deck at all")).toEqual({ kind: "unknown", looksLikeJson: false });
    expect(detectDeckPaste("{not json")).toEqual({ kind: "unknown", looksLikeJson: true });
    expect(detectDeckPaste('{"hello":"world"}')).toEqual({ kind: "unknown", looksLikeJson: true });
    expect(detectDeckPaste("ftp://example.com/whatever")).toEqual({
      kind: "unknown",
      looksLikeJson: false,
    });
  });
});
