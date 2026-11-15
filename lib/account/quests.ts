/**
 * Quests (issue #1658) — the fetch layer for `GET /me/quests` on the accounts
 * API, plus the reader for the `daily` block `GET /me/stats` gained on the
 * same train.
 *
 * Same contract as the rest of lib/account: never throws, never logs, every
 * failure becomes a typed reason. Two things are specific to this endpoint:
 *
 * 1. **The list is the server's, not ours.** Ids, titles, descriptions, rewards
 *    and progress all arrive evaluated — a quest is done when the API's stats
 *    say so, and nothing here re-derives it. The client's only opinion about an
 *    id is where its row LINKS ({@link questHref}); an id it has never heard of
 *    is an ordinary quest that links to the lobby.
 * 2. **Absent is the normal case.** The client ships ahead of the API, so a 404
 *    (route not deployed), a 503 (no telemetry link) and an empty payload all
 *    mean "render nothing" — never an error state, never a placeholder.
 *
 * The economy numbers (what a quest pays, the daily XP ladder) live in
 * unbrewed-api only. Every number this module handles came off the wire.
 */
import { API_URL } from "./apiUrl";

/** What a quest pays. All parts optional; `note` is the API's own wording. */
export interface QuestReward {
  xp: number | null;
  heroPoints: number | null;
  note: string | null;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  /** `null` = no reward (the cosmetic, say, is its own). */
  reward: QuestReward | null;
  progress: { current: number; target: number };
  done: boolean;
}

export interface QuestBoard {
  /** The "Getting started" checklist, in the API's order. */
  starter: Quest[];
  /** Today's quests. */
  daily: Quest[];
  /** ISO time the dailies reset (next UTC midnight), or null if not sent. */
  resetsAt: string | null;
}

/**
 * The `daily` block of `GET /me/stats`: the day streak and what it pays.
 * Optional on the wire — an API without it means "no daily bonus", and every
 * reader hides its streak UI.
 */
export interface DailyBonus {
  /** Consecutive UTC days played; alive if the last one is today or yesterday. */
  streak: number;
  bestStreak: number;
  playedToday: boolean;
  wonToday: boolean;
  /** What today's first game pays (or paid). */
  playXpToday: number;
  /** What tomorrow's would pay if the streak holds. */
  playXpTomorrow: number;
  firstWinXp: number;
  /** ISO, next UTC midnight; null if not sent. */
  resetsAt: string | null;
}

/** Why the board didn't arrive. `unavailable` is the catch-all → render nothing. */
export type QuestsFailure = "unauthorized" | "rate_limited" | "unavailable";

export type QuestsResult =
  | { ok: true; value: QuestBoard }
  | { ok: false; reason: QuestsFailure };

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** An ISO timestamp that actually parses, else null. */
const asIso = (value: unknown): string | null => {
  const text = asString(value);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
};

/** A reward with nothing in it is no reward: the chip would be empty. */
const normalizeReward = (raw: unknown): QuestReward | null => {
  const row = asRecord(raw);
  if (!row) return null;
  const xp = asCount(row.xp) || null;
  const heroPoints = asCount(row.heroPoints) || null;
  const note = asString(row.note);
  return xp || heroPoints || note ? { xp, heroPoints, note } : null;
};

/**
 * One quest row. An entry without an id is dropped (the link and the React key
 * hang off it); a missing title costs the row its text, not its place.
 *
 * `done` is the API's verdict and is never inferred from progress — but a done
 * quest always reads as full, and progress is clamped into its target so a
 * producer that overshoots ("7/3") can't draw one.
 */
const normalizeQuest = (raw: unknown): Quest | null => {
  const row = asRecord(raw);
  const id = row ? asString(row.id) : null;
  if (!row || !id) return null;
  const done = row.done === true;
  const progress = asRecord(row.progress);
  const target = Math.max(1, asCount(progress?.target) ?? 1);
  const current = done ? target : Math.min(asCount(progress?.current) ?? 0, target);
  return {
    id,
    title: asString(row.title) ?? id,
    description: asString(row.description) ?? "",
    reward: normalizeReward(row.reward),
    progress: { current, target },
    done,
  };
};

const normalizeQuests = (raw: unknown): Quest[] => {
  if (!Array.isArray(raw)) return [];
  const quests: Quest[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const quest = normalizeQuest(entry);
    // A duplicated id would render twice under one key; first wins.
    if (!quest || seen.has(quest.id)) continue;
    seen.add(quest.id);
    quests.push(quest);
  }
  return quests;
};

/** Body → board. Order is the API's and is preserved. */
export const normalizeQuestBoard = (body: unknown): QuestBoard => {
  const root = asRecord(body) ?? {};
  return {
    starter: normalizeQuests(root.starter),
    daily: normalizeQuests(root.daily),
    resetsAt: asIso(root.resetsAt),
  };
};

