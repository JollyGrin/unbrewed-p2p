/**
 * Minimal Pro multiplayer playtest affordances.
 *
 * These are product/UI helpers only: format ids are server-authored, and maps
 * come from the catalog/custom-map flow. The client still never derives legal
 * moves or relationships.
 */
import type { PlayerId } from "./protocol";

export type ProFormatId = "duel" | "ffa-3" | "team-2v2";

export interface ProFormatChoice {
  id: ProFormatId;
  label: string;
  detail: string;
  requiredPlayers: number;
}

export const PRO_FORMATS: ProFormatChoice[] = [
  { id: "duel", label: "Duel", detail: "standard 1v1", requiredPlayers: 2 },
  { id: "ffa-3", label: "3P FFA", detail: "playtest free-for-all", requiredPlayers: 3 },
  { id: "team-2v2", label: "2v2", detail: "playtest teams", requiredPlayers: 4 },
];

export const formatChoice = (id: string | null | undefined): ProFormatChoice =>
  PRO_FORMATS.find((f) => f.id === id) ?? PRO_FORMATS[0]!;

/** One team's runtime seats in a team format (waiting-room preview, issue #195). */
export interface FormatTeam {
  team: string;
  seats: PlayerId[];
}

/**
 * Seat→team split for a team format, in runtime seat order (p1..pN). Returns
 * null for non-team formats (duel/ffa — every seat is independent, no split to
 * preview). This is the FIXED, format-defined mapping used in the waiting room
 * BEFORE any game view (and thus any engine `team`) exists; once the match
 * starts, `view.players[].team` is the source of truth (see lib/pro/teams.ts).
 *
 * team-2v2 seats the arena as A1,B1,A2,B2 across start slots 1..4, and seats
 * fill in runtime order, so p1..p4 split into A={p1,p3} vs B={p2,p4}.
 */
export function teamComposition(formatId: string | null | undefined): FormatTeam[] | null {
  if (formatId !== "team-2v2") return null;
  return [
    { team: "A", seats: ["p1", "p3"] },
    { team: "B", seats: ["p2", "p4"] },
  ];
}

