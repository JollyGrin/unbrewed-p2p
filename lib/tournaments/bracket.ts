/**
 * The bracket's layout model (#1217): api rows in, everything the tree, the
 * phone round tabs and the match cells draw out. Pure — no React, no clock
 * except the `now` passed in.
 *
 * Rounds are 1-based and positions 0-based (unbrewed-api `bracket.ts`); match
 * `p` of round `r` feeds slot `p % 2 === 0 ? a : b` of match `p >> 1` in round
 * `r + 1`. A match's heroes/map are read from `match.matchup`, which the api
 * computes with `assignment(matchupRule, 0)` — never re-derived here.
 */
import { heroDisplayName } from "@/lib/stats/roster";

import { mapTitle } from "./options";
import type { DecidedBy, Entry, Match, Tournament } from "./types";

/** "Final", "Semifinals", "Quarterfinals", "Round of 16". */
export const roundName = (round: number, rounds: number): string => {
  const left = rounds - round;
  if (left === 0) return "Final";
  if (left === 1) return "Semifinals";
  if (left === 2) return "Quarterfinals";
  return `Round of ${2 ** (left + 1)}`;
};

/** Phone tab label: "Final", "Semis", "Quarters", "R16". */
export const roundShort = (round: number, rounds: number): string => {
  const left = rounds - round;
  if (left === 0) return "Final";
  if (left === 1) return "Semis";
  if (left === 2) return "Quarters";
  return `R${2 ** (left + 1)}`;
};

/** Cell tag: "QF1", "SF2", "Final", "R16·3". */
export const matchCode = (round: number, position: number, rounds: number): string => {
  const left = rounds - round;
  const n = position + 1;
  if (left === 0) return "Final";
  if (left === 1) return `SF${n}`;
  if (left === 2) return `QF${n}`;
  return `R${2 ** (left + 1)}·${n}`;
};

/**
 * A match cell's state. `waiting` = a player is still unknown; `ready` = both
 * known, no game yet; `unverified` = a finished game the organizer (or the 24h
 * auto-confirm) hasn't accepted — it advances no one (settled rule 4).
 */
export type CellState = "waiting" | "ready" | "in_play" | "unverified" | "decided";

/** How a decided match was decided, as the cell says it. */
export interface DecidedNote {
  /** Short tag beside the match code ("By deadline rule", "Bye"); null for a played result. */
  tag: string | null;
  /** Footer line explaining the rule, when one decided it. */
  rule: string | null;
}

export const DECIDED_NOTE: Record<DecidedBy, DecidedNote> = {
  result: { tag: null, rule: null },
  unverified_confirmed: { tag: "Result confirmed", rule: null },
  organizer: { tag: "Organizer decided", rule: "Decided by the organizer." },
  deadline_ready_check: {
    tag: "By deadline rule",
    rule: "Rule 1 · unanswered ready-check. The player who pressed Play advances.",
  },
  deadline_higher_seed: {
    tag: "By deadline rule",
    rule: "Rule 2 · no result by the deadline. The higher seed advances.",
  },
  bye: { tag: "Bye", rule: null },
};

export interface SlotView {
  /** Entry id when the player is known. */
  entryId: string | null;
  name: string;
  avatarUrl: string;
  seed: number | null;
  /** Second line: hero, "advances", "Winner of QF2"'s candidates, … */
  sub: string;
  /** Unknown player ("Winner of QF2") or an empty bye seat. */
  placeholder: boolean;
  result: "win" | "lose" | null;
  /** Games won, shown once a game has a winner (verified or not). */
  score: number | null;
}

export interface CellView {
  id: string;
  round: number;
  position: number;
  code: string;
  state: CellState;
  decidedBy: DecidedBy | null;
  note: DecidedNote | null;
  a: SlotView;
  b: SlotView;
  /** Hero / map chips from `match.matchup`; empty for players-choose. */
  matchup: { heroes: string | null; map: string | null };
  /** True when the organizer set this match's matchup by hand. */
  override: boolean;
  /** Footer text. */
  foot: string;
  deadlineAt: string | null;
  /** The match page link; null for cells with nothing to open (waiting, bye). */
  href: string | null;
  /** The winner's line to the next round draws gold. */
  feedsWinner: boolean;
}

export interface RoundView {
  round: number;
  name: string;
  short: string;
  cells: CellView[];
  decided: number;
  inPlay: number;
  /** Tab subtitle: "4/4 decided", "1 in play", "waiting". */
  summary: string;
}

export interface BracketView {
  rounds: RoundView[];
  /** Champion entry once the final is decided. */
  champion: Entry | null;
  stats: {
    players: number;
    /** The earliest round with an undecided match (rounds.length when done). */
    currentRound: number;
    gamesPlayed: number;
    inPlay: number;
  };
}

