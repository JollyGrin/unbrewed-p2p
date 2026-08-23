import {
  advanceLobbyCue,
  initialLobbyCueState,
  LobbyCueSignals,
  LobbyCueState,
  MATCH_FOUND_TITLE,
  seatFilledTitle,
  WAITING_DWELL_MS,
} from "./lobbyCue";

const T0 = 1_700_000_000_000;

const sig = (over: Partial<LobbyCueSignals> = {}): LobbyCueSignals => ({
  seated: true,
  seatsFilled: 1,
  requiredPlayers: 2,
  started: false,
  hasBot: false,
  now: T0,
  ...over,
});

/** fold a script of observations, collecting every cue it produced */
const run = (steps: Partial<LobbyCueSignals>[], from?: LobbyCueState) => {
  let state = from ?? initialLobbyCueState();
  const cues: (string | null)[] = [];
  for (const step of steps) {
    const next = advanceLobbyCue(state, sig(step));
    state = next.state;
    cues.push(next.cue);
  }
  return { state, cues: cues.filter(Boolean) as string[] };
};

describe("advanceLobbyCue — the waiting host", () => {
  it("cues once when the opponent lands after a real wait", () => {
    const { cues } = run([
      { now: T0 }, // created the room, seat empty
      { now: T0 + 30_000, seatsFilled: 2, started: true }, // they joined, game on
    ]);
    expect(cues).toEqual(["start"]);
  });

  it("does not cue twice when seats-full and game-start arrive separately", () => {
    const { cues } = run([
      { now: T0 },
      { now: T0 + 30_000, seatsFilled: 2 }, // ROOM_STATUS: room full, no STATE yet
      { now: T0 + 30_050, seatsFilled: 2, started: true }, // STATE right behind it
      { now: T0 + 31_000, seatsFilled: 2, started: true }, // later broadcasts
    ]);
    expect(cues).toEqual(["start"]);
  });

  it("still cues after the waiting screen re-renders many times", () => {
    const { cues } = run([
      { now: T0 },
      { now: T0 + 5_000 },
      { now: T0 + 10_000 },
      { now: T0 + 20_000, seatsFilled: 2, started: true },
    ]);
    expect(cues).toEqual(["start"]);
  });
});

describe("advanceLobbyCue — who must stay silent", () => {
  it("never cues for the player joining someone else's duel", () => {
    // the joiner's ROOM_JOINED already reports both seats
    const { cues } = run([
      { now: T0, seatsFilled: 2 },
      { now: T0 + 40, seatsFilled: 2, started: true },
    ]);
    expect(cues).toEqual([]);
  });

  it("never cues on a joiner whose ROOM_JOINED omitted the seat list", () => {
    // older server: seats defaults to [you], so the joiner briefly looks like a
    // waiting host — the dwell window is what rules it out
    const { cues } = run([
      { now: T0, seatsFilled: 1 },
      { now: T0 + 80, seatsFilled: 2, started: true },
    ]);
    expect(cues).toEqual([]);
  });

  it("never cues on reconnect into a live room", () => {
    const { cues } = run([{ now: T0, seatsFilled: 2, started: true }]);
    expect(cues).toEqual([]);
  });

  it("never cues in a bot room, however the seats look", () => {
    const { cues } = run([
      { now: T0, hasBot: true },
      { now: T0 + 5_000, hasBot: true, seatsFilled: 2, started: true },
    ]);
    expect(cues).toEqual([]);
  });

  it("stays silent while nobody is seated", () => {
    const { cues } = run([
      { now: T0, seated: false, seatsFilled: 0 },
      { now: T0 + 10_000, seated: false, seatsFilled: 0 },
    ]);
    expect(cues).toEqual([]);
  });

  it("is inert once it has settled — a late STATE cannot re-ring", () => {
    const { state, cues } = run([
      { now: T0 },
      { now: T0 + 20_000, seatsFilled: 2, started: true },
    ]);
    expect(cues).toEqual(["start"]);
    expect(state.done).toBe(true);
    expect(advanceLobbyCue(state, sig({ now: T0 + 60_000, seatsFilled: 2, started: true })).cue)
      .toBeNull();
  });
});

describe("advanceLobbyCue — the dwell window", () => {
  it("requires the wait to hold before a start can ring", () => {
    const justShort = run([
      { now: T0 },
      { now: T0 + WAITING_DWELL_MS - 1, seatsFilled: 2, started: true },
    ]);
    expect(justShort.cues).toEqual([]);

    const justEnough = run([
      { now: T0 },
      { now: T0 + WAITING_DWELL_MS, seatsFilled: 2, started: true },
    ]);
    expect(justEnough.cues).toEqual(["start"]);
  });
});

describe("advanceLobbyCue — multi-seat formats", () => {
  it("softly cues each fill and rings loud at the start", () => {
    const { cues } = run([
      { now: T0, requiredPlayers: 4, seatsFilled: 1 },
      { now: T0 + 10_000, requiredPlayers: 4, seatsFilled: 2 },
      { now: T0 + 20_000, requiredPlayers: 4, seatsFilled: 3 },
      { now: T0 + 30_000, requiredPlayers: 4, seatsFilled: 4 }, // full, no STATE yet
      { now: T0 + 30_100, requiredPlayers: 4, seatsFilled: 4, started: true },
    ]);
    expect(cues).toEqual(["fill", "fill", "start"]);
  });

  it("does not cue when a pre-game ghost seat is released", () => {
    const { cues } = run([
      { now: T0, requiredPlayers: 4, seatsFilled: 3 },
      { now: T0 + 10_000, requiredPlayers: 4, seatsFilled: 2 }, // someone bailed
    ]);
    expect(cues).toEqual([]);
  });
});

describe("titles", () => {
  it("shouts unmissably for the start cue", () => {
    expect(MATCH_FOUND_TITLE).toContain("Opponent joined");
  });

  it("counts the seats for a soft cue", () => {
    expect(seatFilledTitle(3, 4)).toBe("⚔ 3/4 seats — waiting…");
  });
});
