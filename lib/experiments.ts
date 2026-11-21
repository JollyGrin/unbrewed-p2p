/**
 * Client-side A/B experiments (issue #1611). Not `lib/flags.ts`: that is the
 * opt-in beta-features menu.
 *
 * The variant is drawn in this browser (`crypto.getRandomValues`, never a hash
 * of the PostHog id, which changes at login and at `reset()`), kept in one
 * localStorage key, and reported once as `experiment_exposed` where the player
 * actually gets it. PostHog feature flags stay off (`advanced_disable_flags`).
 *
 * ── Adding an experiment ───────────────────────────────────────────────────
 *   1. Add an entry to EXPERIMENTS (variants with the control first, audience).
 *   2. Where the variant takes effect: `const { variant, expose } =
 *      useExperiment("key")` (or `exposeExperiment("key")` in a handler). Treat
 *      `null` as the control; call `expose` when the player gets the variant.
 * ── Ending one ─────────────────────────────────────────────────────────────
 *   `live: false` + deploy turns it off (everyone gets the default, nothing is
 *   sent). To finish: make the winner the default, delete the entry and call.
 *
 * QA: `?exp=<key>:<variant>` (comma-separated for several) forces a variant,
 * also in dev builds and with analytics off. It is not stored and never sends
 * an exposure. `exp` is not a kept URL param, so it does not reach PostHog.
 */
import { useCallback, useEffect, useState } from "react";
import { analyticsAvailable, getConsent, track } from "@/lib/analytics";
import { listRecentHeroes, listRecentRooms } from "@/lib/pro/recentRooms";
import { getAccountStatus } from "@/lib/account/useAccount";

/** Who may be drawn into an experiment. Checked once, at the first resolution. */
const AUDIENCES = {
  everyone: () => true,
  /** Never played Pro in this browser and not signed in. */
  new_pro_player: () =>
    listRecentHeroes().length === 0 && listRecentRooms().length === 0 && getAccountStatus() !== "signed-in",
};

export type ExperimentDef = {
  /** First = control. */
  variants: readonly [string, string, ...string[]];
  /** Relative weights, one per variant. Default: equal. */
  weights?: readonly number[];
  audience: keyof typeof AUDIENCES;
  /** false = everyone gets the default and nothing is sent. */
  live: boolean;
};

export const EXPERIMENTS = {
  /** Landing "Play a bot" links: Medium (control) or Hard preset for a first Pro game. */
  first_bot_tier: { variants: ["medium", "hard"], audience: "new_pro_player", live: true },
} as const satisfies Record<string, ExperimentDef>;

export type ExperimentKey = keyof typeof EXPERIMENTS;
export type VariantOf<K extends ExperimentKey> = (typeof EXPERIMENTS)[K]["variants"][number];

const STORAGE_KEY = "unbrewed-exp";
type Entry = { v: string | null; at: string; exposed?: true };
type Store = Record<string, Entry>;

let registry: Record<string, ExperimentDef> = EXPERIMENTS;

/** Test-only: swap the registry (pass nothing to restore the real one). */
export const __setExperimentsForTests = (defs?: Record<string, ExperimentDef>): void => {
  registry = defs ?? EXPERIMENTS;
};

/** The whole store; null when storage is blocked or holds something unparsable. */
const readStore = (): Store | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Store) : null;
  } catch {
    return null;
  }
};

const writeStore = (store: Store): boolean => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
};

/** Draw one variant by weight. Exported for the split test. */
export const drawVariant = (def: ExperimentDef): string => {
  const { variants } = def;
  const w =
    def.weights && def.weights.length === variants.length && def.weights.every((x) => x >= 0)
      ? def.weights
      : variants.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return variants[0];
  const r = (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * total;
  let acc = 0;
  for (let i = 0; i < variants.length; i++) {
    acc += w[i];
    if (r < acc) return variants[i];
  }
  return variants[variants.length - 1];
};

/** The `?exp=` QA override for this key, if the URL names a known variant. */
const overrideFor = (key: string): string | null => {
  const def = registry[key];
  if (!def || typeof window === "undefined") return null;
  let found: string | null = null;
  try {
    for (const value of new URLSearchParams(window.location.search).getAll("exp"))
      for (const pair of value.split(",")) {
        const [k, v] = pair.trim().split(":");
        if (k === key && v !== undefined && def.variants.includes(v)) found = v;
      }
  } catch {
    return null;
  }
  return found;
};

/** The stored variant (null = not in it), drawing and storing it on first call. Assumes a live, consented browser. */
const resolveStored = (key: string): string | null => {
  const def = registry[key];
  if (!def || !def.live || !analyticsAvailable() || getConsent() !== "seen") return null;
  const store = readStore();
  if (!store) return null;
  const entry = store[key];
  if (entry && typeof entry === "object") {
    return typeof entry.v === "string" && def.variants.includes(entry.v) ? entry.v : null;
  }
  const v = AUDIENCES[def.audience]() ? drawVariant(def) : null;
  if (!writeStore({ ...store, [key]: { v, at: new Date().toISOString() } })) return null;
  return v;
};

/**
 * The variant for this browser, drawing it on first call. null = not in the
 * experiment: use your default. Client only, synchronous; never call in render.
 */
export function resolveExperiment<K extends ExperimentKey>(key: K): VariantOf<K> | null {
  if (typeof window === "undefined") return null;
  return (overrideFor(key) ?? resolveStored(key)) as VariantOf<K> | null;
}

/**
 * resolveExperiment + the `experiment_exposed` event, sent once per browser.
 * Call where the variant takes effect. Nothing is sent for null or an override.
 */
export function exposeExperiment<K extends ExperimentKey>(key: K): VariantOf<K> | null {
  if (typeof window === "undefined") return null;
  const forced = overrideFor(key);
  if (forced) return forced as VariantOf<K>;
  const v = resolveStored(key);
  if (v === null) return null;
  const store = readStore();
  const entry = store?.[key];
  if (store && entry && !entry.exposed) {
    const sent = track("experiment_exposed", { experiment: key, variant: v, [`$feature/${key}`]: v });
    if (sent) writeStore({ ...store, [key]: { ...entry, exposed: true } });
  }
  return v as VariantOf<K>;
}

/**
 * For render: null on the first render (static export, no hydration
 * mismatch), then the variant. `expose()` sends the exposure as above.
 */
export function useExperiment<K extends ExperimentKey>(key: K): { variant: VariantOf<K> | null; expose: () => void } {
  const [variant, setVariant] = useState<VariantOf<K> | null>(null);
  useEffect(() => {
    setVariant(resolveExperiment(key));
  }, [key]);
  const expose = useCallback(() => {
    exposeExperiment(key);
  }, [key]);
  return { variant, expose };
}