export const matchHref = (slug: string, matchId: string): string =>
  `/tournaments?t=${encodeURIComponent(slug)}&m=${encodeURIComponent(matchId)}`;

/** The api's round count for a single-elimination bracket of `size`. */
export const roundCount = (size: number): number => Math.round(Math.log2(size));

/**
 * Standard bracket order (unbrewed-api `seedOrder`): the seed in each round-1
 * slot, top to bottom. 8 → [1,8, 4,5, 2,7, 3,6].
 */
export const seedOrder = (size: number): number[] => {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
};

export const cellState = (m: Match): CellState => {
  if (m.status === "decided" || m.winner) return "decided";
  if (m.inPlay || m.status === "in_play") return "in_play";
  if (m.games.some((g) => g.finishedAt && g.winnerEntry && !g.verified && !g.rejectedAt)) return "unverified";
  if (m.slotA && m.slotB) return "ready";
  return "waiting";
};

const wins = (m: Match, entryId: string | null): number =>
  entryId ? m.games.filter((g) => g.finishedAt && !g.rejectedAt && g.winnerEntry === entryId).length : 0;

const shortDay = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

export const buildBracket = (
  t: Pick<Tournament, "slug" | "size" | "status">,
  entries: readonly Entry[],
  matches: readonly Match[],
): BracketView => {
  const rounds = roundCount(t.size);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const byPos = new Map(matches.map((m) => [`${m.round}:${m.position}`, m]));
  const codeOf = (m: Match) => matchCode(m.round, m.position, rounds);

  /** "RavenDefeatsAll or crystal_lake_jay" for a feeder's known players. */
  const candidates = (feeder: Match | undefined): string => {
    if (!feeder) return "";
    const names = [feeder.slotA, feeder.slotB]
      .map((id) => (id ? byId.get(id)?.username : null))
      .filter((n): n is string => !!n);
    if (names.length === 0) return "";
    return cellState(feeder) === "unverified" && names.length === 2
      ? `${names.join(" or ")}, once confirmed`
      : names.join(" or ");
  };

  const slot = (m: Match, side: "a" | "b", state: CellState): SlotView => {
    const id = side === "a" ? m.slotA : m.slotB;
    const entry = id ? byId.get(id) : undefined;
    if (!id || !entry) {
      // Round 1 has no feeder: an empty round-1 seat is a bye.
      if (m.round === 1)
        return { entryId: null, name: "Bye", avatarUrl: "", seed: null, sub: "", placeholder: true, result: null, score: null };
      const feeder = byPos.get(`${m.round - 1}:${m.position * 2 + (side === "a" ? 0 : 1)}`);
      return {
        entryId: null,
        name: feeder ? `Winner of ${codeOf(feeder)}` : "To be decided",
        avatarUrl: "",
        seed: null,
        sub: candidates(feeder),
        placeholder: true,
        result: null,
        score: null,
      };
    }
    const hero = side === "a" ? m.matchup.heroes.a : m.matchup.heroes.b;
    const decided = state === "decided";
    const won = decided && m.winner === id;
    const playedGame = m.games.some((g) => g.finishedAt && !g.rejectedAt && g.winnerEntry);
    let sub = hero ? heroDisplayName(hero) : "";
    if (decided && m.decidedBy === "bye") sub = "advances on a bye";
    else if (decided && !playedGame) sub = won ? "advances" : "no game played";
    else if (entry.leftAt && !decided) sub = "left the tournament";
    return {
      entryId: id,
      name: entry.username ?? "Player",
      avatarUrl: entry.avatarUrl,
      seed: entry.seed,
      sub,
      placeholder: false,
      result: decided && m.winner ? (won ? "win" : "lose") : null,
      score: playedGame ? wins(m, id) : null,
    };
  };

  const foot = (m: Match, state: CellState, note: DecidedNote | null): string => {
    switch (state) {
      case "decided":
        if (note?.rule) return note.rule;
        if (m.decidedBy === "bye") return "No opponent this round";
        return `Decided ${shortDay(m.games.find((g) => g.finishedAt && !g.rejectedAt)?.finishedAt ?? null)}`.trim();
      case "in_play":
        return "In play now";
      case "unverified":
        return "Untagged game · organizer to confirm";
      case "ready":
        return "Waiting for a game";
      default: {
        const need = [m.slotA, m.slotB].filter((s) => !s).length;
        return need === 2 ? "Opens when both feeders are decided" : "Opens when the other match is decided";
      }
    }
  };

  const roundViews: RoundView[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = t.size >> r;
    const cells: CellView[] = [];
    for (let p = 0; p < count; p++) {
      const m = byPos.get(`${r}:${p}`);
      if (!m) continue;
      const state = cellState(m);
      const note = state === "decided" && m.decidedBy ? DECIDED_NOTE[m.decidedBy] : null;
      const heroes =
        m.matchup.heroes.a && m.matchup.heroes.b
          ? `${heroDisplayName(m.matchup.heroes.a)} vs ${heroDisplayName(m.matchup.heroes.b)}`
          : null;
      cells.push({
        id: m.id,
        round: r,
        position: p,
        code: codeOf(m),
        state,
        decidedBy: m.decidedBy,
        note,
        a: slot(m, "a", state),
        b: slot(m, "b", state),
        matchup: { heroes, map: m.matchup.map ? mapTitle(m.matchup.map) : null },
        override: m.matchupOverride,
        foot: foot(m, state, note),
        deadlineAt: m.deadlineAt,
        href: state === "waiting" || m.decidedBy === "bye" ? null : matchHref(t.slug, m.id),
        feedsWinner: state === "decided" && !!m.winner && r < rounds,
      });
    }
    const decided = cells.filter((c) => c.state === "decided").length;
    const inPlay = cells.filter((c) => c.state === "in_play").length;
    roundViews.push({
      round: r,
      name: roundName(r, rounds),
      short: roundShort(r, rounds),
      cells,
      decided,
      inPlay,
      summary:
        inPlay > 0
          ? `${inPlay} in play`
          : decided > 0
            ? `${decided}/${cells.length} decided`
            : cells.some((c) => c.state !== "waiting")
              ? "open"
              : "waiting",
    });
  }

  const final = byPos.get(`${rounds}:0`);
  const champion =
    final && final.winner && cellState(final) === "decided" ? (byId.get(final.winner) ?? null) : null;
  const open = roundViews.find((rv) => rv.decided < rv.cells.length);
  return {
    rounds: roundViews,
    champion,
    stats: {
      // Everyone placed in round 1, including anyone who has since left.
      players: new Set(
        matches.filter((m) => m.round === 1).flatMap((m) => [m.slotA, m.slotB]).filter(Boolean),
      ).size,
      currentRound: open ? open.round : rounds,
      gamesPlayed: matches.reduce((n, m) => n + m.games.filter((g) => g.finishedAt && !g.rejectedAt).length, 0),
      inPlay: roundViews.reduce((n, rv) => n + rv.inPlay, 0),
    },
  };
};

