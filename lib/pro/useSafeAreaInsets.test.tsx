import { renderHook } from "@testing-library/react";
import { ZERO_INSETS, insetsFromPadding, useSafeAreaInsets } from "./useSafeAreaInsets";

describe("insetsFromPadding", () => {
  test("reads the four padding lengths a probe element resolved env() into", () => {
    expect(
      insetsFromPadding({ paddingTop: "0px", paddingRight: "59px", paddingBottom: "21px", paddingLeft: "59px" })
    ).toEqual({ top: 0, right: 59, bottom: 21, left: 59 });
  });

  test("treats anything unreadable as no inset", () => {
    expect(insetsFromPadding({ paddingTop: "", paddingRight: "auto", paddingBottom: "x", paddingLeft: "-3px" })).toEqual(
      ZERO_INSETS
    );
  });
});

describe("useSafeAreaInsets", () => {
  test("is all zeros where the browser has no safe areas (jsdom, desktop)", () => {
    const { result } = renderHook(() => useSafeAreaInsets(true));
    expect(result.current).toEqual(ZERO_INSETS);
  });

  test("stays zero while disabled", () => {
    const { result } = renderHook(() => useSafeAreaInsets(false));
    expect(result.current).toEqual(ZERO_INSETS);
  });
});
