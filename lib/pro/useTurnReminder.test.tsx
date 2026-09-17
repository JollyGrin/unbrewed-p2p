import { act, renderHook } from "@testing-library/react";
import { FIRST_NUDGE_MS, REPEAT_NUDGE_MS } from "./turnReminder";
import { useTurnReminder, UseTurnReminderOptions } from "./useTurnReminder";
import type { PlayerView } from "./protocol";

const played: { name: string; volume?: number }[] = [];
jest.mock("./sfx", () => ({
  sfx: {
    init: jest.fn(),
    play: (name: string, opts?: { volume?: number }) =>
      played.push({ name, volume: opts?.volume }),
  },
}));

/** jsdom's document.hidden is a getter on the prototype — override it, same
 *  trick as useLobbyMatchCue.test.tsx. */
let hidden = false;
beforeAll(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
});

const setHidden = (value: boolean) => {
  hidden = value;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    if (!value) window.dispatchEvent(new Event("focus"));
  });
};

const view = (over: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: "p1",
    phase: "PLAY",
    activePlayer: "p1",
    turnNumber: 3,
    actionsRemaining: 2,
    turnPhase: "ACTION_SELECT",
    winner: null,
    combat: null,
    prompt: null,
    players: [{ id: "p1", you: true }, { id: "p2", you: false }],
    ...over,
  } as unknown as PlayerView);

const props = (over: Partial<UseTurnReminderOptions> = {}): UseTurnReminderOptions => ({
  view: view(),
  enabled: true,
  soundOn: true,
  ...over,
});

let vibrate: jest.Mock;

beforeEach(() => {
  played.length = 0;
  hidden = false;
  document.title = "Unbrewed Pro";
  jest.useFakeTimers();
  vibrate = jest.fn();
  (navigator as unknown as { vibrate: jest.Mock }).vibrate = vibrate;
});

afterEach(() => {
  jest.useRealTimers();
  delete (navigator as unknown as { vibrate?: jest.Mock }).vibrate;
});

describe("useTurnReminder", () => {
  it("stays quiet before the first threshold", () => {
    const { result } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props(),
    });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS - 1));
    expect(result.current.pulse).toBeNull();
    expect(played).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("vibrates, plays the turn sound, and surfaces a pulse once the wait is up", () => {
    const { result } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props(),
    });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS));
    expect(result.current.pulse).toEqual({ key: 1, reason: "turn" });
    expect(played).toEqual([{ name: "turn", volume: 0.7 }]);
    expect(vibrate).toHaveBeenCalledWith(60);
  });

  it("repeats up to the cap, then stops", () => {
    const { result } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props(),
    });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS));
    act(() => jest.advanceTimersByTime(REPEAT_NUDGE_MS));
    act(() => jest.advanceTimersByTime(REPEAT_NUDGE_MS));
    expect(played).toHaveLength(3);
    expect(result.current.pulse?.key).toBe(3);

    act(() => jest.advanceTimersByTime(REPEAT_NUDGE_MS * 3));
    expect(played).toHaveLength(3);
  });

  it("mutes the sound but still vibrates and pulses when sound is off", () => {
    const { result } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props({ soundOn: false }),
    });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS));
    expect(played).toEqual([]);
    expect(vibrate).toHaveBeenCalledWith(60);
    expect(result.current.pulse).not.toBeNull();
  });

  it("stays fully silent when the setting is off", () => {
    const { result } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props({ enabled: false }),
    });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS * 3));
    expect(played).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
    expect(result.current.pulse).toBeNull();
  });

  it("never nudges a spectator view (no seat flagged `you`)", () => {
    const { result } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props({
        view: view({ players: [{ id: "p1", you: false }, { id: "p2", you: false }] } as Partial<PlayerView>),
      }),
    });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS * 3));
    expect(result.current.pulse).toBeNull();
  });

  it("resets when the player acts (progress) before the threshold, and a later idle wait still fires", () => {
    const { result, rerender } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props(),
    });
    act(() => jest.advanceTimersByTime(40_000));
    // played a card: still my turn, but a real action happened
    rerender(props({ view: view({ actionsRemaining: 1 }) }));
    act(() => jest.advanceTimersByTime(40_000));
    expect(result.current.pulse).toBeNull(); // would have fired at 60s of the OLD wait

    act(() => jest.advanceTimersByTime(20_000)); // now 60s since the action
    expect(result.current.pulse).toEqual({ key: 1, reason: "turn" });
  });

  it("resets the moment the turn passes, so it never nudges for someone else's move", () => {
    const { result, rerender } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props(),
    });
    act(() => jest.advanceTimersByTime(40_000));
    rerender(props({ view: view({ activePlayer: "p2" }) }));
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS));
    expect(result.current.pulse).toBeNull();
    expect(played).toEqual([]);
  });

  it("shouts from a backgrounded tab's title and restores it on return", () => {
    renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), { initialProps: props() });
    setHidden(true);
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS));
    expect(document.title).toBe("⏰ Still your turn…");

    setHidden(false);
    expect(document.title).toBe("Unbrewed Pro");
  });

  it("leaves a foregrounded tab's title alone", () => {
    renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), { initialProps: props() });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS));
    expect(document.title).toBe("Unbrewed Pro");
  });

  it("names the defense reason when a combat asks this seat to commit one", () => {
    const { result } = renderHook((p: UseTurnReminderOptions) => useTurnReminder(p), {
      initialProps: props({
        view: view({
          activePlayer: "p2",
          combat: { stage: "COMMIT_DEFENSE", defenderPlayer: "p1", attacker: "f1", target: "f2" },
        } as Partial<PlayerView>),
      }),
    });
    act(() => jest.advanceTimersByTime(FIRST_NUDGE_MS));
    expect(result.current.pulse).toEqual({ key: 1, reason: "defense" });
  });
});
