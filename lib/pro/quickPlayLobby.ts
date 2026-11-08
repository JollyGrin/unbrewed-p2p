/**
 * Quick Play lobby surface (issue #1542) — the pure half of the presence pill,
 * the "Here now" ribbon, the upgraded Quick Match button and the searching /
 * found dock panels on `/pro/game`.
 *
 * Every input is optional server data. The lobby socket (`lib/pro/lobbyProtocol.ts`,
 * engine #1034) may be absent (an engine without `/lobby`, or not connected yet),
 * the bonus window may be absent (no bonus running), and the `LobbyListing`
 * enrichments may be absent (an older engine). Each helper renders NOTHING for a
 * field that is not there rather than a zero or a placeholder, the same rule the
 * open-lobby strip has always followed.
 */
import type { LobbyListing, RoomStatusSeat } from "./protocol";
import type { LobbyPresenceState, PresenceEntry, QuickPlayBonus } from "./lobbyProtocol";
import { isQuickMatchCandidate, lobbyHostName, lobbyTimerLabel } from "./quickMatch";

// ---------------------------------------------------------------------------
// Bonus window
// ---------------------------------------------------------------------------

/**
 * The bonus that is running right now, or null. The server already omits an
 * expired bonus from SNAPSHOT; the clock check is for a tab that sat on one
 * snapshot past `endsAt` (the 10 s heartbeat normally prevents that).
 */
export const activeBonus = (
  bonus: QuickPlayBonus | null | undefined,
  now: number,
): QuickPlayBonus | null => {
  if (!bonus || !(bonus.multiplier > 1)) return null;
  const ends = Date.parse(bonus.endsAt);
  if (!Number.isFinite(ends) || ends <= now) return null;
  return bonus;
};

/** "2×", "1.5×" — the multiplier as the tags print it. */
export const multiplierLabel = (multiplier: number): string =>
  `${Number.isInteger(multiplier) ? multiplier : Math.round(multiplier * 10) / 10}×`;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * "ends Sun 23:59" in the viewer's local time; "ends 23:59" when that is today.
 * Null for an unparseable timestamp (the tag then drops the line).
 */
export const bonusEndsLabel = (endsAt: string, now: number): string | null => {
  const ends = Date.parse(endsAt);
  if (!Number.isFinite(ends)) return null;
  const end = new Date(ends);
  const today = new Date(now);
  const sameDay =
    end.getFullYear() === today.getFullYear() &&
    end.getMonth() === today.getMonth() &&
    end.getDate() === today.getDate();
  const time = `${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  return sameDay ? `ends ${time}` : `ends ${WEEKDAYS[end.getDay()]} ${time}`;
};

// ---------------------------------------------------------------------------
// Avatars
// ---------------------------------------------------------------------------

/** One letter for an avatar disc; "?" for an anonymous player. */
export const avatarInitial = (name: string | null | undefined): string => {
  const ch = name?.trim().match(/\p{L}|\p{N}/u)?.[0];
  return ch ? ch.toUpperCase() : "?";
};

/**
 * Avatar fills. Seeded by the hero a player is on (so the disc matches the pip on
 * that hero's roster tile) or, without one, by their name. Deterministic, so two
 * tabs paint the same person the same colour.
 */
const AVATAR_FILLS = ["#ab224b", "#003761", "#408080", "#9A55B5", "#65a498", "#b80000", "#7a6b05", "#4a6b8a", "#8a4a3a", "#3b6b2e"];

export const avatarColour = (seed: string | null | undefined): string => {
  if (!seed) return "#555";
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_FILLS[h % AVATAR_FILLS.length];
};

export interface Avatar {
  key: string;
  initial: string;
  colour: string;
  title: string;
}

const lobbyAvatar = (l: LobbyListing): Avatar => {
  const name = lobbyHostName(l);
  return { key: `l-${l.roomId}`, initial: avatarInitial(name), colour: avatarColour(l.heroId), title: name ?? "Anonymous" };
};

export const presenceName = (p: PresenceEntry): string | null => p.displayName?.trim() || null;

export const presenceAvatar = (p: PresenceEntry): Avatar => {
  const name = presenceName(p);
  return {
    key: `p-${p.id}`,
    initial: avatarInitial(name),
    colour: avatarColour(p.heroId ?? name ?? p.id),
    title: name ?? "Anonymous",
  };
};

// ---------------------------------------------------------------------------
// Ages and timers
// ---------------------------------------------------------------------------

/** "1m 42s", "0m 08s" — a lobby's waiting age, as the ribbon prints it. */
export const waitAgeLabel = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}m ${pad2(s % 60)}s`;
};

