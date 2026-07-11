import { proErrorMessage } from "./proErrors";
import type { ErrorCode } from "./protocol";

describe("proErrorMessage (issue #209)", () => {
  it("renders friendly, actionable copy for ROOM_LIMIT (server at capacity)", () => {
    expect(proErrorMessage("ROOM_LIMIT")).toBe("Server is full — try again in a few minutes.");
  });

  it("renders a gentle 'slow down' line for RATE_LIMITED", () => {
    expect(proErrorMessage("RATE_LIMITED")).toBe("Slowing down — too many actions at once.");
  });

  it("still maps the pre-existing room codes", () => {
    expect(proErrorMessage("ROOM_NOT_FOUND")).toBe("This room expired or never existed.");
    expect(proErrorMessage("ROOM_FULL")).toBe("This room is already full.");
  });

  it("falls back to a generic line for an unknown/older code (never throws)", () => {
    expect(proErrorMessage("SOME_FUTURE_CODE")).toBe("Something went wrong. Please try again.");
  });

  it("has non-empty copy for every ErrorCode in the protocol union", () => {
    const codes: ErrorCode[] = [
      "VERSION",
      "BAD_MESSAGE",
      "ROOM_NOT_FOUND",
      "ROOM_FULL",
      "BAD_TOKEN",
      "NOT_YOUR_SEAT",
      "ILLEGAL_ACTION",
      "UNKNOWN_HERO",
      "BAD_MAP",
      "RESUME_FAILED",
      "UNDO_UNAVAILABLE",
      "ROOM_LIMIT",
      "RATE_LIMITED",
      "SERVER_ERROR",
    ];
    for (const code of codes) {
      expect(proErrorMessage(code).length).toBeGreaterThan(0);
      expect(proErrorMessage(code)).not.toBe("Something went wrong. Please try again.");
    }
  });
});
