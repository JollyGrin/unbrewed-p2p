/**
 * The tabletop zone-disc preference (#1395): off until the viewer turns it
 * on, stored per device, and never throwing when storage is blocked.
 */
import { act, renderHook } from "@testing-library/react";
import { ZONE_DISCS_KEY, useZoneDiscs } from "./useZoneDiscs";
import { DEFAULT_ZONE_DISCS, parseZoneDiscs, serializeZoneDiscs, zoneDiscsStateLabel } from "./zoneDiscs";

afterEach(() => window.localStorage.clear());

describe("zoneDiscs vocabulary", () => {
  test("the default is OFF: the art carries the zones", () => {
    expect(DEFAULT_ZONE_DISCS).toBe(false);
  });

  test.each([
    ["on", true],
    ["off", false],
    [null, false],
    [undefined, false],
    ["true", false],
    ["yes", false],
  ])("parses a stored %p as %p (anything but on/off is the default)", (stored, on) => {
    expect(parseZoneDiscs(stored)).toBe(on);
  });

  test("round-trips through its stored form", () => {
    expect(parseZoneDiscs(serializeZoneDiscs(true))).toBe(true);
    expect(parseZoneDiscs(serializeZoneDiscs(false))).toBe(false);
  });

  test("labels the state for the HUD controls", () => {
    expect(zoneDiscsStateLabel(true)).toBe("on");
    expect(zoneDiscsStateLabel(false)).toBe("off");
  });
});

describe("useZoneDiscs", () => {
  test("starts off, toggles on, and survives a reload", () => {
    const first = renderHook(() => useZoneDiscs());
    expect(first.result.current[0]).toBe(false);
    act(() => first.result.current[1]());
    expect(first.result.current[0]).toBe(true);
    expect(window.localStorage.getItem(ZONE_DISCS_KEY)).toBe("on");
    first.unmount();
    // A fresh mount stands in for a reload: it reads the stored choice.
    const again = renderHook(() => useZoneDiscs());
    expect(again.result.current[0]).toBe(true);
    act(() => again.result.current[1]());
    expect(again.result.current[0]).toBe(false);
    expect(window.localStorage.getItem(ZONE_DISCS_KEY)).toBe("off");
  });

  test("is stored under its own key", () => {
    expect(ZONE_DISCS_KEY).toBe("pro-table-zone-discs");
  });

  test("ignores a stored value that is not on/off", () => {
    window.localStorage.setItem(ZONE_DISCS_KEY, "maybe");
    expect(renderHook(() => useZoneDiscs()).result.current[0]).toBe(false);
  });

  test("blocked storage never throws", () => {
    const get = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useZoneDiscs());
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    get.mockRestore();
    set.mockRestore();
  });
});
