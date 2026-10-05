/**
 * Round-robin tournament page model (#1221): standings rows with a "fate"
 * (can they still make the final?), the form dots, and the match list grouped by
 * round. Standings themselves come from the api (`Standing[]`), never computed
 * here; this only lays them out. Mockup v2, "Same page, round-robin format".
 */
import { DECIDED_NOTE, cellState, countsGame, type CellState } from "./bracket";
import type { Entry, Match, Standing, Tournament } from "./types";

export const isRoundRobin = (t: Pick<Tournament, "format">): boolean => t.format === "round_robin";

/** Group rounds the api schedules: n − 1, or n when odd (one player sits out each round). */
export const roundRobinRounds = (players: number): number => (players % 2 === 0 ? players - 1 : players);

export const hasTop2Final = (t: Pick<Tournament, "settings">): boolean => t.settings?.top2Final === true;

export type FateTone = "clinched" | "alive" | "out" | "champion";
export type FormDot = "W" | "L" | "pend";

export interface StandingRow {
  rank: number;
  entry: Entry;
  wins: number;
  losses: number;
  played: number;
  /** Matches this player has in the group stage (decided or not). */
  scheduled: number;
  form: FormDot[];
  fate: string;
  tone: FateTone;
  /** Inside the cut (top 2 with a final, top 1 without). */
  inCut: boolean;
  /** Last row inside the cut: the dashed line goes under it. */
  cutLine: boolean;
  dropped: boolean;
  /** Short "why this order" note when a tiebreak separated the row from its neighbour. */
  tiebreak: string | null;
}

export interface RrMatchSide {
  name: string;
  avatarUrl?: string;
  result: "win" | "lose" | null;
}

export interface RrMatchRow {
  id: string;
  /** "R3 · 2", "Final". */
  code: string;
  a: RrMatchSide;
  b: RrMatchSide;
  state: CellState;
  /** "1–0", "By deadline rule", "In play now", … */
  note: string | null;
  deadlineAt: string | null;
}

export interface RrRoundView {
  round: number;
  label: string;
  matches: RrMatchRow[];
  decided: number;
}

export interface RoundRobinView {
  standings: StandingRow[];
  rounds: RrRoundView[];
  final: RrMatchRow | null;
  /** The cut size: 2 with a top-2 final, else 1. */
  cut: number;
  champion: Entry | null;
  stats: { players: number; currentRound: number; totalRounds: number; gamesPlayed: number; inPlay: number };
  groupComplete: boolean;
}

const decidedOf = (m: Match) => m.status === "decided" || !!m.winner;
const isFinal = (m: Match) => m.stage === "final";

/** Standings rows for display; `standings` null (older api) falls back to the seed order at 0–0. */
const rowsOf = (standings: readonly Standing[] | null, entries: readonly Entry[]): Standing[] => {
  if (standings && standings.length > 0) return [...standings].sort((a, b) => a.rank - b.rank);
  return entries
    .filter((e) => !e.leftAt)
    .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99))
    .map((e, i) => ({
      rank: i + 1,
      entryId: e.id,
      seed: e.seed,
      played: 0,
      wins: 0,
      losses: 0,
      headToHeadWins: 0,
      rankedBy: "seed" as const,
    }));
};

const TIEBREAK: Record<Standing["rankedBy"], string | null> = {
  wins: null,
  head_to_head: "ahead on head-to-head",
  seed: "ahead on seed",
};

