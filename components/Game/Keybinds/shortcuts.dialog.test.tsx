import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ReactNode } from "react";

import { KEYBIND_ACTIONS } from "@/lib/keybinds/actions";
import { KEYBINDS_STORAGE, refreshKeybinds } from "@/lib/keybinds/store";
import { ShortcutsDialog } from "./shortcuts.dialog";

// Chakra's modal focus trap trips jsdom's nwsapi; the trap isn't under test.
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const DRAW = "Draw 1 card";
const SEARCH = "Search deck (browse — reshuffles on close)";

// Every row is three Chakra buttons, slow to mount in jsdom: one test renders
// the full list, the rest a handful of rows (conflicts are still checked
// against every action, listed or not).
const FEW = ["draw1", "search", "shuffle", "newGame", "clearSelection", "showShortcuts", "switchSeat"];
const SOME_ACTIONS = KEYBIND_ACTIONS.filter((a) => FEW.includes(a.id));

const onClose = jest.fn();
const open = (actions = SOME_ACTIONS) =>
  render(
    <ChakraProvider>
      <ShortcutsDialog isOpen onClose={onClose} actions={actions} />
    </ChakraProvider>,
  );

const keyButton = (label: string) =>
  screen.getByRole("button", { name: `Change key for ${label}` });
const stored = () => JSON.parse(localStorage.getItem(KEYBINDS_STORAGE) ?? "null");

/** A key press wherever focus happens to be, as the browser delivers it. */
const press = (init: KeyboardEventInit) => {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
};

const record = (label: string, init: KeyboardEventInit) => {
  fireEvent.click(keyButton(label));
  expect(keyButton(label)).toHaveTextContent("Press a key…");
  return press(init);
};

beforeEach(() => {
  localStorage.clear();
  refreshKeybinds();
  onClose.mockClear();
});

