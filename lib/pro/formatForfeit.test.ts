/** The forfeit-copy format registry (p2p #1474): the ForfeitDialog body per format. */
import { ADVENTURE_FORFEIT_COPY, DUEL_FORFEIT_COPY, MULTIPLAYER_FORFEIT_COPY, formatForfeitCopy } from "./formatForfeit";
import type { PlayerView } from "./protocol";

const seats = (n: number, scenario = false) =>
  ({
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })),
    ...(scenario ? { scenario: { id: "synthetic-pack" } } : {}),
  }) as unknown as PlayerView;

describe("formatForfeitCopy", () => {
  it("duel copy is unchanged byte for byte", () => {
    expect(formatForfeitCopy("duel", seats(2))).toBe("Your opponent wins. This cannot be undone.");
    expect(DUEL_FORFEIT_COPY).toBe("Your opponent wins. This cannot be undone.");
  });
  it("ffa-3 / team-2v2 keep the multiplayer copy", () => {
    expect(formatForfeitCopy("ffa-3", seats(3))).toBe(MULTIPLAYER_FORFEIT_COPY);
    expect(formatForfeitCopy("team-2v2", seats(4))).toBe(MULTIPLAYER_FORFEIT_COPY);
  });
  it("adventure: one client-knowable line, whatever the seat count", () => {
    expect(formatForfeitCopy("adventure", seats(1, true))).toBe(ADVENTURE_FORFEIT_COPY);
    expect(formatForfeitCopy("adventure", seats(4, true))).toBe(ADVENTURE_FORFEIT_COPY);
    expect(ADVENTURE_FORFEIT_COPY).not.toMatch(/plays on|last hero/);
  });
  it("the registry decides over the view's shape", () => {
    expect(formatForfeitCopy("duel", seats(3))).toBe(DUEL_FORFEIT_COPY);
  });
  it("no / unknown format id: reads the shape off the view", () => {
    expect(formatForfeitCopy(undefined, seats(2))).toBe(DUEL_FORFEIT_COPY);
    expect(formatForfeitCopy(null, seats(3))).toBe(MULTIPLAYER_FORFEIT_COPY);
    expect(formatForfeitCopy("boss", seats(2, true))).toBe(ADVENTURE_FORFEIT_COPY);
  });
});
