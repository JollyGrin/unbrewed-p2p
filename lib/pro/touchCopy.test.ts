import { describe, expect, test } from "@jest/globals";
import { touchCopy } from "./touchCopy";

describe("touchCopy", () => {
  test("says tap instead of click, keeping the capitalisation", () => {
    expect(touchCopy("click a gold space to move there (2 options)")).toBe("tap a gold space to move there (2 options)");
    expect(touchCopy("Click which fighter should move (or tap the space again to cancel)")).toBe(
      "Tap which fighter should move (or tap the space again to cancel)"
    );
  });

  test("leaves other words alone", () => {
    expect(touchCopy("clicker clicks")).toBe("clicker clicks");
  });
});
