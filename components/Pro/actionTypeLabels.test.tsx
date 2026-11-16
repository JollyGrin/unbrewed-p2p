/**
 * The two places that name an action by its TYPE outside the dock — the replay
 * scrubber's step log and the undo-consent dialog — for protocol v41's
 * `USE_ABILITY` (engine #1080, p2p #1693), and for a type neither knows.
 */
import { actionLabel } from "./ReplayScrubber";
import { undoActionLabel } from "./UndoRequestDialog";
import type { Action } from "@/lib/pro/protocol";

describe("replay scrubber step label", () => {
  it("names the ability by the label the action carries", () => {
    expect(
      actionLabel({ type: "USE_ABILITY", player: "p1", ability: "reward-2", label: "Reward 2", card: "pomni/reward-2" })
    ).toBe("p1: use Reward 2 (free)");
  });

  it("falls back to the ability id, then to a generic word", () => {
    expect(actionLabel({ type: "USE_ABILITY", player: "p2", ability: "reward-3" })).toBe("p2: use reward-3 (free)");
    expect(actionLabel({ type: "USE_ABILITY" })).toBe("?: use ability (free)");
  });

  it("an unknown type still reads", () => {
    expect(actionLabel({ type: "CHANNEL_THE_VOID", player: "p1" })).toBe("p1: channel the void");
  });
});

describe("undo dialog label", () => {
  it("calls it a free ability", () => {
    expect(undoActionLabel("USE_ABILITY")).toBe("a free ability");
  });

  it("an unknown type still reads", () => {
    expect(undoActionLabel("CHANNEL_THE_VOID" as Action["type"])).toBe("an action");
  });
});
