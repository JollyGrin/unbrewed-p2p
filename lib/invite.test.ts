/**
 * `persistAndStarDeck` is the Join/Share write that bypasses `useBagDecks`, so
 * it carries its own blocked-author check (#790).
 */
import { toast } from "react-hot-toast";

import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetBagStoresForTests } from "@/lib/bag/bagStore";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import { persistAndStarDeck } from "./invite";

jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const deck = (id: string, user: string) =>
  ({ id, name: id, user, version_id: `${id}-v1`, deck_data: { cards: [] } }) as any;

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
