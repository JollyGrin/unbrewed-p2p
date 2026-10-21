/**
 * The post-game panel's pure half (p2p #1397, feature/end-screen part 1):
 * what the panel says about a finished game, derived from data the client
 * already holds when the game ends — the final `PlayerView` and the one
 * `GAME_ENDED` event the last STATE batch carried. No network, no guessing.
 */
import type { GameEvent, PlayerView, ViewFighter, ViewPlayer } from "./protocol";
import { isViewerOnWinningTeam } from "./teams";

export type GameEndReason = Extract<GameEvent, { type: "GAME_ENDED" }>["reason"];

/**
 * The end reason of the batch that finished the game, or null when this batch
 * carried none. `GAME_ENDED` is not on `PlayerView` and the server omits
 * `events` on a reconnect, so the page captures it the moment it arrives.
 */
export const gameEndReasonOf = (events: readonly GameEvent[]): GameEndReason | null => {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "GAME_ENDED") return e.reason;
  }
  return null;
};

/** The game has ended, whether or not anybody won it. */
export const isGameOver = (view: Pick<PlayerView, "phase" | "winner">): boolean =>
  view.phase === "GAME_OVER" || !!view.winner;

export type GameResult = "victory" | "defeat" | "no-winner";

/**
 * The viewer's result, or null while the game is still on. A `GAME_OVER` with
 * no winner (a simultaneous knockout) is a real outcome, not a missing one:
 * the panel renders "NO WINNER" for it where the old dock rendered nothing.
 */
export const gameResultOf = (
  view: Pick<PlayerView, "phase" | "winner" | "players" | "you">,
): GameResult | null => {
  if (view.winner) return isViewerOnWinningTeam(view) ? "victory" : "defeat";
  return view.phase === "GAME_OVER" ? "no-winner" : null;
};

export const RESULT_TITLE: Record<GameResult, string> = {
  victory: "VICTORY",
  defeat: "DEFEAT",
  "no-winner": "NO WINNER",
};

/** The seats that did NOT win: everyone off the winner's team (or, with no team
 *  signal, everyone but the winner). Empty when nobody won. */
const losingSeats = (view: Pick<PlayerView, "winner" | "players">): ViewPlayer[] => {
  const { winner, players } = view;
  if (!winner) return [];
  const winnerTeam = players.find((p) => p.id === winner)?.team;
  return players.filter((p) => p.id !== winner && (winnerTeam == null || p.team == null || p.team !== winnerTeam));
};

/** A seat's hero, by name: the HERO fighter it owns, else the caller's lookup. */
export const seatHeroName = (
  view: Pick<PlayerView, "fighters">,
  seat: Pick<ViewPlayer, "id" | "heroId">,
  heroNameOf?: (heroId: string) => string | null,
): string =>
  view.fighters.find((f) => f.owner === seat.id && f.kind === "HERO")?.name ??
  (seat.heroId ? heroNameOf?.(seat.heroId) ?? seat.heroId : "Hero");

/**
 * The line under the result title: how the game ended and who fell. Null when
 * the reason is unknown (a reload into a finished room), because a guess here
 * would be a lie — the panel simply says less.
 *
 *   "Won by knockout · Kenshiro fell on turn 11"
 *   "Kenshiro forfeited"
 *   "Both heroes fell"
 */
export const endReasonLine = (
  view: Pick<PlayerView, "phase" | "winner" | "players" | "you" | "fighters" | "turnNumber">,
  reason: GameEndReason | null,
  heroNameOf?: (heroId: string) => string | null,
): string | null => {
  if (!reason) return null;
  const result = gameResultOf(view);
  const verb = result === "victory" ? "Won" : result === "defeat" ? "Lost" : null;
  switch (reason) {
    case "SIMULTANEOUS":
      return "Both heroes fell";
    case "FORFEIT": {
      const losers = losingSeats(view);
      if (losers.length === 1) return `${seatHeroName(view, losers[0], heroNameOf)} forfeited`;
      return verb ? `${verb} by forfeit` : "Forfeit";
    }
    case "HERO_DEFEATED": {
      const head = verb ? `${verb} by knockout` : "Knockout";
      const fallen = view.fighters.filter((f) => f.kind === "HERO" && f.defeated).map((f) => f.name);
      if (fallen.length === 0) return head;
      return `${head} · ${joinNames(fallen)} fell on turn ${view.turnNumber}`;
    }
    // Adventure scenario ends: the format end screen owns those games, so the
    // post-game panel says less rather than describe a scenario it can't see.
    case "SCENARIO_VICTORY":
    case "SCENARIO_DEFEAT":
      return null;
  }
};

const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export interface MatchupSeat {
  player: ViewPlayer;
  /** The seat's fighters, hero first, in the view's own order after that. */
  fighters: ViewFighter[];
  you: boolean;
  /** On the winning side (team-aware). False for everyone when nobody won. */
  won: boolean;
}

/**
 * One entry per seat, the viewer first, each with its fighters — including
 * defeated ones, which the engine keeps on the view so the final HP can read
 * "KO" instead of vanishing.
 */
export const matchupSeats = (
  view: Pick<PlayerView, "players" | "fighters" | "winner" | "you">,
): MatchupSeat[] => {
  const seats = view.players.map((player) => {
    const own = view.fighters.filter((f) => f.owner === player.id);
    const fighters = [...own.filter((f) => f.kind === "HERO"), ...own.filter((f) => f.kind !== "HERO")];
    return {
      player,
      fighters,
      you: player.id === view.you,
      won: !!view.winner && isViewerOnWinningTeam({ players: view.players, winner: view.winner, you: player.id }),
    };
  });
  return [...seats.filter((s) => s.you), ...seats.filter((s) => !s.you)];
};

/** The HP cell of a fighter row: "5 / 16", or "KO" once it is out. */
export const fighterHpLabel = (f: Pick<ViewFighter, "hp" | "maxHp" | "defeated">): string =>
  f.defeated || f.hp <= 0 ? "KO" : `${f.hp} / ${f.maxHp}`;

/** Two-letter avatar initials: first letters of the first two words, else the first two characters. */
export const avatarInitials = (name: string | null | undefined): string => {
  const words = (name ?? "").trim().split(/[\s_-]+/).filter(Boolean);
  const raw = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return raw.toUpperCase() || "?";
};

