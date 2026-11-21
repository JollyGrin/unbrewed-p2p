import { act, renderHook } from "@testing-library/react";

import {
  SHARP_HAND_KEY,
  readSharpHand,
  resetSharpHandUrlForTests,
  useSharpHand,
  writeSharpHand,
} from "./sharpHand";

/** Load the page at `url`, the way a followed link would. */
const visit = (url: string) => {
  window.history.replaceState({}, "", url);
  resetSharpHandUrlForTests();
};

beforeEach(() => {
  localStorage.clear();
  visit("/offline");
});

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
    visit("/offline?deckId=abc&sharpHand=1");
    expect(renderHook(() => useSharpHand()).result.current[0]).toBe(true);
    expect(localStorage.getItem(SHARP_HAND_KEY)).toBe("1");
    // the next visit, without the parameter, still has it
    visit("/offline?deckId=abc");
    expect(readSharpHand()).toBe(true);
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
    visit("/offline?sharpHand=1");
    const { result } = renderHook(() => useSharpHand());
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(readSharpHand()).toBe(false);
  });
});
