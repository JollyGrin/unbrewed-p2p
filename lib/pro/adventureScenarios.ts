/**
 * The Adventure lobby's link to the socket (unbrewed-p2p#1107). `useProSocket`
 * owns the one WebSocket, but the lobby panel and the CREATE_ROOM builder live
 * on opposite sides of it, so two facts cross through this tiny module store:
 * the server's `SCENARIOS` listing (socket -> lobby) and the lobby's current
 * setup (lobby -> CREATE_ROOM). Both are plain module state with a subscribe.
 */
import { useSyncExternalStore } from "react";
import { defaultAdventureSetup, type AdventureSetup } from "./adventureLobby";
import type { ScenarioListing } from "./protocol";

type Listener = () => void;
const listeners = new Set<Listener>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const NONE: readonly ScenarioListing[] = [];
let scenarios: readonly ScenarioListing[] = NONE;
let loaded = false;
let setup: AdventureSetup = defaultAdventureSetup();

/** Record a `SCENARIOS` reply (or `[]` for a server that answers BAD_MESSAGE). */
export const setScenarios = (next: readonly ScenarioListing[]): void => {
  scenarios = next.length === 0 ? NONE : next;
  loaded = true;
  notify();
};

export const getScenarios = (): readonly ScenarioListing[] => scenarios;
/** false until the first reply, so the lobby can tell "asking" from "none". */
export const scenariosLoaded = (): boolean => loaded;

export const publishAdventureSetup = (next: AdventureSetup): void => {
  setup = next;
};
export const currentAdventureSetup = (): AdventureSetup => setup;

export const useScenarios = (): { scenarios: readonly ScenarioListing[]; loaded: boolean } => {
  const list = useSyncExternalStore(subscribe, getScenarios, getScenarios);
  const done = useSyncExternalStore(subscribe, scenariosLoaded, scenariosLoaded);
  return { scenarios: list, loaded: done };
};

/** Test seam. */
export const resetAdventureScenarios = (): void => {
  scenarios = NONE;
  loaded = false;
  setup = defaultAdventureSetup();
  notify();
};
