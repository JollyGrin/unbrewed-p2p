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
import { ruleWithMapHash } from "./mapHash";
import type { CreateTournamentBody, MapRef, MatchupRule } from "./types";

export type MatchupChoice = "free" | "map" | "organizer";
export type MapScope = "event" | "round";
export type PresetId = "weekend" | "league" | "custom";

export const SIZES = [4, 8, 16] as const;
/** Round robin takes 4–6 players (unbrewed-api#65). */
export const RR_SIZES = [4, 5, 6] as const;
export const sizesFor = (format: CreateFormState["format"]): readonly number[] =>
  format === "round_robin" ? RR_SIZES : SIZES;
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
  /** Round robin only: the top two of the standings play a one-game final. */
  top2Final: boolean;
  /** Informational: the deck pool entrants draw from (not sent as a rule). */
  deckPool: "balanced";
}

export interface Preset {
  id: PresetId;
  title: string;
  blurb: string;
  bullets: string[];
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
      "First to 1 · 1 week per match",
      "Same map for everyone",
    ],
    patch: {
      format: "round_robin",
      size: 6,
      matchWindowHours: 168,
      matchup: "map",
      mapScope: "event",
      top2Final: true,
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
  top2Final: false,
  deckPool: "balanced",
});

/** Switching format keeps the form valid: a size the format takes, no stale per-round maps. */
export const withFormat = (f: CreateFormState, format: CreateFormState["format"]): CreateFormState => ({
  ...f,
  format,
  size: sizesFor(format).includes(f.size) ? f.size : format === "round_robin" ? 6 : 8,
  roundMaps: {},
  top2Final: format === "round_robin" ? f.top2Final : false,
});

/** Group rounds a round robin of `players` plays (n − 1, or n when odd). */
export const rrRounds = (players: number): number => (players % 2 === 0 ? players - 1 : players);

/** The map slots a per-round map picker needs: bracket rounds, or round-robin rounds (+ the final). */
export const mapSlots = (f: Pick<CreateFormState, "format" | "size" | "top2Final">): { key: string; label: string }[] => {
  if (f.format === "round_robin") {
    const slots = Array.from({ length: rrRounds(f.size) }, (_, i) => ({ key: String(i + 1), label: `Round ${i + 1}` }));
    return f.top2Final ? [...slots, { key: "final", label: "Final" }] : slots;
  }
  const rounds = roundCount(f.size);
  return Array.from({ length: rounds }, (_, i) => ({ key: String(i + 1), label: roundName(i + 1, rounds) }));
};

type SlotShape = Pick<CreateFormState, "format" | "size" | "top2Final">;

/**
 * Carry per-round maps across a size / top-2 change: re-key the rounds, drop
 * "final" when top 2 is off, and keep the map of the round with the same name
 * (so a bracket's Final stays the Final when it grows or shrinks). Rounds that
 * did not exist before are left empty for the organizer to pick.
 */
export const rekeyRoundMaps = (
  maps: Record<string, MapRef>,
  from: SlotShape,
  to: SlotShape,
): Record<string, MapRef> => {
  const byName = new Map(mapSlots(from).map((s) => [s.label, maps[s.key]]));
  const out: Record<string, MapRef> = {};
  for (const slot of mapSlots(to)) {
    const m = from.format === "round_robin" ? maps[slot.key] : byName.get(slot.label);
    if (m) out[slot.key] = m;
  }
  return out;
};

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
  if (!sizesFor(f.format).includes(f.size))
    out.push({ field: "format", message: f.format === "round_robin" ? "Round robin takes 4 to 6 players." : "Pick 4, 8 or 16 players." });
  const closes = new Date(f.signupCloses);
  if (!f.signupCloses || Number.isNaN(closes.getTime()) || closes <= now)
    out.push({ field: "signupCloses", message: "Pick a time in the future." });
  if (f.matchup === "map") {
    if (f.mapScope === "event" && !f.map)
      out.push({ field: "map", message: "Pick a map." });
    if (f.mapScope === "round") {
      for (const slot of mapSlots(f))
        if (!f.roundMaps[slot.key])
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
    const roundMaps: Record<string, MapRef> = {};
    for (const { key } of mapSlots(f)) {
      const m = f.roundMaps[key];
      if (m) roundMaps[key] = m;
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
  format: f.format,
  size: f.size,
  matchWindowHours: f.matchWindowHours,
  signupClosesAt: new Date(f.signupCloses).toISOString(),
  status,
  ...withRoundRobinSettings(f, matchupToWire(f)),
});

/** The create body with the event map lock's content hash (#1268; none when it can't be made). */
export const toCreateBodyWithMapHash = async (
  f: CreateFormState,
  status: "draft" | "signup" = "signup",
): Promise<CreateTournamentBody> => {
  const body = toCreateBody(f, status);
  return { ...body, matchupRule: await ruleWithMapHash(body.matchupRule) };
};

/** `settings.top2Final` rides along for round robin only (the api rejects it elsewhere). */
const withRoundRobinSettings = <T extends { settings?: Record<string, unknown> }>(f: CreateFormState, w: T): T =>
  f.format === "round_robin" && f.top2Final ? { ...w, settings: { ...w.settings, top2Final: true } } : w;

/** Latest the final can land: each round may use its full window plus a 24h decide grace. */
export const latestFinal = (f: CreateFormState): Date | null => {
  const closes = new Date(f.signupCloses);
  if (Number.isNaN(closes.getTime())) return null;
  // Mirrors the api's latestPossibleFinal: rounds × (window + 24h), the group is one round, the top-2 final a second.
  const rounds = f.format === "round_robin" ? (f.top2Final ? 2 : 1) : roundCount(f.size);
  const hours = rounds * (f.matchWindowHours + 24);
  return new Date(closes.getTime() + hours * 3_600_000);
};

export const matchupSummary = (f: CreateFormState): string =>
  f.matchup === "free"
    ? "Players choose heroes"
    : f.matchup === "organizer"
      ? "You set each matchup"
      : f.mapScope === "round"
        ? "A map per round"
        : "Same map for everyone";

export const formatName = (f: Pick<CreateFormState, "format">): string =>
  f.format === "round_robin" ? "Round robin" : "Single elimination";
