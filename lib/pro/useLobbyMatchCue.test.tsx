import { act, renderHook } from "@testing-library/react";
import { MATCH_FOUND_TITLE, WAITING_TITLE } from "./lobbyCue";
import { useLobbyMatchCue, UseLobbyMatchCueOptions } from "./useLobbyMatchCue";

const played: { name: string; volume?: number }[] = [];
jest.mock("./sfx", () => ({
  sfx: {
    init: jest.fn(),
    play: (name: string, opts?: { volume?: number }) =>
      played.push({ name, volume: opts?.volume }),
  },
}));

/** jsdom's document.hidden is a getter on the prototype — override it here */
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

const waitingProps = (over: Partial<UseLobbyMatchCueOptions> = {}): UseLobbyMatchCueOptions => ({
  roomId: "ROOM1",
  seated: true,
  seatsFilled: 1,
  requiredPlayers: 2,
  started: false,
  hasBot: false,
  soundOn: true,
  ...over,
});

/** the wait has to outlive the dwell window before a start can ring */
const advanceClock = (ms: number) => {
  const base = Date.now();
  jest.spyOn(Date, "now").mockReturnValue(base + ms);
};

beforeEach(() => {
  played.length = 0;
  hidden = false;
  document.title = "Unbrewed Pro";
  jest.restoreAllMocks();
});

describe("useLobbyMatchCue", () => {
  it("chimes and renames a hidden tab when the game starts", () => {
    const { rerender } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps(),
    });
    setHidden(true);
    expect(document.title).toBe(WAITING_TITLE);

    advanceClock(30_000);
    rerender(waitingProps({ seatsFilled: 2, started: true }));

    expect(played).toEqual([{ name: "match-found", volume: undefined }]);
    expect(document.title).toBe(MATCH_FOUND_TITLE);
  });

  it("goes straight from the waiting title to the announcement", () => {
    // regression: the cue and the title land in the same commit, and a stale
    // read put the page's own title back for one frame in between
    const seen: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, "title")!;
    Object.defineProperty(document, "title", {
      configurable: true,
      get: () => desc.get!.call(document),
      set: (v: string) => {
        seen.push(v);
        desc.set!.call(document, v);
      },
    });

    const { rerender } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps(),
    });
    setHidden(true);
    advanceClock(30_000);
    rerender(waitingProps({ seatsFilled: 2, started: true }));

    // (a repeat write of the same title is a harmless no-op — collapse them)
    const changes = seen.filter((t, i) => t !== seen[i - 1]);
    expect(changes).toEqual([WAITING_TITLE, MATCH_FOUND_TITLE]);
    delete (document as unknown as Record<string, unknown>).title;
  });

  it("restores the original title when the player comes back", () => {
    const { rerender } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps(),
    });
    setHidden(true);
    advanceClock(30_000);
    rerender(waitingProps({ seatsFilled: 2, started: true }));
    expect(document.title).toBe(MATCH_FOUND_TITLE);

    setHidden(false);
    expect(document.title).toBe("Unbrewed Pro");
  });

  it("leaves a visible tab's title alone", () => {
    const { rerender } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps(),
    });
    advanceClock(30_000);
    rerender(waitingProps({ seatsFilled: 2, started: true }));

    expect(played).toHaveLength(1);
    expect(document.title).toBe("Unbrewed Pro");
  });

  it("mutes the chime but still renames the tab", () => {
    const { rerender } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps({ soundOn: false }),
    });
    setHidden(true);
    advanceClock(30_000);
    rerender(waitingProps({ soundOn: false, seatsFilled: 2, started: true }));

    expect(played).toEqual([]);
    expect(document.title).toBe(MATCH_FOUND_TITLE);
  });

  it("says nothing to a player joining a room that is already full", () => {
    const { rerender } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps({ seatsFilled: 2 }),
    });
    setHidden(true);
    rerender(waitingProps({ seatsFilled: 2, started: true }));

    expect(played).toEqual([]);
    expect(document.title).toBe("Unbrewed Pro");
  });

  it("plays the soft cue quieter when a seat fills a 2v2 lobby", () => {
    const { rerender } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps({ requiredPlayers: 4 }),
    });
    advanceClock(20_000);
    rerender(waitingProps({ requiredPlayers: 4, seatsFilled: 2 }));

    expect(played).toEqual([{ name: "match-found", volume: 0.4 }]);
  });

  it("puts the title back when the lobby unmounts", () => {
    const { unmount } = renderHook((p: UseLobbyMatchCueOptions) => useLobbyMatchCue(p), {
      initialProps: waitingProps(),
    });
    setHidden(true);
    expect(document.title).toBe(WAITING_TITLE);
    unmount();
    expect(document.title).toBe("Unbrewed Pro");
  });
});
