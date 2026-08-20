/**
 * The bag meter must charge the bag only for what the bag owns (#645): a pile
 * of Pro replays used to push it past its own budget.
 */
import {
  BAG_BUDGET_BYTES,
  computeStorageBreakdown,
  entryBytes,
  formatKb,
  readStorageBreakdown,
} from "./breakdown";

const kb = (n: number) => "x".repeat(Math.round((n * 1024) / 2));

describe("computeStorageBreakdown", () => {
  it("splits decks, maps, replays and everything else", () => {
    const out = computeStorageBreakdown([
      ["DECKS", "deck-json"],
      ["MAP_LIST", "map-json"],
      ["unbrewed:pro:replays:index", "idx"],
      ["unbrewed:pro:replay:abc123", "bundle"],
      ["SERVER_ACTIVE", "https://example.test"],
    ]);

    expect(out.deckBytes).toBe(entryBytes("DECKS", "deck-json"));
    expect(out.mapBytes).toBe(entryBytes("MAP_LIST", "map-json"));
    expect(out.replayBytes).toBe(
      entryBytes("unbrewed:pro:replays:index", "idx") +
        entryBytes("unbrewed:pro:replay:abc123", "bundle"),
    );
    expect(out.otherBytes).toBe(
      entryBytes("SERVER_ACTIVE", "https://example.test"),
    );
    expect(out.bagBytes).toBe(out.deckBytes + out.mapBytes);
    expect(out.totalBytes).toBe(
      out.deckBytes + out.mapBytes + out.replayBytes + out.otherBytes,
    );
  });

  it("keeps a 6 MB replay pile out of the bag's ~200kb", () => {
    const out = computeStorageBreakdown([
      ["DECKS", kb(180)],
      ["MAP_LIST", kb(20)],
      ["unbrewed:pro:replay:one", kb(3000)],
      ["unbrewed:pro:replay:two", kb(3144)],
    ]);

    expect(Math.round(out.bagBytes / 1024)).toBe(200);
    expect(out.bagBytes).toBeLessThan(BAG_BUDGET_BYTES);
    expect(out.replayBytes / 1024).toBeGreaterThan(6000);
    // the meter never reads "full" for storage the bag doesn't own
    expect(Math.round((out.bagBytes / BAG_BUDGET_BYTES) * 100)).toBe(4);
  });

  it("is all zeroes for an empty origin", () => {
    expect(computeStorageBreakdown([])).toEqual({
      deckBytes: 0,
      mapBytes: 0,
      replayBytes: 0,
      otherBytes: 0,
      bagBytes: 0,
      totalBytes: 0,
    });
  });

  it("treats a missing value as empty rather than throwing", () => {
    const out = computeStorageBreakdown([
      ["DECKS", undefined as unknown as string],
    ]);
    expect(out.deckBytes).toBe(entryBytes("DECKS", ""));
  });
});

describe("readStorageBreakdown", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads this browser's keys", () => {
    window.localStorage.setItem("DECKS", "[]");
    window.localStorage.setItem("unbrewed:pro:replay:z", "bundle");

    const out = readStorageBreakdown();
    expect(out.deckBytes).toBe(entryBytes("DECKS", "[]"));
    expect(out.replayBytes).toBe(entryBytes("unbrewed:pro:replay:z", "bundle"));
    expect(out.bagBytes).toBe(out.deckBytes);
  });
});

describe("formatKb", () => {
  it("renders compact kb labels", () => {
    expect(formatKb(0)).toBe("0");
    expect(formatKb(100)).toBe("<1");
    expect(formatKb(1024 * 12)).toBe("12");
    expect(formatKb(1024 * 5940.4)).toBe("5940");
  });
});
