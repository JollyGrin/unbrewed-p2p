import { describe, expect, it, beforeEach } from "@jest/globals";
import { fetchDeckById } from "@/lib/evergreenDecks";
import {
  deckLinkBagId,
  deckMatchesLink,
  fetchLinkedDeck,
  parseDeckLink,
} from "./deckLink";

jest.mock("./evergreenDecks", () => ({
  fetchDeckById: jest.fn(async (id: string) => ({ id, name: `deck ${id}` })),
}));

const MAROUINE = "char_ce316d14-8bc8-413d-9086-ad37b502d0fe";

beforeEach(() => {
  (fetchDeckById as jest.Mock).mockClear();
  global.fetch = jest.fn(() => {
    throw new Error("no network in this test");
  }) as unknown as typeof fetch;
});

describe("parseDeckLink", () => {
  it("keeps every unprefixed id on unmatched.cards, untouched", () => {
    for (const id of ["pk1x", "a1b2c3", "img-123", "some-deck", " pk1x "]) {
      expect(parseDeckLink(id)).toEqual({ source: "unmatched", id });
      expect(deckLinkBagId(id)).toBe(id);
    }
  });

  it("routes labs: character links to Labs", () => {
    for (const raw of [`labs:${MAROUINE}`, `LABS:${MAROUINE.toUpperCase().replace("CHAR_", "char_")}`, `labs-${MAROUINE}`]) {
      expect(parseDeckLink(raw)).toEqual({ source: "labs", characterId: MAROUINE });
      expect(deckLinkBagId(raw)).toBe(`labs-${MAROUINE}`);
    }
  });

  it("refuses a labs: link without a character", () => {
    expect(parseDeckLink("labs:66521662a3f5ff4e7a23b429")).toBeNull();
    expect(parseDeckLink("labs:")).toBeNull();
  });
});

describe("deckMatchesLink", () => {
  it("matches a bag deck by id or version_id", () => {
    expect(deckMatchesLink({ id: "pk1x", version_id: "v9" }, "pk1x")).toBe(true);
    expect(deckMatchesLink({ id: "pk1x", version_id: "v9" }, "v9")).toBe(true);
    expect(deckMatchesLink({ id: "pk1x", version_id: "v9" }, "other")).toBe(false);
    expect(deckMatchesLink(undefined, "pk1x")).toBe(false);
  });

  it("matches a Labs link to the bag id the import saves under", () => {
    expect(deckMatchesLink({ id: `labs-${MAROUINE}` } as any, `labs:${MAROUINE}`)).toBe(true);
  });
});

describe("fetchLinkedDeck", () => {
  it("sends unprefixed ids to fetchDeckById exactly as given", async () => {
    const result = await fetchLinkedDeck("pk1x");
    expect(fetchDeckById).toHaveBeenCalledWith("pk1x");
    expect(result).toEqual({ deck: { id: "pk1x", name: "deck pk1x" }, unsupported: [], skipped: [] });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("never asks unmatched.cards about a Labs link", async () => {
    await expect(fetchLinkedDeck(`labs:${MAROUINE}`)).rejects.toMatchObject({ code: "network" });
    expect(fetchDeckById).not.toHaveBeenCalled();
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain("gallery_characters");
  });

  it("rejects a labs: link without a character before any request", async () => {
    await expect(fetchLinkedDeck("labs:nope")).rejects.toMatchObject({ code: "bad-input" });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(fetchDeckById).not.toHaveBeenCalled();
  });
});
