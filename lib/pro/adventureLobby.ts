/**
 * Adventure lobby setup (Wave 4.2, unbrewed-p2p#1094).
 *
 * Pure state + wire helpers behind `components/Pro/AdventureLobby.tsx`. The table
 * size is the only pick the engine takes today (`CREATE_ROOM.humans`, protocol
 * note 2026-09-15); the villain / minion picks are LOBBY state that has no wire
 * field yet — the bound scenario fixes them server-side until the engine
 * publishes a roster. Difficulty knobs are deliberately absent in v1.
 */
import type { PlayerId } from "./protocol";

export const ADVENTURE_MIN_HUMANS = 1;
export const ADVENTURE_MAX_HUMANS = 4;

/** A pickable enemy. `null` in a pick slot means "random / scenario default". */
export interface AdventureEnemyOption {
  id: string;
  name: string;
}

/**
 * The enemy roster the lobby offers. Client-side and provisional: the engine has
 * no roster message yet (Isla Nublar is the one scenario, villain Indominus Rex,
 * minions bound by the scenario), so the minion pool is empty and every minion
 * slot reads "Random". When the engine exposes a roster this becomes server data.
 */
export const ADVENTURE_ROSTER: { villains: AdventureEnemyOption[]; minions: AdventureEnemyOption[] } = {
  villains: [{ id: "indominus-rex", name: "Indominus Rex" }],
  minions: [],
};

export interface AdventureSetup {
  /** hero seats at the table, 1..4 — rides as `CREATE_ROOM.humans` */
  humans: number;
  /** chosen villain id, or null for random */
  villainId: string | null;
  /** one entry per minion slot (one per hero): chosen id or null for random */
  minionIds: Array<string | null>;
}

export const clampHumans = (n: number): number =>
  Math.min(ADVENTURE_MAX_HUMANS, Math.max(ADVENTURE_MIN_HUMANS, Math.round(Number.isFinite(n) ? n : ADVENTURE_MIN_HUMANS)));

/** Minions scale with the table: one per hero (the v1 scenario's player-count minions). */
export const minionSlotCount = (humans: number): number => clampHumans(humans);

const fitMinions = (minionIds: Array<string | null>, humans: number): Array<string | null> =>
  Array.from({ length: minionSlotCount(humans) }, (_, i) => minionIds[i] ?? null);

export const defaultAdventureSetup = (): AdventureSetup => ({
  humans: ADVENTURE_MIN_HUMANS,
  villainId: null,
  minionIds: fitMinions([], ADVENTURE_MIN_HUMANS),
});

export const setHumans = (setup: AdventureSetup, humans: number): AdventureSetup => {
  const n = clampHumans(humans);
  return { ...setup, humans: n, minionIds: fitMinions(setup.minionIds, n) };
};

export const setVillain = (setup: AdventureSetup, villainId: string | null): AdventureSetup => ({ ...setup, villainId });

/** Pick a minion for a slot. R5: no duplicate minions — a minion already held by
 *  another slot is refused (returns the setup unchanged). */
export const setMinion = (setup: AdventureSetup, slot: number, minionId: string | null): AdventureSetup => {
  if (slot < 0 || slot >= setup.minionIds.length) return setup;
  if (minionId !== null && setup.minionIds.some((m, i) => i !== slot && m === minionId)) return setup;
  return { ...setup, minionIds: setup.minionIds.map((m, i) => (i === slot ? minionId : m)) };
};

/** The seats the creator can pre-fill with a bot at a table of `humans` heroes (p1 is theirs). */
export const adventureSeats = (humans: number): PlayerId[] =>
  (["p2", "p3", "p4"] as PlayerId[]).slice(0, Math.max(0, clampHumans(humans) - 1));