/** Which phone tab opens first: the round with something live, else the earliest undecided one. */
export const defaultRoundIndex = (view: BracketView): number => {
  const live = view.rounds.findIndex((r) => r.inPlay > 0);
  if (live >= 0) return live;
  const open = view.rounds.findIndex((r) => r.decided < r.cells.length);
  return open >= 0 ? open : Math.max(0, view.rounds.length - 1);
};

export interface EntrantRow {
  entry: Entry;
  /** "Champion", "Still in", "Out in QF2", "Left". */
  status: string;
  tone: "gold" | "live" | "plain" | "done";
}

/** The entrants list under the bracket: seed order, with how far each got. */
export const entrantRows = (
  size: number,
  entries: readonly Entry[],
  matches: readonly Match[],
): EntrantRow[] => {
  const rounds = roundCount(size);
  const placed = new Set(
    matches.filter((m) => m.round === 1).flatMap((m) => [m.slotA, m.slotB]),
  );
  const final = matches.find((m) => m.round === rounds);
  return entries
    .filter((e) => placed.has(e.id) || (!e.leftAt && matches.length === 0))
    .sort((x, y) => (x.seed ?? 99) - (y.seed ?? 99) || x.joinedAt.localeCompare(y.joinedAt))
    .map((entry) => {
      if (final?.winner === entry.id && final.status === "decided")
        return { entry, status: "Champion", tone: "gold" as const };
      const lost = matches.find(
        (m) => m.status === "decided" && m.winner && m.winner !== entry.id && (m.slotA === entry.id || m.slotB === entry.id),
      );
      if (lost) return { entry, status: `Out in ${matchCode(lost.round, lost.position, rounds)}`, tone: "done" as const };
      if (entry.leftAt) return { entry, status: "Left", tone: "done" as const };
      const playing = matches.some(
        (m) => (m.slotA === entry.id || m.slotB === entry.id) && cellState(m) === "in_play",
      );
      return playing
        ? { entry, status: "In play now", tone: "live" as const }
        : { entry, status: "Still in", tone: "plain" as const };
    });
};