/** True when there is nothing to draw: the panel renders nothing at all. */
export const isEmptyBoard = (board: QuestBoard): boolean =>
  board.starter.length === 0 && board.daily.length === 0;

/**
 * The `daily` block off a `/me/stats` body, or null when the API didn't send a
 * usable one. `streak` is the one field the block is useless without.
 */
export const normalizeDaily = (raw: unknown): DailyBonus | null => {
  const row = asRecord(raw);
  const streak = row ? asCount(row.streak) : null;
  if (!row || streak === null) return null;
  return {
    streak,
    bestStreak: Math.max(streak, asCount(row.bestStreak) ?? 0),
    playedToday: row.playedToday === true,
    wonToday: row.wonToday === true,
    playXpToday: asCount(row.playXpToday) ?? 0,
    playXpTomorrow: asCount(row.playXpTomorrow) ?? 0,
    firstWinXp: asCount(row.firstWinXp) ?? 0,
    resetsAt: asIso(row.resetsAt),
  };
};

/**
 * The signed-in player's quests.
 *
 * The player id is never sent: the API derives it from the session cookie.
 */
export const fetchQuests = async (): Promise<QuestsResult> => {
  try {
    const res = await fetch(`${API_URL}/me/quests`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      if (res.status === 401) return { ok: false, reason: "unauthorized" };
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      // 404 (an API deployed before the route), 503 (no telemetry link) and
      // everything else land on the same quiet state.
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, value: normalizeQuestBoard(await res.json()) };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
};

// --- presentation helpers ----------------------------------------------------
// Pure, so every line of the panel is testable without a DOM.

/**
 * Where an open quest is done. Each is a door into the lobby carrying one
 * preset, the same doors the /pro launcher uses; an id this build doesn't know
 * goes to the lobby itself, which is never wrong for "go play".
 */
const QUEST_HREFS: Record<string, string> = {
  "first-game": "/pro/game?vs=ai-easy",
  "first-win": "/pro/game?vs=ai-easy",
  "upgrade-card": "/collection",
  "harder-bot": "/pro/game?vs=ai-hard",
  "play-human": "/pro/game?quick=1",
  "three-heroes": "/pro/game?vs=ai",
  "play-today": "/pro/game",
  "win-today": "/pro/game",
};

export const questHref = (id: string): string => QUEST_HREFS[id] ?? "/pro/game";

/** The verb on an open row's link, matching where {@link questHref} goes. */
export const questActionLabel = (id: string): string => {
  const href = questHref(id);
  if (href === "/collection") return "Collection";
  if (href.includes("quick=1")) return "Quick Play";
  if (href.includes("vs=")) return "Play a bot";
  return "Play";
};

/** "+30 XP", "+50 hero points", the API's note, or null for no chip. */
export const rewardLabel = (reward: QuestReward | null): string | null => {
  if (!reward) return null;
  const parts: string[] = [];
  if (reward.xp) parts.push(`+${reward.xp} XP`);
  if (reward.heroPoints) parts.push(`+${reward.heroPoints} hero points`);
  if (parts.length > 0) return parts.join(" · ");
  return reward.note;
};

/** "2/3", only worth showing when the quest takes more than one step. */
export const progressLabel = (quest: Quest): string | null =>
  quest.progress.target > 1
    ? `${quest.progress.current}/${quest.progress.target}`
    : null;

export const doneCount = (quests: Quest[]): number =>
  quests.filter((quest) => quest.done).length;

export const allDone = (quests: Quest[]): boolean =>
  quests.length > 0 && quests.every((quest) => quest.done);

/**
 * "5h 12m" / "12m" / "under a minute" until the reset, or null when there is
 * no usable time or it has already passed (the payload is then a day stale and
 * a countdown would be a lie).
 */
export const resetCountdown = (
  resetsAt: string | null,
  nowMs: number,
): string | null => {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at)) return null;
  const left = at - nowMs;
  if (left <= 0) return null;
  const minutes = Math.floor(left / 60_000);
  if (minutes < 1) return "under a minute";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};

/** The streak chip's copy; shown from day 2, since "Day 1" is not a streak. */
export const STREAK_CHIP_MIN = 2;

export const streakChipLabel = (daily: DailyBonus | null): string | null =>
  daily && daily.streak >= STREAK_CHIP_MIN ? `Day ${daily.streak}` : null;

/**
 * The starter list a GUEST is teased with. Titles only, in the API's order: a
 * guest has no `/me/quests` to read, and the rewards are deliberately left to
 * the API, so this is the one place the client names quests itself.
 */
export const GUEST_STARTER_TEASER: ReadonlyArray<{ id: string; title: string }> = [
  { id: "first-game", title: "Play your first game" },
  { id: "first-win", title: "Win a game" },
  { id: "upgrade-card", title: "Upgrade a card" },
  { id: "harder-bot", title: "Beat a Hard or Expert bot" },
  { id: "play-human", title: "Play another player" },
  { id: "three-heroes", title: "Play three different heroes" },
];