/** "0:12", "3:05" — the searching panel's elapsed clock. */
export const elapsedLabel = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
};

/** The on-page chip's state line. `sinceMs` is time since that socket's HELLO. */
export const presenceStateLabel = (state: LobbyPresenceState, sinceMs: number): string => {
  if (state === "searching") return "searching…";
  if (state === "idle") return `idle · ${Math.max(1, Math.round(sinceMs / 60_000))} min`;
  return "picking a fighter…";
};

// ---------------------------------------------------------------------------
// The ribbon
// ---------------------------------------------------------------------------

export type RibbonItem =
  | {
      kind: "lobby";
      key: string;
      roomId: string;
      avatar: Avatar;
      name: string;
      /** first worn badge, for the ⭐-style garnish after the name */
      badge: string | null;
      heroName: string;
      age: string;
      timer: string | null;
    }
  | {
      kind: "player";
      key: string;
      id: string;
      avatar: Avatar;
      name: string;
      badge: string | null;
      heroName: string | null;
      state: LobbyPresenceState;
      stateLine: string;
      /** v2 (#1556): in a pair already — no 👋 */
      paired: boolean;
    }
  | { kind: "tail"; key: string; tablesInPlay: number };

/**
 * The lobbies the ribbon, pill and Quick Match label read. While the lobby socket
 * is up its SNAPSHOT carries the same list LIST_LOBBIES returns, pushed instead of
 * polled; otherwise the 5 s poll on the game socket is the fallback.
 */
export const effectiveLobbies = (
  snapshotLobbies: LobbyListing[] | null | undefined,
  polled: LobbyListing[] | null | undefined,
): LobbyListing[] | null => snapshotLobbies ?? polled ?? null;

/**
 * A Quick Match searcher keeps its presence socket open (as `searching`) while it
 * holds a seat in its own listed room, so the server counts it twice: once as a
 * watcher, once as a lobby. The lobby chip is the one that matters (it has Join),
 * so a `searching` entry never gets its own chip or disc… unless it is paired: a
 * matched player who pressed Go (#1556 polish) reads `searching` but sits in a
 * private room with no listing, so it keeps its chip and its place in the count.
 */
const shownPresence = (p: PresenceEntry): boolean => p.state !== "searching" || p.paired === true;

/**
 * …and the "N here" number drops it again. A searcher between rooms (its last
 * pick raced away) has no listing for a moment, hence the cap at the lobby count.
 * `players` is capped at 50 server-side; past that the count may read a few high.
 */
export const presentCount = ({
  here,
  players,
  lobbies,
}: {
  here: number;
  players?: PresenceEntry[] | null;
  lobbies?: LobbyListing[] | null;
}): number => {
  const searching = (players ?? []).filter((p) => !shownPresence(p)).length;
  return Math.max(0, here - Math.min(searching, (lobbies ?? []).length));
};

/**
 * Build the ribbon's chips in display order: open lobbies (oldest first), then
 * on-page players, then the "tables in play" tail. The viewer's own room and own
 * presence entry are excluded. Every non-duel lobby still shows (Join routes to
 * its picker like the old strip did); Quick Match alone is duel-only.
 */
