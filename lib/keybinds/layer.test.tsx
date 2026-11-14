import "@testing-library/jest-dom";
import { act, render } from "@testing-library/react";
import { toast } from "react-hot-toast";

import { DeckCommand } from "@/components/Game/CommandMenu/deckCommands";
import { useKeybindCommands, useKeybindHandler } from "./handlers";
import { handleTableKey, useTableKeybinds } from "./layer";
import { refreshKeybinds, withBinding, writeOverrides } from "./store";

/**
 * The listener end to end: a real keydown on the page, through the guards
 * and the matcher, to the command or handler it is bound to.
 */

const ran: string[] = [];
let deckEmpty = false;
let selected = true;

const command = (id: string): DeckCommand => ({
  id,
  label: id,
  group: "Deck",
  enabled: () => !(deckEmpty && id === "draw1"),
  run: () => ran.push(id),
});
const COMMANDS = ["draw1", "search", "openDiscard", "shuffle", "addToken", "newGame"].map(command);

const Table = ({ hotseatActive = false }: { hotseatActive?: boolean }) => {
  useTableKeybinds({ hotseatActive });
  useKeybindCommands(COMMANDS, (cmd) => cmd.enabled({} as never));
  useKeybindHandler("flipSelected", selected && (() => ran.push("flipSelected")));
  useKeybindHandler("removeSelected", selected && (() => ran.push("removeSelected")));
  useKeybindHandler("clearSelection", selected && (() => ran.push("clearSelection")));
  useKeybindHandler("zoomIn", () => ran.push("zoomIn"));
  useKeybindHandler("showShortcuts", () => ran.push("showShortcuts"));
  return null;
};

/** Dispatches a keydown and returns the event, to check defaultPrevented. */
const press = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const mount = <T extends HTMLElement>(el: T): T => {
  document.body.appendChild(el);
  return el;
};

beforeEach(() => {
  localStorage.clear();
  refreshKeybinds();
  ran.length = 0;
  deckEmpty = false;
  selected = true;
  document.body.innerHTML = "";
});

