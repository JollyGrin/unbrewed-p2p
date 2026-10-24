/** The Undo format registry (#1473): which tables ever get an Undo control. */
import { formatSupportsUndo } from "./formatUndo";
import type { PlayerView } from "./protocol";

const seats = (n: number, scenario = false) =>
  ({
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })),
    ...(scenario ? { scenario: { id: "synthetic-pack" } } : {}),
  }) as unknown as PlayerView;

describe("formatSupportsUndo", () => {
  it("duel (consent) and adventure (solo rule) can offer undo", () => {
    expect(formatSupportsUndo("duel", seats(2))).toBe(true);
    expect(formatSupportsUndo("adventure", seats(4, true))).toBe(true);
    expect(formatSupportsUndo("adventure", seats(1, true))).toBe(true);
  });
  it("ffa-3 and team-2v2 never can — the engine refuses undo past two seats without an engine seat", () => {
    expect(formatSupportsUndo("ffa-3", seats(3))).toBe(false);
    expect(formatSupportsUndo("team-2v2", seats(4))).toBe(false);
  });
  it("no / unknown format id: reads the engine's rule off the view — two seats, or a scenario game", () => {
    expect(formatSupportsUndo(undefined, seats(2))).toBe(true);
    expect(formatSupportsUndo(null, seats(4, true))).toBe(true);
    expect(formatSupportsUndo(undefined, seats(3))).toBe(false);
    expect(formatSupportsUndo("boss", seats(4))).toBe(false);
  });
});