export const ribbonItems = ({
  lobbies,
  players,
  you,
  ownRoomId,
  tablesInPlay,
}: {
  lobbies: LobbyListing[] | null | undefined;
  players?: PresenceEntry[] | null;
  you?: string | null;
  ownRoomId?: string | null;
  tablesInPlay?: number | null;
}): RibbonItem[] => {
  const items: RibbonItem[] = [];
  const open = (lobbies ?? [])
    .filter((l) => l.roomId !== ownRoomId)
    .slice()
    .sort((a, b) => b.ageMs - a.ageMs);
  for (const l of open) {
    items.push({
      kind: "lobby",
      key: `lobby-${l.roomId}`,
      roomId: l.roomId,
      avatar: lobbyAvatar(l),
      name: lobbyHostName(l) ?? "Anonymous",
      badge: l.host?.badges?.[0] ?? l.host?.badge ?? null,
      heroName: l.heroName,
      age: waitAgeLabel(l.ageMs),
      timer: lobbyTimerLabel(l),
    });
  }
  for (const p of players ?? []) {
    if ((you && p.id === you) || !shownPresence(p)) continue;
    items.push({
      kind: "player",
      key: `player-${p.id}`,
      id: p.id,
      avatar: presenceAvatar(p),
      name: presenceName(p) ?? "Anonymous",
      badge: p.badges?.[0] ?? p.badge ?? null,
      heroName: p.heroName ?? null,
      state: p.state,
      stateLine: p.paired ? "matched" : presenceStateLabel(p.state, p.sinceMs),
      paired: !!p.paired,
    });
  }
  if (tablesInPlay && tablesInPlay > 0) items.push({ kind: "tail", key: "tail", tablesInPlay });
  return items;
};

/** "1 table in play", "3 tables in play". */
export const tablesInPlayLabel = (n: number): string => `${n} table${n === 1 ? "" : "s"} in play`;

// ---------------------------------------------------------------------------
// Presence pill
// ---------------------------------------------------------------------------

export interface PresencePillModel {
  /** null = the lobby socket has no presence for us (render "N looking" alone) */
  here: number | null;
  looking: number;
  /** we are in the Quick Match pool ourselves (our own room is never in `looking`) */
  youLooking: boolean;
  avatars: Avatar[];
  overflow: number;
}

/** Discs shown in the pill before the "+N". */
export const PILL_AVATARS = 5;

/**
 * The pill's numbers, or null when it should not render at all (no socket up).
 */
export const presencePillModel = ({
  connected,
  here,
  lobbies,
  players,
  you,
  ownRoomId,
  youLooking = false,
}: {
  /** the GAME socket is open (the pill's "looking" number comes off its poll) */
  connected: boolean;
  /** SNAPSHOT.here, or null without a lobby snapshot */
  here: number | null | undefined;
  lobbies: LobbyListing[] | null | undefined;
  players?: PresenceEntry[] | null;
  you?: string | null;
  ownRoomId?: string | null;
  youLooking?: boolean;
}): PresencePillModel | null => {
  const looking = lookingCount(lobbies, ownRoomId);
  const hereN = typeof here === "number" ? here : null;
  // Disconnected, every number is stale: hidden, never an empty box.
  if (!connected) return null;
  const discs: Avatar[] = [
    ...(lobbies ?? []).filter((l) => l.roomId !== ownRoomId).map(lobbyAvatar),
    ...(players ?? []).filter((p) => p.id !== you && shownPresence(p)).map(presenceAvatar),
  ];
  return {
    here: hereN,
    looking,
    youLooking,
    avatars: discs.slice(0, PILL_AVATARS),
    overflow: Math.max(0, discs.length - PILL_AVATARS),
  };
};

/**
 * The pill's two counts, always telling "you" apart from everyone else (Dean,
 * 2026-11-08: "2 looking" read as two OTHER people when one was him). `here`
 * includes us (we are a watcher); `looking` never does (our own room is dropped).
 */
