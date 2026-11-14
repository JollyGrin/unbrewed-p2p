import { playSound, soundDragEnd, soundDragMove } from "./index";
import { playVoice } from "./engine";
import { setSoundPrefs } from "./settings";

// The audio backend is mocked: three takes of everything, always ready.
jest.mock("./engine", () => ({
  engineReady: jest.fn(() => true),
  takeCount: jest.fn(() => 3),
  playVoice: jest.fn(),
  armSoundEngine: jest.fn(),
}));

const played = playVoice as jest.Mock;
const { engineReady } = jest.requireMock("./engine") as { engineReady: jest.Mock };
const events = () => played.mock.calls.map(([v]) => v.event);

// The director is one per page, so space the tests out past its rate limits.
let clock = 0;
beforeEach(() => {
  clock += 10_000;
  jest.spyOn(performance, "now").mockImplementation(() => clock);
  played.mockClear();
  engineReady.mockReturnValue(true);
  localStorage.clear();
  setSoundPrefs({ muted: false });
});
afterEach(() => jest.restoreAllMocks());

describe("playSound", () => {
  it("hands the backend one voice for the event", () => {
    playSound("draw");
    expect(events()).toEqual(["draw"]);
  });

  it("is silent while muted, and the toggle takes effect on the next call", () => {
    setSoundPrefs({ muted: true });
    playSound("draw");
    playSound("shuffle");
    expect(played).not.toHaveBeenCalled();
    setSoundPrefs({ muted: false });
    playSound("draw");
    expect(events()).toEqual(["draw"]);
  });

  it("is silent when audio cannot play yet (no gesture, hidden tab)", () => {
    engineReady.mockReturnValue(false);
    playSound("draw");
    expect(played).not.toHaveBeenCalled();
  });

  it("records requests for a probe that asks for the log", () => {
    const w = window as unknown as { __unbrewedSoundLog?: unknown[] };
    w.__unbrewedSoundLog = [];
    playSound("flip");
    setSoundPrefs({ muted: true });
    playSound("flip");
    expect(w.__unbrewedSoundLog).toEqual([
      { event: "flip", opts: undefined, voices: 1 },
      { event: "flip", opts: undefined, voices: 0 },
    ]);
    delete w.__unbrewedSoundLog;
  });
});

describe("token drag sounds", () => {
  it("a click that does not move the token makes no sound", () => {
    soundDragMove({ x: 100, y: 100 });
    soundDragMove({ x: 102, y: 101 });
    soundDragEnd();
    expect(played).not.toHaveBeenCalled();
  });

  it("a piece lifts once when it really moves and lands on release", () => {
    soundDragMove({ x: 100, y: 100 });
    for (let i = 1; i <= 30; i++) soundDragMove({ x: 100 + i * 4, y: 100 });
    expect(events()).toEqual(["tokenUp"]);
    clock += 400;
    soundDragEnd();
    expect(events()).toEqual(["tokenUp", "tokenDown"]);
  });

  it("a card on the table sounds like paper, not a piece", () => {
    soundDragMove({ x: 0, y: 0, card: { title: "Feint" } });
    soundDragMove({ x: 40, y: 0, card: { title: "Feint" } });
    clock += 400;
    soundDragEnd();
    expect(events()).toEqual(["cardUp", "place"]);
  });

  it("a release with no drag before it is ignored", () => {
    soundDragEnd();
    expect(played).not.toHaveBeenCalled();
  });
});
