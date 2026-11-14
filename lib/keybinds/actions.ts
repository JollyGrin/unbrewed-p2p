import {
  CommandGroup,
  buildDeckCommands,
} from "@/components/Game/CommandMenu/deckCommands";
import { DEFAULT_SWITCH_SEAT_KEY } from "@/lib/hotseat/switchSeatKey";

/**
 * Everything on the sandbox table that can have a keyboard shortcut.
 *
 * Three kinds:
 * - `command`: an entry of the table's command registry (deckCommands.ts).
 *   The list is read from the registry itself, so a new command is bindable
 *   the day it is added and its label never forks. The shortcut runs the very
 *   command the ⌘K palette runs.
 * - `table`: something a component on the table does (flip the selected
 *   card, zoom, the activity log). The component offers it with
 *   `useKeybindHandler`; the palette lists it too.
 * - `external`: the hotseat switch-seat key. It keeps its own storage entry
 *   and listener (lib/hotseat/switchSeatKey.ts); here it is listed, rebound
 *   and checked for conflicts like the others.
 */
export type KeybindAction = {
  id: string;
  label: string;
  group: CommandGroup;
  kind: "command" | "table" | "external";
  /** Canonical combo (lib/keybinds/combo.ts); absent means no default key. */
  defaultKey?: string;
  /** Holding the key repeats the action. Off for all but zooming. */
  repeatable?: boolean;
  /** Table actions the ⌘K palette lists. */
  palette?: boolean;
  /** One line under the label in the shortcuts dialog. */
  note?: string;
};

/**
 * Default keys for registry commands, by command id. Anything not listed
 * ships unbound and can be given a key in the dialog.
 *
 * Letters only, none of A Q W Z Y M (they move between QWERTY, AZERTY and
 * QWERTZ), no S (hotseat's switch seat). Shuffle is public and cannot be
 * undone, so it sits behind Shift. Mill, random discard, the shuffle-discard
 * family, change deck and new game ship with no key at all.
 */
const COMMAND_DEFAULTS: Record<string, string> = {
  draw1: "D",
  search: "B",
  openDiscard: "G",
  shuffle: "Shift+S",
  addToken: "T",
};

const TABLE_ACTIONS: KeybindAction[] = [
  {
    id: "openDice",
    label: "Roll dice…",
    group: "Dice",
    kind: "table",
    defaultKey: "R",
    palette: true,
    note: "Opens the dice dialog. Nothing is rolled until you confirm.",
  },
  {
    id: "flipSelected",
    label: "Flip the selected card or piece",
    group: "Board",
    kind: "table",
    defaultKey: "F",
    palette: true,
  },
  {
    id: "handSelected",
    label: "Return the selected card to hand",
    group: "Board",
    kind: "table",
    defaultKey: "H",
    palette: true,
  },
  {
    id: "removeSelected",
    label: "Discard the selected card / delete the selected piece",
    group: "Board",
    kind: "table",
    defaultKey: "Delete",
    palette: true,
    note: "Delete or Backspace. Needs a selection, and holding the key does nothing.",
  },
  {
    id: "clearSelection",
    label: "Clear the selection",
    group: "Board",
    kind: "table",
    defaultKey: "Escape",
  },
  {
    id: "zoomIn",
    label: "Zoom in",
    group: "Board",
    kind: "table",
    defaultKey: "+",
    repeatable: true,
    palette: true,
    note: "The + / = key.",
  },
  {
    id: "zoomOut",
    label: "Zoom out",
    group: "Board",
    kind: "table",
    defaultKey: "-",
    repeatable: true,
    palette: true,
  },
  {
    id: "fitBoard",
    label: "Recentre the board (fit to screen)",
    group: "Board",
    kind: "table",
    defaultKey: "0",
    palette: true,
  },
  {
    id: "toggleLog",
    label: "Show / hide the activity log",
    group: "Game",
    kind: "table",
    defaultKey: "L",
    palette: true,
  },
  {
    id: "showShortcuts",
    label: "Keyboard shortcuts",
    group: "Game",
    kind: "table",
    defaultKey: "?",
    palette: true,
  },
];

export const SWITCH_SEAT_ACTION = "switchSeat";

const EXTERNAL_ACTIONS: KeybindAction[] = [
  {
    id: SWITCH_SEAT_ACTION,
    label: "Switch seat (hotseat)",
    group: "Game",
    kind: "external",
    defaultKey: DEFAULT_SWITCH_SEAT_KEY,
    note: "Only with an opponent seated on the solo table.",
  },
];

const noop = () => {};
const noopFactory = () => noop;

/** Every registry command, built with inert primitives just to read it. */
const commandActions = (): KeybindAction[] =>
  buildDeckCommands({
    act: noopFactory,
    roll: noopFactory,
    openScry: noop,
    openModal: noop,
    openTokenLibrary: noop,
    boostFromDeck: noop,
    newGame: noop,
    changeDeck: noop,
  }).map((cmd) => ({
    id: cmd.id,
    label: cmd.label,
    group: cmd.group,
    kind: "command" as const,
    defaultKey: COMMAND_DEFAULTS[cmd.id],
  }));

/** The dialog's section order. */
export const KEYBIND_GROUPS: CommandGroup[] = [
  "Deck",
  "Hand",
  "Discard",
  "Dice",
  "Board",
  "Game",
];

const buildActions = (): KeybindAction[] => {
  const all = [...commandActions(), ...TABLE_ACTIONS, ...EXTERNAL_ACTIONS];
  return KEYBIND_GROUPS.flatMap((group) => {
    const inGroup = all.filter((a) => a.group === group);
    // Actions with a default key lead their section.
    return [
      ...inGroup.filter((a) => a.defaultKey),
      ...inGroup.filter((a) => !a.defaultKey),
    ];
  });
};

export const KEYBIND_ACTIONS: KeybindAction[] = buildActions();

export const KEYBIND_ACTION_BY_ID: Record<string, KeybindAction> =
  Object.fromEntries(KEYBIND_ACTIONS.map((a) => [a.id, a]));

/** Table actions the palette lists, in palette order. */
export const PALETTE_TABLE_ACTIONS: KeybindAction[] = TABLE_ACTIONS.filter(
  (a) => a.palette,
);

/** The palette key itself. Fixed: it is listed in the dialog, not rebindable. */
export const PALETTE_KEY_LABEL = "⌘K / Ctrl+K";