describe("ShortcutsDialog", () => {
  it("lists every action with its current key", () => {
    open(KEYBIND_ACTIONS);
    for (const action of KEYBIND_ACTIONS) {
      expect(keyButton(action.label)).toBeInTheDocument();
    }
    expect(keyButton(DRAW)).toHaveTextContent("D");
    expect(keyButton("Shuffle deck")).toHaveTextContent("Shift+S");
    expect(keyButton("Clear the selection")).toHaveTextContent("Esc");
    expect(keyButton("Keyboard shortcuts")).toHaveTextContent("?");
    expect(keyButton("Switch seat (hotseat)")).toHaveTextContent("S");
    expect(keyButton("New game (clears the table for everyone)")).toHaveTextContent("No key");
    expect(screen.getByText("⌘K / Ctrl+K")).toBeInTheDocument();
    // Nothing to reset yet.
    expect(screen.getByRole("button", { name: "Reset all to defaults" })).toBeDisabled();
  });

  it("records a new key: click, press, saved as an override", () => {
    open();
    const seen = jest.fn();
    window.addEventListener("keydown", seen);
    const event = record(DRAW, { key: "e", code: "KeyE" });
    window.removeEventListener("keydown", seen);
    expect(keyButton(DRAW)).toHaveTextContent("E");
    expect(stored()).toEqual({ v: 1, overrides: { draw1: "E" } });
    // The press was the new key and nothing else: no shortcut, no button click.
    expect(event.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("waits through a lone modifier and records the combo", () => {
    open();
    fireEvent.click(keyButton(DRAW));
    press({ key: "Shift", code: "ShiftLeft", shiftKey: true });
    expect(keyButton(DRAW)).toHaveTextContent("Press a key…");
    press({ key: "E", code: "KeyE", shiftKey: true });
    expect(keyButton(DRAW)).toHaveTextContent("Shift+E");
  });

  it("Esc cancels recording without closing the dialog or changing the key", () => {
    open();
    record(DRAW, { key: "Escape", code: "Escape" });
    expect(keyButton(DRAW)).toHaveTextContent("D");
    expect(stored()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports a conflict and changes nothing until told to", () => {
    open();
    record(DRAW, { key: "b", code: "KeyB" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(`B is already used by “${SEARCH}”.`);
    expect(keyButton(DRAW)).toHaveTextContent("D");
    expect(stored()).toBeNull();

    fireEvent.click(within(alert).getByRole("button", { name: "Keep as is" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(stored()).toBeNull();
  });

  it("“Use it here instead” moves the key and leaves the other action without one", () => {
    open();
    record(DRAW, { key: "b", code: "KeyB" });
    fireEvent.click(screen.getByRole("button", { name: "Use it here instead" }));
    expect(keyButton(DRAW)).toHaveTextContent("B");
    expect(keyButton(SEARCH)).toHaveTextContent("No key");
    expect(stored()).toEqual({ v: 1, overrides: { draw1: "B", search: null } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the switch-seat key conflicts like any other and saves to its own entry", () => {
    open();
    record(DRAW, { key: "s", code: "KeyS" });
    expect(screen.getByRole("alert")).toHaveTextContent("S is already used by “Switch seat (hotseat)”.");
    fireEvent.click(screen.getByRole("button", { name: "Keep as is" }));

    record("Switch seat (hotseat)", { key: "j", code: "KeyJ" });
    expect(keyButton("Switch seat (hotseat)")).toHaveTextContent("J");
    expect(localStorage.getItem("unbrewed-hotseat-switch-key")).toBe("J");
    expect(stored()).toBeNull();
  });

  it("refuses browser and focus keys with a reason", () => {
    open();
    record(DRAW, { key: "w", code: "KeyW", ctrlKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Ctrl+W belongs to the browser.");
    record(DRAW, { key: "Tab", code: "Tab" });
    expect(screen.getByRole("alert")).toHaveTextContent("Tab moves focus");
    expect(keyButton(DRAW)).toHaveTextContent("D");
    expect(stored()).toBeNull();
  });

  it("removes a key, and resets one action to its default", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: `Remove key for ${DRAW}` }));
    expect(keyButton(DRAW)).toHaveTextContent("No key");
    expect(stored()).toEqual({ v: 1, overrides: { draw1: null } });

    fireEvent.click(screen.getByRole("button", { name: `Reset ${DRAW} to default` }));
    expect(keyButton(DRAW)).toHaveTextContent("D");
    expect(localStorage.getItem(KEYBINDS_STORAGE)).toBeNull();
  });

  it("resetting an action whose default was taken asks before taking it back", () => {
    open();
    record(DRAW, { key: "e", code: "KeyE" });
    record(SEARCH, { key: "d", code: "KeyD" }); // D is free now
    expect(keyButton(SEARCH)).toHaveTextContent("D");

    fireEvent.click(screen.getByRole("button", { name: `Reset ${DRAW} to default` }));
    expect(screen.getByRole("alert")).toHaveTextContent(`The default, D, is now used by “${SEARCH}”.`);
    expect(keyButton(DRAW)).toHaveTextContent("E");
    fireEvent.click(screen.getByRole("button", { name: "Use it here instead" }));
    expect(keyButton(DRAW)).toHaveTextContent("D");
    expect(keyButton(SEARCH)).toHaveTextContent("No key");
    expect(stored()).toEqual({ v: 1, overrides: { search: null } });
  });

  it("resets everything in two steps", () => {
    open();
    record(DRAW, { key: "e", code: "KeyE" });
    record("Switch seat (hotseat)", { key: "j", code: "KeyJ" });
    fireEvent.click(screen.getByRole("button", { name: "Reset all to defaults" }));
    // Nothing yet: it asks first.
    expect(keyButton(DRAW)).toHaveTextContent("E");
    fireEvent.click(screen.getByRole("button", { name: "Reset every key" }));
    expect(keyButton(DRAW)).toHaveTextContent("D");
    expect(keyButton("Switch seat (hotseat)")).toHaveTextContent("S");
    expect(localStorage.getItem(KEYBINDS_STORAGE)).toBeNull();
    expect(localStorage.getItem("unbrewed-hotseat-switch-key")).toBeNull();
    expect(screen.getByRole("button", { name: "Reset all to defaults" })).toBeDisabled();
  });

  it("shows stored overrides on open, and survives corrupt storage", () => {
    localStorage.setItem(KEYBINDS_STORAGE, '{"v":1,"overrides":{"draw1":"E","search":42}}');
    refreshKeybinds();
    const { unmount } = open();
    expect(keyButton(DRAW)).toHaveTextContent("E");
    expect(keyButton(SEARCH)).toHaveTextContent("B");
    unmount();

    localStorage.setItem(KEYBINDS_STORAGE, "not json at all");
    open();
    expect(keyButton(DRAW)).toHaveTextContent("D");
  });

  it("the key that opens it also closes it", () => {
    open();
    fireEvent.keyDown(keyButton(DRAW), { key: "?", code: "Slash", shiftKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
