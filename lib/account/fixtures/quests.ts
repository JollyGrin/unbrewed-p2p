/**
 * `/me/quests` + `/me/stats.daily` fixtures (issue #1658), written as WIRE
 * bodies against the feature/onboarding contract so they exercise the
 * normalizers as well as the panel. The starter list mirrors the api quests
 * ticket (unbrewed-api #163); the numbers are that ticket's, not the client's.
 */
type WireQuest = {
  id: string;
  title: string;
  description: string;
  reward: { xp?: number; heroPoints?: number; note?: string } | null;
  progress: { current: number; target: number };
  done: boolean;
};

const STARTER: WireQuest[] = [
  {
    id: "first-game",
    title: "Play your first game",
    description: "Finish any game, even against the Easy bot.",
    reward: { note: "+100 XP and 50 hero points" },
    progress: { current: 0, target: 1 },
    done: false,
  },
  {
    id: "first-win",
    title: "Win a game",
    description: "Any opponent counts.",
    reward: { xp: 30 },
    progress: { current: 0, target: 1 },
    done: false,
  },
  {
    id: "upgrade-card",
    title: "Upgrade a card",
    description: "Spend hero points on a card finish in your collection.",
    reward: null,
    progress: { current: 0, target: 1 },
    done: false,
  },
  {
    id: "harder-bot",
    title: "Beat a Hard or Expert bot",
    description: "Step up from the practice tiers.",
    reward: { xp: 30 },
    progress: { current: 0, target: 1 },
    done: false,
  },
  {
    id: "play-human",
    title: "Play another player",
    description: "Quick Play pairs you with the next player.",
    reward: { xp: 30 },
    progress: { current: 0, target: 1 },
    done: false,
  },
  {
    id: "three-heroes",
    title: "Play three different heroes",
    description: "Each new hero's first game pays hero points.",
    reward: { note: "+50 hero points per new hero" },
    progress: { current: 0, target: 3 },
    done: false,
  },
];

const starter = (done: Record<string, number | true>): WireQuest[] =>
  STARTER.map((quest) => {
    const mark = done[quest.id];
    if (mark === undefined) return quest;
    if (mark === true) {
      return { ...quest, done: true, progress: { ...quest.progress, current: quest.progress.target } };
    }
    return { ...quest, progress: { ...quest.progress, current: mark } };
  });

const dailies = (playXp: number, played: boolean, won: boolean): WireQuest[] => [
  {
    id: "play-today",
    title: "Play a game today",
    description: "Your first finished game of the day.",
    reward: { xp: playXp },
    progress: { current: played ? 1 : 0, target: 1 },
    done: played,
  },
  {
    id: "win-today",
    title: "Win a game today",
    description: "Your first win of the day.",
    reward: { xp: 20 },
    progress: { current: won ? 1 : 0, target: 1 },
    done: won,
  },
];

export const QUESTS_RESETS_AT = "2026-11-16T00:00:00.000Z";
/** A "now" 5h 12m before {@link QUESTS_RESETS_AT}. */
export const QUESTS_NOW_MS = Date.parse("2026-11-15T18:48:00.000Z");

const daily = (over: Record<string, unknown>) => ({
  streak: 0,
  bestStreak: 0,
  playedToday: false,
  wonToday: false,
  playXpToday: 10,
  playXpTomorrow: 15,
  firstWinXp: 20,
  resetsAt: QUESTS_RESETS_AT,
  ...over,
});

export interface QuestsFixture {
  /** `GET /me/quests` body. */
  quests: unknown;
  /** The `daily` block of `GET /me/stats`. */
  daily: unknown;
}

export const QUEST_FIXTURES = {
  /** A brand-new account: everything open, no streak. */
  brandNew: {
    quests: { starter: starter({}), daily: dailies(10, false, false), resetsAt: QUESTS_RESETS_AT },
    daily: daily({}),
  },
  /** Half the checklist done, a 3-day run, today played but not won. */
  halfDone: {
    quests: {
      starter: starter({ "first-game": true, "first-win": true, "upgrade-card": true, "three-heroes": 2 }),
      daily: dailies(20, true, false),
      resetsAt: QUESTS_RESETS_AT,
    },
    daily: daily({ streak: 3, bestStreak: 5, playedToday: true, playXpToday: 20, playXpTomorrow: 25 }),
  },
  /** Checklist finished, dailies both done on day 6 of a run. */
  allDone: {
    quests: {
      starter: starter({
        "first-game": true,
        "first-win": true,
        "upgrade-card": true,
        "harder-bot": true,
        "play-human": true,
        "three-heroes": true,
      }),
      daily: dailies(30, true, true),
      resetsAt: QUESTS_RESETS_AT,
    },
    daily: daily({
      streak: 6,
      bestStreak: 6,
      playedToday: true,
      wonToday: true,
      playXpToday: 30,
      playXpTomorrow: 30,
    }),
  },
  /** Checklist finished, a live 2-day run, nothing played yet today. */
  dailyOpen: {
    quests: {
      starter: starter({
        "first-game": true,
        "first-win": true,
        "upgrade-card": true,
        "harder-bot": true,
        "play-human": true,
        "three-heroes": true,
      }),
      daily: dailies(20, false, false),
      resetsAt: QUESTS_RESETS_AT,
    },
    daily: daily({ streak: 2, bestStreak: 4, playXpToday: 20, playXpTomorrow: 25 }),
  },
} satisfies Record<string, QuestsFixture>;

export type QuestFixtureName = keyof typeof QUEST_FIXTURES;
