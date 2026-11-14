import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { DeckCommand } from "@/components/Game/CommandMenu/deckCommands";
import { PALETTE_TABLE_ACTIONS } from "./actions";

/**
 * What a shortcut runs.
 *
 * Registry commands (draw, shuffle, open discard…) are run through the ⌘K
 * palette's own command list: the palette hands it over with
 * {@link useKeybindCommands}, so a key press and a palette click execute the
 * same closure, with the same log line and toast.
 *
 * Table actions (flip the selected card, zoom, the activity log) belong to
 * whichever component can do them. It offers one with
 * {@link useKeybindHandler} while it is able to; pass a falsy handler when it
 * is not (nothing selected), and the key falls through untouched.
 */

type CommandSource = {
  commands: DeckCommand[];
  isRunnable: (cmd: DeckCommand) => boolean;
};

const handlers = new Map<string, () => void>();
const listeners = new Set<() => void>();
let version = 0;
let commandSource: { current: CommandSource } | undefined;

const bump = () => {
  version += 1;
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Offer a table action while `handler` is a function. */
export const useKeybindHandler = (
  id: string,
  handler: (() => void) | null | undefined | false,
) => {
  const latest = useRef(handler);
  latest.current = handler;
  const available = !!handler;
  useEffect(() => {
    if (!available) return;
    const run = () => {
      if (latest.current) latest.current();
    };
    handlers.set(id, run);
    bump();
    return () => {
      if (handlers.get(id) === run) {
        handlers.delete(id);
        bump();
      }
    };
  }, [id, available]);
};

/** The palette's live command list, for shortcuts to run from. */
export const useKeybindCommands = (
  commands: DeckCommand[],
  isRunnable: (cmd: DeckCommand) => boolean,
) => {
  const latest = useRef<CommandSource>({ commands, isRunnable });
  latest.current = { commands, isRunnable };
  useEffect(() => {
    commandSource = latest;
    return () => {
      if (commandSource === latest) commandSource = undefined;
    };
  }, []);
};

export type RunResult =
  /** It ran. */
  | "ran"
  /** A command that exists but cannot run right now (an empty deck). */
  | "unavailable"
  /** Nothing on this page offers it; the key is not ours to take. */
  | "missing";

/** Runs an action; with `dryRun`, only says what running it would do. */
export const runKeybindAction = (id: string, dryRun = false): RunResult => {
  const handler = handlers.get(id);
  if (handler) {
    if (!dryRun) handler();
    return "ran";
  }
  const source = commandSource?.current;
  const cmd = source?.commands.find((c) => c.id === id);
  if (!source || !cmd) return "missing";
  if (!source.isRunnable(cmd)) return "unavailable";
  if (!dryRun) cmd.run();
  return "ran";
};

/**
 * The table actions as palette commands, so everything with a shortcut can
 * also be found and run from ⌘K. One that nothing offers right now (flip,
 * with no card selected) is listed disabled.
 */
export const useTableCommands = (close: () => void): DeckCommand[] => {
  const v = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  const closeRef = useRef(close);
  closeRef.current = close;
  return useMemo(
    () =>
      PALETTE_TABLE_ACTIONS.map((action) => ({
        id: action.id,
        label: action.label,
        group: action.group,
        keywords: "shortcut key keyboard",
        enabled: () => handlers.has(action.id),
        run: () => {
          closeRef.current();
          handlers.get(action.id)?.();
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v],
  );
};

/** Test helper: forget every handler and the command list. */
export const resetKeybindHandlers = () => {
  handlers.clear();
  commandSource = undefined;
  bump();
};