export const hereLabel = (here: number): string => (here <= 1 ? "just you here" : `you + ${here - 1} here`);
export const lookingLabel = (looking: number, youLooking: boolean): string =>
  youLooking ? (looking === 0 ? "you're looking" : `you + ${looking} looking`) : `${looking} looking`;

/** "looking" = open duel lobbies other than ours (the Quick Match pool). */
export const lookingCount = (
  lobbies: LobbyListing[] | null | undefined,
  ownRoomId?: string | null,
): number => (lobbies ?? []).filter((l) => isQuickMatchCandidate(l) && l.roomId !== ownRoomId).length;

// ---------------------------------------------------------------------------
// Quick Match button + dock copy
// ---------------------------------------------------------------------------

/**
 * The button's second line. No wait estimate exists yet (it needs match-formation
 * times from telemetry), so the line is just the count.
 */
export const quickMatchSubline = (looking: number): string =>
  looking === 0
    ? "no one waiting — your table goes public"
    : `${looking} looking right now`;

/**
 * Roster pips: hero id → the host avatar of the OLDEST open lobby holding that
 * hero. The viewer's own room never pips.
 */
export const heroPips = (
  lobbies: LobbyListing[] | null | undefined,
  ownRoomId?: string | null,
): Map<string, Avatar> => {
  const pips = new Map<string, Avatar>();
  const sorted = (lobbies ?? [])
    .filter((l) => l.roomId !== ownRoomId)
    .slice()
    .sort((a, b) => b.ageMs - a.ageMs);
  for (const l of sorted) if (!pips.has(l.heroId)) pips.set(l.heroId, lobbyAvatar(l));
  return pips;
};

const hostOf = (lobbies: LobbyListing[] | null | undefined, roomId: string | undefined): string => {
  const l = roomId ? (lobbies ?? []).find((x) => x.roomId === roomId) : undefined;
  const name = l ? lobbyHostName(l) : null;
  return name ? `${name}'s table` : "an open table";
};

/**
 * The searching panel's one line of progress. `candidates`/`index` are the
 * QuickMatchSearch walk; `waiting` is true once our own table is open; `seated`
 * is true once the server acked a seat (a join can land in a table that is
 * itself still waiting, e.g. one whose host just left).
 */
export const searchProgressLine = ({
  candidates,
  index,
  waiting,
  seated = false,
  lobbies,
  ownRoomId,
}: {
  candidates: readonly string[];
  index: number;
  waiting: boolean;
  seated?: boolean;
  lobbies: LobbyListing[] | null | undefined;
  ownRoomId?: string | null;
}): string => {
  const filled = index > 0 ? `${capitalise(hostOf(lobbies, candidates[index - 1]))} filled a second ago. ` : "";
  if (!waiting && seated) {
    return `${filled}Seated at ${hostOf(lobbies, candidates[index])} — the game starts the moment it fills.`;
  }
  if (!waiting) {
    return `${filled}Trying ${hostOf(lobbies, candidates[index])}… otherwise your table goes public and the next searcher lands here.`;
  }
  if (!ownRoomId) return `${filled}Opening your table…`;
  const others = lookingCount(lobbies, ownRoomId);
  const tail =
    others === 0
      ? "No one else is searching right now — you're first in line."
      : `${others} other${others === 1 ? " is" : "s are"} waiting too.`;
  return `${filled}Your table is public — the next searcher lands here. ${tail}`;
};

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The opponent the found panel names: the first other HUMAN seat on the room's
 * live roster. Null until ROOM_STATUS lists one.
 */
export const foundOpponent = (
  roster: RoomStatusSeat[] | null | undefined,
  you: string | null | undefined,
): RoomStatusSeat | null => (roster ?? []).find((s) => s.player !== you && !s.bot) ?? null;
