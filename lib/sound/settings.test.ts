import { act, renderHook } from "@testing-library/react";

import {
  DEFAULT_SOUND_MUTED,
  DEFAULT_SOUND_OTHERS,
  DEFAULT_SOUND_VOLUME,
  getSoundPrefs,
  setSoundPrefs,
  toggleSoundMuted,
  useSoundPrefs,
} from "./settings";

beforeEach(() => {
  localStorage.clear();
  // Drop the cached snapshot the way another tab's write would.
  window.dispatchEvent(new Event("storage"));
});

describe("sound settings", () => {
  it("defaults to on, quiet, other players audible", () => {
    expect(getSoundPrefs()).toEqual({
      muted: DEFAULT_SOUND_MUTED,
      volume: DEFAULT_SOUND_VOLUME,
      others: DEFAULT_SOUND_OTHERS,
    });
    expect(DEFAULT_SOUND_MUTED).toBe(false);
    expect(DEFAULT_SOUND_VOLUME).toBeLessThanOrEqual(0.7);
  });

  it("saves on this device and reads back after a reload", () => {
    setSoundPrefs({ muted: true, volume: 0.25 });
    expect(localStorage.getItem("unbrewed-sound-muted")).toBe("1");
    expect(localStorage.getItem("unbrewed-sound-volume")).toBe("0.25");
    window.dispatchEvent(new Event("storage")); // forget the cache
    expect(getSoundPrefs()).toMatchObject({ muted: true, volume: 0.25 });
  });

  it("ignores a corrupt or out-of-range saved volume", () => {
    localStorage.setItem("unbrewed-sound-volume", "loud");
    window.dispatchEvent(new Event("storage"));
    expect(getSoundPrefs().volume).toBe(DEFAULT_SOUND_VOLUME);
    localStorage.setItem("unbrewed-sound-volume", "7");
    window.dispatchEvent(new Event("storage"));
    expect(getSoundPrefs().volume).toBe(1);
  });

  it("every reader sees a change at once", () => {
    const a = renderHook(() => useSoundPrefs());
    const b = renderHook(() => useSoundPrefs());
    expect(a.result.current[0].muted).toBe(false);
    act(() => toggleSoundMuted());
    expect(a.result.current[0].muted).toBe(true);
    expect(b.result.current[0].muted).toBe(true);
    act(() => b.result.current[1]({ muted: false, others: false }));
    expect(a.result.current[0]).toMatchObject({ muted: false, others: false });
  });

  it("still applies for the session when storage refuses the write", () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    setSoundPrefs({ muted: true });
    expect(getSoundPrefs().muted).toBe(true);
    spy.mockRestore();
  });
});