export const buildRoundRobin = (
  t: Pick<Tournament, "size" | "status" | "settings">,
  entries: readonly Entry[],
  matches: readonly Match[],
  standings: readonly Standing[] | null,
): RoundRobinView => {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const withFinal = hasTop2Final(t);
  const cut = withFinal ? 2 : 1;
  const group = matches.filter((m) => !isFinal(m));
  const finalMatch = matches.find(isFinal) ?? null;
  const groupComplete = group.length > 0 && group.every(decidedOf);
  const finalWinner = finalMatch?.winner ? byId.get(finalMatch.winner) ?? null : null;
  const rows = rowsOf(standings, entries);

  const champion: Entry | null =
    t.status !== "complete"
      ? null
      : withFinal
        ? finalWinner
        : (byId.get(rows[0]?.entryId ?? "") ?? null);

  const remainingOf = (id: string) =>
    group.filter((m) => !decidedOf(m) && (m.slotA === id || m.slotB === id)).length;
  const scheduledOf = (id: string) => group.filter((m) => m.slotA === id || m.slotB === id).length;
  const formOf = (id: string): FormDot[] =>
    group
      .filter((m) => m.slotA === id || m.slotB === id)
      .sort((a, b) => a.round - b.round || a.position - b.position)
      .map((m) => (!decidedOf(m) ? "pend" : m.winner === id ? "W" : "L"));

  const cutWins = rows[cut - 1]?.wins ?? 0;
  const standingRows: StandingRow[] = rows.flatMap((s, i): StandingRow[] => {
    const entry = byId.get(s.entryId);
    if (!entry) return [];
    const dropped = !!entry.leftAt;
    const others = rows.filter((o) => o.entryId !== s.entryId);
    const max = s.wins + remainingOf(s.entryId);
    const threats = others.filter((o) => o.wins + remainingOf(o.entryId) >= s.wins).length;
    const ahead = others.filter((o) => o.wins > max).length;
    const noun = withFinal ? "top 2" : "1st";

    let fate: string;
    let tone: FateTone;
    const settled = t.status === "complete" || (groupComplete && (!withFinal || !!finalMatch));
    if (champion && champion.id === entry.id) {
      fate = "♛ Champion";
      tone = "champion";
    } else if (dropped) {
      fate = "Dropped out";
      tone = "out";
    } else if (withFinal && finalMatch && s.rank <= 2 && finalWinner) {
      fate = "Runner-up";
      tone = "out";
    } else if (withFinal && finalMatch && s.rank <= 2) {
      fate = "In the final";
      tone = "clinched";
    } else if (settled || (groupComplete && s.rank > cut)) {
      fate = withFinal ? "Out of the final" : s.rank === 1 ? "Group winner" : "Finished";
      tone = s.rank <= cut && !withFinal ? "clinched" : "out";
    } else if (threats < cut) {
      fate = withFinal ? "✓ Clinched final" : "✓ Clinched 1st";
      tone = "clinched";
    } else if (ahead >= cut) {
      fate = withFinal ? "Out of the final" : "Out of the running";
      tone = "out";
    } else if (s.rank <= cut) {
      fate = withFinal ? "In the top 2 for now" : "In the lead";
      tone = "alive";
    } else {
      fate = max > cutWins ? `Can still make the ${noun}` : withFinal ? "Can still tie 2nd" : "Can still tie 1st";
      tone = "alive";
    }

    const next = rows[i + 1];
    return [
      {
        rank: s.rank,
        entry,
        wins: s.wins,
        losses: s.losses,
        played: s.played,
        scheduled: scheduledOf(s.entryId),
        form: formOf(s.entryId),
        fate,
        tone,
        inCut: s.rank <= cut,
        cutLine: s.rank === cut,
        dropped,
        // The note explains why THIS row is above the next one, so it sits on the
        // higher row of a tied pair; nothing to explain before anyone has played.
        tiebreak: next && next.wins === s.wins && (s.played > 0 || next.played > 0) ? TIEBREAK[s.rankedBy] : null,
      },
    ];
  });

  const side = (m: Match, which: "a" | "b"): RrMatchSide => {
    const id = which === "a" ? m.slotA : m.slotB;
    const e = id ? byId.get(id) : undefined;
    return {
      name: e?.username ?? (id ? "Player" : "TBD"),
      avatarUrl: e?.avatarUrl,
      result: decidedOf(m) && id ? (m.winner === id ? "win" : "lose") : null,
    };
  };
  const scoreOf = (m: Match) => {
    const w = (id: string | null) =>
      id ? m.games.filter((g) => countsGame(g) && g.winnerEntry === id).length : 0;
    return `${w(m.slotA)}–${w(m.slotB)}`;
  };
  const rowOf = (m: Match): RrMatchRow => {
    const state = cellState(m);
    const tag = m.decidedBy ? DECIDED_NOTE[m.decidedBy].tag : null;
    return {
      id: m.id,
      code: isFinal(m) ? "Final" : `R${m.round} · ${m.position + 1}`,
      a: side(m, "a"),
      b: side(m, "b"),
      state,
      note:
        state === "decided"
          ? (tag ?? (m.games.some(countsGame) ? scoreOf(m) : null))
          : state === "cancelled"
            ? "Cancelled"
          : state === "in_play"
            ? "In play now"
            : state === "unverified"
              ? "Result awaiting confirmation"
              : null,
      deadlineAt: state === "decided" ? null : m.deadlineAt,
    };
  };

  const roundNos = [...new Set(group.map((m) => m.round))].sort((a, b) => a - b);
  const rounds: RrRoundView[] = roundNos.map((r) => {
    const ms = group
      .filter((m) => m.round === r)
      .sort((a, b) => a.position - b.position);
    return { round: r, label: `Round ${r}`, matches: ms.map(rowOf), decided: ms.filter(decidedOf).length };
  });

  const openRound = rounds.find((r) => r.decided < r.matches.length);
  return {
    standings: standingRows,
    rounds,
    final: finalMatch ? rowOf(finalMatch) : null,
    cut,
    champion,
    groupComplete,
    stats: {
      players: standingRows.filter((r) => !r.dropped).length,
      currentRound: openRound?.round ?? rounds.length,
      totalRounds: rounds.length,
      gamesPlayed: matches.reduce((n, m) => n + m.games.filter(countsGame).length, 0),
      inPlay: matches.filter((m) => !decidedOf(m) && cellState(m) === "in_play").length,
    },
  };
};
