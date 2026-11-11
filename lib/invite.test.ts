/**
 * `persistAndStarDeck` is the Join/Share write that bypasses `useBagDecks`, so
 * it carries its own blocked-author check (#790).
 */
import { toast } from "react-hot-toast";

import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import { persistAndStarDeck } from "./invite";

const mockTrack = jest.fn();
jest.mock("./analytics", () => ({
  ...jest.requireActual("./analytics"),
  track: (...a: unknown[]) => mockTrack(...a),
}));

jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const deck = (id: string, user: string) =>
  ({ id, name: id, user, version_id: `${id}-v1`, deck_data: { hero: {}, cards: [] } }) as any;

beforeEach(() => {
  (toast.error as jest.Mock).mockClear();
  localStorage.clear();
  __resetAccountStoreForTests();
  __resetBagStoresForTests();
});

describe("persistAndStarDeck", () => {
  it("refuses a blocked-author deck: toasted, not stored, not starred", async () => {
    expect(await persistAndStarDeck(deck("zPmA", "Jowee"))).toBe(false);

    expect(toast.error).toHaveBeenCalledWith(
      "Decks by Jowee can't be imported — the author has asked that their decks not be importable into Unbrewed.",
    );
    expect(localStorage.getItem(LS_KEY.DECKS)).toBeNull();
    expect(localStorage.getItem(LS_KEY.STAR_DECK)).toBeNull();
  });

  it("stores and stars anyone else's deck exactly as before", async () => {
    expect(await persistAndStarDeck(deck("d1", "JollyGrin"))).toBe(true);

    expect(toast.error).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(LS_KEY.DECKS)!)).toHaveLength(1);
    expect(localStorage.getItem(LS_KEY.STAR_DECK)).toBe("d1");
  });
});

describe("persistAndStarDeck — a malformed deck (#1609)", () => {
  it("refuses it: toasted, not stored, not starred, invalid_shape", async () => {
    const broken = { id: "x", name: "x", deck_data: {} } as any;
    expect(await persistAndStarDeck(broken, "deeplink")).toBe(false);
    expect(toast.error).toHaveBeenCalled();
    expect(localStorage.getItem(LS_KEY.DECKS)).toBeNull();
    expect(localStorage.getItem(LS_KEY.STAR_DECK)).toBeNull();
    expect(mockTrack).toHaveBeenCalledWith("deck_add_failed", { source: "deeplink", reason: "invalid_shape" });
  });

  it("replaces a malformed stored copy with the same id by the good one", async () => {
    localStorage.setItem(LS_KEY.DECKS, JSON.stringify([{ id: "d1", deck_data: {} }]));
    expect(await persistAndStarDeck(deck("d1", "JollyGrin"))).toBe(true);
    const stored = JSON.parse(localStorage.getItem(LS_KEY.DECKS)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("d1");
    expect(localStorage.getItem(LS_KEY.STAR_DECK)).toBe("d1");
  });
});
