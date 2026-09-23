import { defendCueBeats } from "./defendCue";

describe("defendCueBeats", () => {
  it("strikes twice so the cue reads as urgent, not as a plain turn ding", () => {
    const beats = defendCueBeats();
    expect(beats).toHaveLength(2);
    expect(beats[0].opts.delayMs).toBeUndefined();
    expect(beats[1].opts.delayMs).toBeGreaterThan(0);
  });

  it("pitches both knocks below the turn ding it borrows", () => {
    for (const beat of defendCueBeats()) {
      expect(beat.name).toBe("turn");
      expect(beat.opts.rate).toBeLessThan(1);
    }
  });

  it("keeps the two knocks close enough to hear as one gesture", () => {
    expect(defendCueBeats()[1].opts.delayMs).toBeLessThan(300);
  });
});
