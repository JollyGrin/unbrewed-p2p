/**
 * A bag write that overflows the device quota must explain itself, not throw
 * out of the hook and lose the deck silently (#645).
 */
import { toast } from "react-hot-toast";

import { isQuotaExceeded, QUOTA_MESSAGE, safeSetItem } from "./quota";

jest.mock("react-hot-toast", () => ({
  toast: { error: jest.fn() },
}));

const quotaError = () => {
  const err = new Error("quota") as Error & { name: string; code: number };
  err.name = "QuotaExceededError";
  err.code = 22;
  return err;
};

describe("safeSetItem", () => {
  const setItem = jest.spyOn(Storage.prototype, "setItem");

  beforeEach(() => jest.clearAllMocks());
  afterAll(() => setItem.mockRestore());

  it("writes and reports success", () => {
    setItem.mockImplementation(() => undefined);
    expect(safeSetItem("DECKS", "[]")).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("toasts and returns false when the device is full", () => {
    setItem.mockImplementation(() => {
      throw quotaError();
    });
    expect(safeSetItem("DECKS", "[]")).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(QUOTA_MESSAGE, {
      id: "storage-quota",
    });
  });

  it("rethrows anything that isn't a quota failure", () => {
    setItem.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => safeSetItem("DECKS", "[]")).toThrow("boom");
  });
});

describe("isQuotaExceeded", () => {
  it("recognises the browsers' shapes", () => {
    expect(isQuotaExceeded(quotaError())).toBe(true);
    expect(isQuotaExceeded({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaExceeded({ code: 1014 })).toBe(true);
    expect(isQuotaExceeded(new Error("boom"))).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
  });
});
