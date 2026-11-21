import { act, renderHook } from "@testing-library/react";

import {
  SHARP_HAND_KEY,
  applySharpHandUrl,
  readSharpHand,
  resetSharpHandUrlForTests,
  useSharpHand,
  writeSharpHand,
} from "./sharpHand";

/** Load the page at `url`, the way a followed link would. */
const visit = (url: string) => {
  window.history.replaceState({}, "", url);
  resetSharpHandUrlForTests();
  applySharpHandUrl();
};
/** The page changes its own query without loading (hotseat seat switch). */
const rewriteQuery = (url: string) => {
  window.history.replaceState({}, "", url);
  applySharpHandUrl();
};

const navigationType = (type: string) =>
  jest
    .spyOn(performance, "getEntriesByType")
    .mockReturnValue([{ type } as unknown as PerformanceEntry]);

beforeAll(() => {
  // jsdom has no navigation timing; a plain page load is the default.
  if (typeof performance.getEntriesByType !== "function")
    (performance as any).getEntriesByType = () => [];
});
beforeEach(() => {
  localStorage.clear();
  visit("/offline");
});
afterEach(() => jest.restoreAllMocks());

describe("Sharp hand cards setting (#1712)", () => {
  it("is off by default", () => {
    expect(readSharpHand()).toBe(false);
    expect(renderHook(() => useSharpHand()).result.current[0]).toBe(false);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBeNull();
  });

  it("is saved on this device and read back after a reload", () => {
    writeSharpHand(true);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBe("1");
    visit("/game"); // a new page load, no parameter
    expect(readSharpHand()).toBe(true);

    writeSharpHand(false);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBeNull();
    expect(readSharpHand()).toBe(false);
  });

  it("the switch updates every reader at once", () => {
    const a = renderHook(() => useSharpHand());
    const b = renderHook(() => useSharpHand());
    act(() => a.result.current[1](true));
    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(true);
    act(() => b.result.current[1](false));
    expect(a.result.current[0]).toBe(false);
  });

  it("?sharpHand=1 turns it on and saves it", () => {
    window.history.replaceState({}, "", "/offline?deckId=abc&sharpHand=1");
    resetSharpHandUrlForTests();
    // the hook takes the link itself, and every reader agrees
    const a = renderHook(() => useSharpHand());
    const b = renderHook(() => useSharpHand());
    expect(a.result.current[0]).toBe(true);
    expect(b.result.current[0]).toBe(true);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBe("1");
    // the next visit, without the parameter, still has it
    visit("/offline?deckId=abc");
    expect(readSharpHand()).toBe(true);
  });

  it("reading the setting never applies the link (only a subscriber does)", () => {
    window.history.replaceState({}, "", "/offline?sharpHand=1");
    resetSharpHandUrlForTests();
    expect(readSharpHand()).toBe(false);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBeNull();
  });

  it("?sharpHand=0 turns it off; any other value changes nothing", () => {
    writeSharpHand(true);
    visit("/offline?sharpHand=yes");
    expect(readSharpHand()).toBe(true);
    visit("/offline?sharpHand=0");
    expect(readSharpHand()).toBe(false);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBeNull();
    visit("/offline?sharpHand=");
    expect(readSharpHand()).toBe(false);
  });

  it("a click on the switch wins over the link the page was opened with", () => {
    window.history.replaceState({}, "", "/offline?sharpHand=1");
    resetSharpHandUrlForTests();
    const { result } = renderHook(() => useSharpHand());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(readSharpHand()).toBe(false);
  });

  it("a query change that keeps the parameter does not apply it again", () => {
    visit("/offline?deckId=abc&name=p1&sharpHand=1");
    const { result } = renderHook(() => useSharpHand());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false)); // the player switches it off

    // hotseat: Switch seat rewrites ?name=, the rest of the query stays
    act(() => rewriteQuery("/offline?deckId=abc&name=p2&sharpHand=1"));
    expect(result.current[0]).toBe(false);
    act(() => rewriteQuery("/offline?deckId=abc&name=p1&sharpHand=1"));
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBeNull();
    // a component mounting later (the fan after a seat switch) does not either
    expect(renderHook(() => useSharpHand()).result.current[0]).toBe(false);
  });

  it("a click wins across a seat switch for ?sharpHand=0 too", () => {
    visit("/offline?name=p1&sharpHand=0");
    const { result } = renderHook(() => useSharpHand());
    act(() => result.current[1](true));
    act(() => rewriteQuery("/offline?name=p2&sharpHand=0"));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBe("1");
  });

  it.each(["reload", "back_forward"])(
    "a %s of the linked address does not undo a later click",
    (type) => {
      visit("/offline?sharpHand=1");
      writeSharpHand(false);
      navigationType(type);
      visit("/offline?sharpHand=1");
      expect(readSharpHand()).toBe(false);
    },
  );

  it("still works for the session when storage refuses the write", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useSharpHand());
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBeNull();
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);

    // and the link, with storage blocked
    visit("/offline?sharpHand=1");
    expect(readSharpHand()).toBe(true);
  });
});
