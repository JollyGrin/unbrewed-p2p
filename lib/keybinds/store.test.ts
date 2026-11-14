import { KEYBIND_ACTIONS, KeybindAction } from "./actions";
import { normalizeCombo, reservedReason } from "./combo";
import {
  KEYBINDS_STORAGE,
  findConflict,
  getKeybindSnapshot,
  parseStoredOverrides,
  refreshKeybinds,
  resetAllKeybinds,
  resolveBindings,
  serializeOverrides,
  withBinding,
  withDefault,
  withReplacedBinding,
  withoutBinding,
  writeOverrides,
} from "./store";

const SEAT_KEY = "unbrewed-hotseat-switch-key";
const stored = () => JSON.parse(localStorage.getItem(KEYBINDS_STORAGE) ?? "null");

beforeEach(() => {
  localStorage.clear();
  refreshKeybinds();
});

describe("the defaults", () => {
  const defaults = KEYBIND_ACTIONS.filter((a) => a.defaultKey);

  it("are canonical, unique, and not browser keys", () => {
    const seen = new Map<string, string>();
    for (const action of defaults) {
      const key = action.defaultKey!;
      expect(normalizeCombo(key)).toBe(key);
      expect(seen.get(key)).toBeUndefined();
      seen.set(key, action.id);
      // Esc is the one reserved key with a job: it clears the selection.
      if (action.id !== "clearSelection") expect(reservedReason(key)).toBeUndefined();
    }
  });

  it("cover the repeated table actions and leave the risky ones without a key", () => {
    const { bindings } = resolveBindings({});
    expect(bindings).toMatchObject({
      draw1: "D",
      search: "B",
      openDiscard: "G",
      shuffle: "Shift+S",
      addToken: "T",
      openDice: "R",
      flipSelected: "F",
      handSelected: "H",
      removeSelected: "Delete",
      clearSelection: "Escape",
      zoomIn: "+",
      zoomOut: "-",
      fitBoard: "0",
      toggleLog: "L",
      showShortcuts: "?",
      switchSeat: "S",
    });
    for (const id of ["newGame", "changeDeck", "mill1", "mill3", "discardRandom", "shuffleDiscardIn", "rolld20"]) {
      expect(bindings[id]).toBeNull();
    }
  });

  it("lists every registry command, so each can be given a key", () => {
    const ids = KEYBIND_ACTIONS.map((a) => a.id);
    for (const id of ["draw1", "draw2", "scry", "mill1", "search", "shuffle", "boostFromDeck", "discardRandom", "openDiscard", "rolld6", "addToken", "newGame", "changeDeck"]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parseStoredOverrides", () => {
  it("reads a versioned entry and canonicalises it", () => {
    expect(
      parseStoredOverrides('{"v":1,"overrides":{"draw1":"e","shuffle":null,"search":"shift+b"}}'),
    ).toEqual({ draw1: "E", shuffle: null, search: "Shift+B" });
  });

  it("reads nothing from corrupt, misshapen or newer data", () => {
    for (const raw of [
      null,
      "",
      "{not json",
      "[]",
      "null",
      '"D"',
      '{"overrides":{"draw1":"E"}}',
      '{"v":"1","overrides":{"draw1":"E"}}',
      '{"v":99,"overrides":{"draw1":"E"}}',
      '{"v":1,"overrides":["E"]}',
      '{"v":1}',
    ]) {
      expect(parseStoredOverrides(raw)).toEqual({});
    }
  });

  it("drops only the bad entries", () => {
    expect(
      parseStoredOverrides(
        '{"v":1,"overrides":{"draw1":"E","search":7,"shuffle":"Hyper+S","openDiscard":{},"addToken":""}}',
      ),
    ).toEqual({ draw1: "E" });
  });

  it("keeps ids this build does not know, and never takes the switch-seat key from here", () => {
    expect(
      parseStoredOverrides('{"v":1,"overrides":{"fromTheFuture":"J","switchSeat":"D"}}'),
    ).toEqual({ fromTheFuture: "J" });
    expect(resolveBindings({ fromTheFuture: "J" }).byCombo.get("J")).toBeUndefined();
  });
});

describe("serializeOverrides", () => {
  it("stores only what differs from the defaults, with a version", () => {
    expect(serializeOverrides({})).toBeNull();
    expect(serializeOverrides({ draw1: "D" })).toBeNull();
    expect(serializeOverrides({ newGame: null })).toBeNull();
    expect(JSON.parse(serializeOverrides({ draw1: "E", shuffle: null, search: "B" })!)).toEqual({
      v: 1,
      overrides: { draw1: "E", shuffle: null },
    });
  });
});

describe("resolveBindings", () => {
  const actions = (list: [string, string?][]): KeybindAction[] =>
    list.map(([id, defaultKey]) => ({ id, label: id, group: "Game", kind: "table", defaultKey }));

  it("applies overrides over defaults", () => {
    const { bindings, byCombo } = resolveBindings({ draw1: "E", shuffle: null });
    expect(bindings.draw1).toBe("E");
    expect(bindings.shuffle).toBeNull();
    expect(byCombo.get("E")).toBe("draw1");
    expect(byCombo.get("D")).toBeUndefined();
    expect(byCombo.get("Shift+S")).toBeUndefined();
  });

  it("a default shipped later never takes a key the player already uses", () => {
    // The player bound `old` to J; a later release adds `fresh` with default J.
    const { bindings, shadowed } = resolveBindings(
      { old: "J" },
      actions([["fresh", "J"], ["old", "K"]]),
    );
    expect(bindings).toEqual({ old: "J", fresh: null });
    expect(shadowed).toEqual({ fresh: "old" });
  });

  it("gives a combo to one action only, even from hand-edited data", () => {
    const { bindings, byCombo } = resolveBindings(
      { a: "X", b: "X" },
      actions([["a"], ["b"], ["c", "X"]]),
    );
    expect(bindings).toEqual({ a: "X", b: null, c: null });
    expect(byCombo.get("X")).toBe("a");
  });
});

describe("conflicts", () => {
  it("finds the action that holds a key", () => {
    expect(findConflict({}, "draw1", "B")?.id).toBe("search");
    expect(findConflict({}, "draw1", "D")).toBeUndefined(); // its own key
    expect(findConflict({}, "draw1", "J")).toBeUndefined();
    expect(findConflict({}, "draw1", "S")?.id).toBe("switchSeat");
    expect(findConflict({ search: "J" }, "draw1", "B")).toBeUndefined();
    expect(findConflict({ search: "J" }, "draw1", "J")?.id).toBe("search");
  });

  it("replacing moves the key and leaves the old holder without one", () => {
    const next = withReplacedBinding({}, "draw1", "B");
    expect(next).toEqual({ draw1: "B", search: null });
    const { bindings } = resolveBindings(next);
    expect(bindings.draw1).toBe("B");
    expect(bindings.search).toBeNull();
  });

  it("binding, clearing and resetting keep only real overrides", () => {
    expect(withBinding({}, "draw1", "E")).toEqual({ draw1: "E" });
    expect(withBinding({ draw1: "E" }, "draw1", "D")).toEqual({});
    expect(withoutBinding({}, "draw1")).toEqual({ draw1: null });
    expect(withoutBinding({ mill1: "M" }, "mill1")).toEqual({});
    expect(withDefault({ draw1: "E", search: null }, "draw1")).toEqual({ search: null });
  });
});

describe("persistence", () => {
  it("writes overrides only, and a fresh read gets them back", () => {
    writeOverrides(withBinding({}, "draw1", "E"));
    expect(stored()).toEqual({ v: 1, overrides: { draw1: "E" } });
    refreshKeybinds(); // as after a reload
    expect(getKeybindSnapshot().bindings.draw1).toBe("E");
    expect(getKeybindSnapshot().bindings.search).toBe("B");
  });

  it("resetting one action or all removes what was stored", () => {
    writeOverrides({ draw1: "E", shuffle: null });
    writeOverrides(withDefault(getKeybindSnapshot().overrides, "draw1"));
    expect(stored()).toEqual({ v: 1, overrides: { shuffle: null } });
    resetAllKeybinds();
    expect(localStorage.getItem(KEYBINDS_STORAGE)).toBeNull();
    expect(getKeybindSnapshot().bindings).toMatchObject({ draw1: "D", shuffle: "Shift+S" });
  });

  it("falls back to the defaults on corrupt storage, and the next write repairs it", () => {
    localStorage.setItem(KEYBINDS_STORAGE, "{{{");
    refreshKeybinds();
    expect(getKeybindSnapshot().bindings.draw1).toBe("D");
    writeOverrides(withBinding(getKeybindSnapshot().overrides, "draw1", "E"));
    expect(stored()).toEqual({ v: 1, overrides: { draw1: "E" } });
  });

  it("still works for this page when storage throws", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    writeOverrides({ draw1: "E" });
    expect(getKeybindSnapshot().bindings.draw1).toBe("E");
    setItem.mockRestore();
  });

  it("the switch-seat key lives in the hotseat entry, both ways", () => {
    expect(getKeybindSnapshot().bindings.switchSeat).toBe("S");
    // Set from the hotseat settings.
    localStorage.setItem(SEAT_KEY, "Shift+Tab");
    refreshKeybinds();
    expect(getKeybindSnapshot().bindings.switchSeat).toBe("Shift+Tab");
    localStorage.setItem(SEAT_KEY, "off");
    refreshKeybinds();
    expect(getKeybindSnapshot().bindings.switchSeat).toBeNull();
    // Set from the shortcuts dialog.
    writeOverrides(withBinding(getKeybindSnapshot().overrides, "switchSeat", "J"));
    expect(localStorage.getItem(SEAT_KEY)).toBe("J");
    expect(localStorage.getItem(KEYBINDS_STORAGE)).toBeNull();
    writeOverrides(withoutBinding(getKeybindSnapshot().overrides, "switchSeat"));
    expect(localStorage.getItem(SEAT_KEY)).toBe("off");
    resetAllKeybinds();
    expect(localStorage.getItem(SEAT_KEY)).toBeNull();
    expect(getKeybindSnapshot().bindings.switchSeat).toBe("S");
  });

  it("a switch-seat key set by hand wins the key from a default", () => {
    localStorage.setItem(SEAT_KEY, "D");
    refreshKeybinds();
    const { bindings, shadowed } = getKeybindSnapshot();
    expect(bindings.switchSeat).toBe("D");
    expect(bindings.draw1).toBeNull();
    expect(shadowed.draw1).toBe("switchSeat");
  });
});
