/**
 * Create-form state → `POST /tournaments` body (#1216). Presets are a client
 * concern: the api takes full settings, so a preset is only a starting form.
 *
 * Matchup groups map to the stored rule (see ./matchup):
 *  - players choose            → `{mode:'free'}`
 *  - same map, whole event     → `{mode:'map', map}`
 *  - same map, per round       → `{mode:'free'}` + `roundMaps` (the api lays a
 *                                 round's map over the event rule)
 *  - organizer sets each match → `{mode:'free'}` + `settings.matchupSetBy:
 *                                 'organizer'`; heroes/map are then set per match
 *                                 through the per-match override.
 */
import { FREE_RULE } from "./matchup";
import type { CreateTournamentBody, MapRef, MatchupRule } from "./types";

export type MatchupChoice = "free" | "map" | "organizer";
export type MapScope = "event" | "round";
export type PresetId = "weekend" | "league" | "custom";

export const SIZES = [4, 8, 16] as const;
export const WINDOWS: { hours: number; label: string }[] = [
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "48 hours" },
  { hours: 72, label: "72 hours" },
  { hours: 168, label: "1 week" },
];

export interface CreateFormState {
  name: string;
  format: "single_elim" | "round_robin";
  size: number;
  matchWindowHours: number;
  /** `datetime-local` value, in the viewer's zone. */
  signupCloses: string;
  matchup: MatchupChoice;
  mapScope: MapScope;
  /** Whole-event map. */
  map: MapRef | null;
  /** Per-round maps, keyed by round number (1-based). */
  roundMaps: Record<string, MapRef>;
  /** Informational: the deck pool entrants draw from (not sent as a rule). */
  deckPool: "balanced";
}

export interface Preset {
  id: PresetId;
  title: string;
  blurb: string;
  bullets: string[];
  /** Round robin isn't creatable yet (unbrewed-api#65). */
  disabled?: string;
  patch: Partial<CreateFormState>;
}

export const PRESETS: Preset[] = [
  {
    id: "weekend",
    title: "Weekend bracket",
    blurb: "Casual, quick, fills fast.",
    bullets: [
      "8 players · single elimination",
      "First to 1 · 48h per match",
      "Players choose heroes",
    ],
    patch: {
      format: "single_elim",
      size: 8,
      matchWindowHours: 48,
      matchup: "free",
    },
  },
  {
    id: "league",
    title: "League night",
    blurb: "Everyone plays everyone.",
    bullets: [
      "4–6 players · round robin",
      "First to 1 · 1 week per round",
      "Same map for everyone",
    ],
    disabled: "Round robin is coming soon",
    patch: {
      format: "round_robin",
      size: 4,
      matchWindowHours: 168,
      matchup: "map",
      mapScope: "event",
    },
  },
  {
    id: "custom",
    title: "Custom",
    blurb: "Every setting, your way.",
    bullets: ["Format, seats, windows", "Matchups", "Share and post"],
    patch: {},
  },
];

/** `YYYY-MM-DDTHH:mm` for a `datetime-local` input, `days` from `from`. */
export const defaultSignupCloses = (from: Date = new Date(), days = 5): string => {
  const d = new Date(from.getTime() + days * 86_400_000);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const initialForm = (from?: Date): CreateFormState => ({
  name: "",
  format: "single_elim",
  size: 8,
  matchWindowHours: 48,
  signupCloses: defaultSignupCloses(from),
  matchup: "free",
  mapScope: "event",
  map: null,
  roundMaps: {},
  deckPool: "balanced",
});

export const roundCount = (size: number): number =>
  Math.max(1, Math.round(Math.log2(size)));

export const roundName = (round: number, rounds: number): string => {
  if (round === rounds) return "Final";
  if (round === rounds - 1) return "Semifinals";
  if (round === rounds - 2) return "Quarterfinals";
  return `Round ${round}`;
};

export interface FormProblem {
  field: "name" | "format" | "signupCloses" | "map";
  message: string;
}

export const validateForm = (
  f: CreateFormState,
  now: Date = new Date(),
): FormProblem[] => {
  const out: FormProblem[] = [];
  if (f.name.trim().length === 0)
    out.push({ field: "name", message: "Give it a name." });
  if (f.format !== "single_elim")
    out.push({ field: "format", message: "Round robin is coming soon." });
  const closes = new Date(f.signupCloses);
  if (!f.signupCloses || Number.isNaN(closes.getTime()) || closes <= now)
    out.push({ field: "signupCloses", message: "Pick a time in the future." });
  if (f.matchup === "map") {
    if (f.mapScope === "event" && !f.map)
      out.push({ field: "map", message: "Pick a map." });
    if (f.mapScope === "round") {
      const rounds = roundCount(f.size);
      for (let r = 1; r <= rounds; r++)
        if (!f.roundMaps[String(r)])
          out.push({ field: "map", message: "Pick a map for every round." });
    }
  }
  return out.filter((p, i) => out.findIndex((q) => q.message === p.message) === i);
};

/** The event-level rule (plus roundMaps/settings) for the chosen matchup. */
export const matchupToWire = (
  f: CreateFormState,
): {
  matchupRule: MatchupRule;
  roundMaps?: Record<string, MapRef>;
  settings?: Record<string, unknown>;
} => {
  if (f.matchup === "organizer")
    return {
      matchupRule: FREE_RULE,
      settings: { matchupSetBy: "organizer" },
    };
  if (f.matchup === "map" && f.mapScope === "event" && f.map)
    return { matchupRule: { mode: "map", map: f.map } };
  if (f.matchup === "map" && f.mapScope === "round") {
    const rounds = roundCount(f.size);
    const roundMaps: Record<string, MapRef> = {};
    for (let r = 1; r <= rounds; r++) {
      const m = f.roundMaps[String(r)];
      if (m) roundMaps[String(r)] = m;
    }
    return { matchupRule: FREE_RULE, roundMaps };
  }
  return { matchupRule: FREE_RULE };
};

/** The create body. `signup` opens straight away; `draft` saves it. */
export const toCreateBody = (
  f: CreateFormState,
  status: "draft" | "signup" = "signup",
): CreateTournamentBody => ({
  name: f.name.trim(),
  format: "single_elim",
  size: f.size,
  matchWindowHours: f.matchWindowHours,
  signupClosesAt: new Date(f.signupCloses).toISOString(),
  status,
  ...matchupToWire(f),
});

/** Latest the final can land: each round may use its full window plus a 24h decide grace. */
export const latestFinal = (f: CreateFormState): Date | null => {
  const closes = new Date(f.signupCloses);
  if (Number.isNaN(closes.getTime())) return null;
  return new Date(
    closes.getTime() + roundCount(f.size) * (f.matchWindowHours + 24) * 3_600_000,
  );
};

export const matchupSummary = (f: CreateFormState): string =>
  f.matchup === "free"
    ? "Players choose heroes"
    : f.matchup === "organizer"
      ? "You set each matchup"
      : f.mapScope === "round"
        ? "A map per round"
        : "Same map for everyone";
