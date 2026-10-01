/**
 * Adventure lobby setup (Wave 4.2, unbrewed-p2p#1094; roster wired in #1107).
 *
 * Pure state + wire helpers behind `components/Pro/AdventureLobby.tsx`. The table
 * size rides as `CREATE_ROOM.humans`; the scenario / villain / minion picks ride
 * as `CREATE_ROOM.scenarioId` / `.roster` (engine #664) and are validated against
 * the server's `LIST_SCENARIOS` listing. Difficulty knobs are deliberately absent.
 */
import type { EnemyListing, PlayerId, RoomScenarioStatus, RosterPicks, ScenarioListing } from "./protocol";

export const ADVENTURE_MIN_HUMANS = 1;
export const ADVENTURE_MAX_HUMANS = 4;

/** A pickable enemy. `null` in a pick slot means "random / scenario default". */
export interface AdventureEnemyOption {
  id: string;
  name: string;
  /** the listing behind it — HP / size / MOVE for the lobby rows (absent for non-enemy picks) */
  enemy?: EnemyListing;
}

const optionOf = (e: EnemyListing): AdventureEnemyOption => ({ id: e.id, name: e.name, enemy: e });

/** An enemy's HP at a table of `humans` heroes: `hp` is indexed by hero count, clamped to its last entry. null if the listing carries none. */
export const enemyHpAt = (enemy: Pick<EnemyListing, "hp">, humans: number): number | null => {
  if (enemy.hp.length === 0) return null;
  const i = Math.min(clampHumans(humans), enemy.hp.length) - 1;
  return enemy.hp[i] ?? null;
};

/** "LARGE · MOVE 2" — the size and MOVE half of an enemy row. */
export const enemySizeMove = (enemy: Pick<EnemyListing, "size" | "move">): string => `${enemy.size} · MOVE ${enemy.move}`;

export interface AdventureSetup {
  /** chosen scenario id, or null for the server's default (its first listing) */
  scenarioId: string | null;
  /** hero seats at the table, 1..4 — rides as `CREATE_ROOM.humans` */
  humans: number;
  /** chosen villain id, or null for random */
  villainId: string | null;
  /** one entry per minion slot (one per hero): chosen id or null for random */
  minionIds: Array<string | null>;
}

export const clampHumans = (n: number): number =>
  Math.min(ADVENTURE_MAX_HUMANS, Math.max(ADVENTURE_MIN_HUMANS, Math.round(Number.isFinite(n) ? n : ADVENTURE_MIN_HUMANS)));

/** Pickable minion slots: `perPlayer` per hero seat (the engine's `minionsPerPlayer`; 1 unless a scenario fixes its roster). */
export const minionSlotCount = (humans: number, perPlayer: number = 1): number => clampHumans(humans) * Math.max(0, perPlayer);

const fitMinions = (minionIds: Array<string | null>, humans: number, perPlayer: number = 1): Array<string | null> =>
  Array.from({ length: minionSlotCount(humans, perPlayer) }, (_, i) => minionIds[i] ?? null);

export const defaultAdventureSetup = (): AdventureSetup => ({
  scenarioId: null,
  humans: ADVENTURE_MIN_HUMANS,
  villainId: null,
  minionIds: fitMinions([], ADVENTURE_MIN_HUMANS),
});

export const setHumans = (setup: AdventureSetup, humans: number, perPlayer: number = 1): AdventureSetup => {
  const n = clampHumans(humans);
  return { ...setup, humans: n, minionIds: fitMinions(setup.minionIds, n, perPlayer) };
};

/** The listing a setup points at: the named scenario, else the server default (first), else none. */
export const scenarioFor = (setup: AdventureSetup, scenarios: readonly ScenarioListing[]): ScenarioListing | null =>
  scenarios.find((s) => s.id === setup.scenarioId) ?? scenarios[0] ?? null;

/** Choose a scenario; the picks belong to the old roster, so they reset. */
export const setScenario = (setup: AdventureSetup, scenario: ScenarioListing | null): AdventureSetup => ({
  ...setup,
  scenarioId: scenario?.id ?? null,
  villainId: null,
  minionIds: fitMinions([], setup.humans, scenario?.minionsPerPlayer ?? 1),
});

/** What the lobby may offer for a scenario (empty pools → Random only). */
export const rosterOptions = (
  scenario: ScenarioListing | null,
): { villains: AdventureEnemyOption[]; minions: AdventureEnemyOption[] } => ({
  villains: (scenario?.villains ?? []).map(optionOf),
  minions: (scenario?.minionPool ?? []).map(optionOf),
});

/**
 * The scenario-derived CREATE_ROOM fields, or the reason there is nothing to
 * create (#1113: never fall back to a board the format doesn't support). Picks
 * the scenario no longer offers are dropped rather than sent, and a fully
 * random roster sends no `roster` at all.
 */
export const adventureCreateFields = (
  setup: AdventureSetup,
  scenarios: readonly ScenarioListing[],
): { ok: true; scenarioId: string; roster?: RosterPicks } | { ok: false; reason: string } => {
  const scenario = scenarioFor(setup, scenarios);
  if (!scenario) return { ok: false, reason: NO_SCENARIO_REASON };
  const opts = rosterOptions(scenario);
  const villain = opts.villains.some((v) => v.id === setup.villainId) ? setup.villainId : null;
  const slots = minionSlotCount(setup.humans, scenario.minionsPerPlayer);
  const minions = Array.from({ length: slots }, (_, i) => {
    const m = setup.minionIds[i] ?? null;
    return m !== null && opts.minions.some((o) => o.id === m) ? m : null;
  });
  const roster: RosterPicks = {
    ...(villain ? { villain } : {}),
    ...(minions.some((m) => m !== null) ? { minions } : {}),
  };
  return { ok: true, scenarioId: scenario.id, ...(Object.keys(roster).length > 0 ? { roster } : {}) };
};

export const NO_SCENARIO_REASON = "This server has no Adventure scenario to play yet.";

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

export interface WaitingEnemyRow {
  role: "VILLAIN" | "MINION";
  /** resolved enemy id, null = still Random */
  id: string | null;
  name: string;
  /** listing data when the id is known to the client's scenario list */
  enemy: EnemyListing | null;
}

/**
 * The waiting room's roster from `ROOM_STATUS.scenario`: the villain, then each minion slot
 * (fixed minions first, as the server orders them). A null slot is still Random; an id the
 * listing doesn't know falls back to the raw id so nothing is hidden.
 */
export const waitingRoster = (status: RoomScenarioStatus, scenarios: readonly ScenarioListing[]): WaitingEnemyRow[] => {
  const listing = scenarios.find((s) => s.id === status.id) ?? null;
  const known = listing ? [...listing.villains, ...listing.fixedMinions, ...listing.minionPool] : [];
  const row = (role: WaitingEnemyRow["role"], id: string | null): WaitingEnemyRow => {
    const enemy = id === null ? null : (known.find((e) => e.id === id) ?? null);
    return { role, id, name: id === null ? "Random" : (enemy?.name ?? id), enemy };
  };
  return [row("VILLAIN", status.villain), ...status.minions.map((m) => row("MINION", m))];
};