describe("matching", () => {
  it("runs the bound command, in either case, and takes the press", () => {
    render(<Table />);
    expect(press({ key: "d", code: "KeyD" }).defaultPrevented).toBe(true);
    press({ key: "D", code: "KeyD" }); // caps lock
    expect(ran).toEqual(["draw1", "draw1"]);
  });

  it("runs every default it is given a target for", () => {
    render(<Table />);
    press({ key: "b", code: "KeyB" });
    press({ key: "g", code: "KeyG" });
    press({ key: "t", code: "KeyT" });
    press({ key: "f", code: "KeyF" });
    press({ key: "Delete", code: "Delete" });
    press({ key: "Backspace", code: "Backspace" });
    press({ key: "Escape", code: "Escape" });
    press({ key: "=", code: "Equal" });
    press({ key: "+", code: "Equal", shiftKey: true });
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(ran).toEqual([
      "search",
      "openDiscard",
      "addToken",
      "flipSelected",
      "removeSelected",
      "removeSelected",
      "clearSelection",
      "zoomIn",
      "zoomIn",
      "showShortcuts",
    ]);
  });

  it("shuffle needs Shift; plain S is left for hotseat's switch seat", () => {
    render(<Table />);
    expect(press({ key: "s", code: "KeyS" }).defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
    press({ key: "S", code: "KeyS", shiftKey: true });
    expect(ran).toEqual(["shuffle"]);
  });

  it("leaves browser and system combos alone", () => {
    render(<Table />);
    for (const mods of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(press({ key: "d", code: "KeyD", ...mods }).defaultPrevented).toBe(false);
    }
    expect(press({ key: "=", code: "Equal", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: "0", code: "Digit0", metaKey: true }).defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
  });

  it("follows the layout's letter, and the physical key on a non-Latin layout", () => {
    writeOverrides(withBinding({}, "newGame", "A"));
    render(<Table />);
    press({ key: "a", code: "KeyQ" }); // AZERTY: the key printed A
    press({ key: "q", code: "KeyA" }); // AZERTY: the key printed Q
    press({ key: "в", code: "KeyD" }); // Russian layout, the D key
    expect(ran).toEqual(["newGame", "draw1"]);
  });

  it("a rebind moves the key at once", () => {
    render(<Table />);
    act(() => writeOverrides(withBinding({}, "draw1", "E")));
    press({ key: "d", code: "KeyD" });
    press({ key: "e", code: "KeyE" });
    expect(ran).toEqual(["draw1"]);
  });

  it("leaves a key alone when nothing offers its action", () => {
    selected = false;
    render(<Table />);
    expect(press({ key: "f", code: "KeyF" }).defaultPrevented).toBe(false);
    expect(press({ key: "Escape", code: "Escape" }).defaultPrevented).toBe(false);
    expect(press({ key: "h", code: "KeyH" }).defaultPrevented).toBe(false); // no handler at all
    expect(ran).toEqual([]);
  });

  it("says so when a command cannot run right now", () => {
    const error = jest.spyOn(toast, "error").mockImplementation(() => "");
    deckEmpty = true;
    render(<Table />);
    expect(press({ key: "d", code: "KeyD" }).defaultPrevented).toBe(true);
    expect(ran).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Not available right now"), {
      id: "table-keybind-unavailable",
    });
    error.mockRestore();
  });

  it("does nothing once the table is gone", () => {
    const { unmount } = render(<Table />);
    unmount();
    expect(press({ key: "d", code: "KeyD" }).defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
  });
});

describe("guards", () => {
  it("never fires while typing", () => {
    render(<Table />);
    const input = mount(document.createElement("input"));
    const search = mount(document.createElement("input"));
    search.type = "search";
    const textarea = mount(document.createElement("textarea"));
    const select = mount(document.createElement("select"));
    const editable = mount(document.createElement("div"));
    editable.setAttribute("contenteditable", "true");
    const inside = editable.appendChild(document.createElement("span"));
    const textbox = mount(document.createElement("div"));
    textbox.setAttribute("role", "textbox");
    for (const el of [input, search, textarea, select, editable, textbox]) {
      expect(press({ key: "d", code: "KeyD" }, el).defaultPrevented).toBe(false);
      expect(press({ key: "Backspace", code: "Backspace" }, el).defaultPrevented).toBe(false);
      expect(press({ key: "?", code: "Slash", shiftKey: true }, el).defaultPrevented).toBe(false);
    }
    press({ key: "d", code: "KeyD" }, inside); // a child of the editable region
    expect(ran).toEqual([]);
  });

  it("still fires from a checkbox, a button or the page itself", () => {
    render(<Table />);
    const checkbox = mount(document.createElement("input"));
    checkbox.type = "checkbox";
    const button = mount(document.createElement("button"));
    press({ key: "d", code: "KeyD" }, checkbox);
    press({ key: "d", code: "KeyD" }, button);
    press({ key: "d", code: "KeyD" }, window);
    expect(ran).toEqual(["draw1", "draw1", "draw1"]);
  });

  it("never fires while a modal dialog is open", () => {
    render(<Table />);
    const dialog = mount(document.createElement("section"));
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    expect(press({ key: "d", code: "KeyD" }).defaultPrevented).toBe(false);
    expect(press({ key: "Escape", code: "Escape" }).defaultPrevented).toBe(false);
    dialog.setAttribute("role", "alertdialog");
    dialog.removeAttribute("aria-modal");
    press({ key: "d", code: "KeyD" });
    expect(ran).toEqual([]);
    dialog.remove();
    press({ key: "d", code: "KeyD" });
    expect(ran).toEqual(["draw1"]);
  });

  it("never fires from inside a menu, a listbox or a popover", () => {
    render(<Table />);
    for (const role of ["menu", "listbox", "dialog"]) {
      const owner = mount(document.createElement("div"));
      owner.setAttribute("role", role);
      const item = owner.appendChild(document.createElement("button"));
      press({ key: "d", code: "KeyD" }, item);
    }
    expect(ran).toEqual([]);
    // A popover that is open but not focused does not block the table.
    press({ key: "d", code: "KeyD" });
    expect(ran).toEqual(["draw1"]);
  });

  it("a focused slider keeps its arrows and gives up the letters", () => {
    writeOverrides(withBinding({}, "newGame", "ArrowUp"));
    render(<Table />);
    const thumb = mount(document.createElement("div"));
    thumb.setAttribute("role", "slider");
    expect(press({ key: "ArrowUp", code: "ArrowUp" }, thumb).defaultPrevented).toBe(false);
    press({ key: "f", code: "KeyF" }, thumb);
    expect(ran).toEqual(["flipSelected"]);
    press({ key: "ArrowUp", code: "ArrowUp" });
    expect(ran).toEqual(["flipSelected", "newGame"]);
  });

  it("acts once on a held key, except for zoom", () => {
    render(<Table />);
    press({ key: "d", code: "KeyD" });
    // The repeats are swallowed, not run.
    expect(press({ key: "d", code: "KeyD", repeat: true }).defaultPrevented).toBe(true);
    press({ key: "Delete", code: "Delete", repeat: true });
    press({ key: "S", code: "KeyS", shiftKey: true, repeat: true });
    expect(ran).toEqual(["draw1"]);
    press({ key: "=", code: "Equal", repeat: true });
    expect(ran).toEqual(["draw1", "zoomIn"]);
  });

  it("ignores IME composition and presses something else already handled", () => {
    render(<Table />);
    press({ key: "d", code: "KeyD", isComposing: true });
    press({ key: "Process", code: "KeyD" });
    press({ key: "Dead", code: "KeyD" });
    const handled = new KeyboardEvent("keydown", { key: "d", code: "KeyD", bubbles: true, cancelable: true });
    handled.preventDefault();
    expect(handleTableKey(handled)).toBe(false);
    expect(ran).toEqual([]);
  });
});

describe("hotseat's switch-seat key", () => {
  it("is never run from here, whatever it is bound to", () => {
    localStorage.setItem("unbrewed-hotseat-switch-key", "D");
    refreshKeybinds();
    render(<Table hotseatActive />);
    // D is now switch seat (its own listener takes it); draw lost its key.
    expect(press({ key: "d", code: "KeyD" }).defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
  });

  it("gets any press its own matcher would take, even one bound here", () => {
    // Its matcher also goes by physical key: on Dvorak, the key at QWERTY's S
    // types "o". With O bound here, that press must still only switch seat.
    writeOverrides(withBinding({}, "newGame", "O"));
    const { unmount } = render(<Table hotseatActive />);
    expect(press({ key: "o", code: "KeyS" }).defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
    unmount();
    // Without an opponent seated nothing listens for switch seat, so O is free.
    render(<Table />);
    press({ key: "o", code: "KeyS" });
    expect(ran).toEqual(["newGame"]);
  });
});
